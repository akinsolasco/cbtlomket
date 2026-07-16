const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/app");

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lomket-cbt-"));
  const { server } = createApp({
    dbPath: path.join(tempDir, "lomket-db.json"),
    port: 0
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  let cookie = "";

  async function request(route, options = {}) {
    const response = await fetch(`${base}${route}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`${route} failed: ${payload.message || response.status}`);
    }
    return payload;
  }

  try {
    const health = await request("/api/health");
    assert(health.ok, "health check");

    await request("/api/admin/login", {
      method: "POST",
      body: { username: "admin", password: "Lomket@2026" }
    });

    const students = (await request("/api/admin/students")).students;
    const examSets = (await request("/api/admin/exam-sets")).examSets;
    const questionBank = (await request("/api/admin/question-bank")).questions;
    assert(students.length > 0, "seed students");
    assert(examSets.length > 0, "seed exam sets");
    assert(questionBank.length >= 10, "question bank samples");

    const editedStudent = (
      await request(`/api/admin/students/${students[0].id}`, {
        method: "PUT",
        body: {
          userId: students[0].userId,
          firstName: "Ada",
          lastName: "Updated",
          groupName: "Smoke Test Group",
          email: "ada.updated@example.com",
          status: "active"
        }
      })
    ).student;
    assert(editedStudent.lastName === "Updated", "student edit");

    const assignment = (
      await request("/api/admin/assignments", {
        method: "POST",
        body: {
          examSetId: examSets[0].id,
          title: "Smoke Test Assignment",
          studentIds: [students[0].id]
        }
      })
    ).assignment;
    await request(`/api/admin/assignments/${assignment.id}/live`, { method: "POST" });

    const status = await request(`/api/exam/${assignment.accessSlug}/status`);
    assert(status.active, "student link active");

    const login = await request(`/api/exam/${assignment.accessSlug}/login`, {
      method: "POST",
      body: {
        userId: students[0].userId,
        password: students[0].tempPassword
      }
    });
    assert(login.attemptToken, "student token");

    const adminExam = examSets[0];
    const answers = {};
    for (const question of adminExam.questions) {
      if (question.type === "multiple-choice") {
        answers[question.id] = question.options.find((option) => option.correct).id;
      } else if (question.type === "typed" && question.acceptedAnswers?.length) {
        answers[question.id] = question.acceptedAnswers[0];
      } else {
        answers[question.id] = "Manual answer provided during smoke test.";
      }
    }

    const submitted = await request(`/api/student/attempts/${login.attempt.id}/submit`, {
      method: "POST",
      token: login.attemptToken,
      body: { answers }
    });
    assert(submitted.attempt.needsManual, "manual marking needed");

    const attempts = (await request("/api/admin/attempts")).attempts;
    const attempt = attempts.find((item) => item.id === login.attempt.id);
    const manualGrades = {};
    for (const question of adminExam.questions) {
      const isManual =
        question.type === "theory" ||
        question.type === "practical" ||
        (question.type === "typed" && (!question.acceptedAnswers || question.acceptedAnswers.length === 0));
      if (isManual) {
        manualGrades[question.id] = { score: question.points, feedback: "Smoke test full mark." };
      }
    }

    const graded = await request(`/api/admin/attempts/${attempt.id}/grade`, {
      method: "PUT",
      body: { manualGrades }
    });
    assert(graded.attempt.status === "graded", "attempt graded");

    console.log("Smoke test passed: admin login, assignment, student login, submission, and marking all work.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function assert(condition, label) {
  if (!condition) {
    throw new Error(`Assertion failed: ${label}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
