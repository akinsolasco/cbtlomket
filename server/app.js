const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const {
  constantTimeTextMatch,
  hashPassword,
  id,
  nowIso,
  randomToken,
  semverCompare,
  slugify,
  studentTempPassword,
  verifyPassword
} = require("./security");
const { getQuestionBank } = require("./question-bank");
const { APP_VERSION, Store } = require("./store");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const UPDATE_DIR = path.join(__dirname, "..", "updates");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function createApp(options = {}) {
  const dbPath =
    options.dbPath ||
    process.env.LOMKET_DB_PATH ||
    path.join(process.cwd(), "data", "lomket-db.json");
  const store = new Store(dbPath);

  const server = http.createServer((request, response) => {
    handleRequest(request, response, store, options).catch((error) => {
      console.error(error);
      sendJson(response, 500, {
        error: "server_error",
        message: "The server hit a problem. Please try again."
      });
    });
  });

  return { server, store, dbPath };
}

async function handleRequest(request, response, store, options) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  setBaseHeaders(response);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, store, url, options);
    return;
  }

  serveStatic(response, url.pathname);
}

async function handleApi(request, response, store, url, options) {
  const { method } = request;
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      version: APP_VERSION,
      serverTime: nowIso()
    });
    return;
  }

  if (method === "GET" && pathname === "/api/bootstrap") {
    const db = store.read();
    sendJson(response, 200, {
      ok: true,
      appName: db.settings.appName,
      organizationName: db.settings.organizationName,
      version: APP_VERSION,
      serverTime: nowIso(),
      network: getNetworkUrls(request, options),
      firstLaunch: db.settings.forcePasswordChange,
      defaultAdmin: db.settings.forcePasswordChange
        ? { username: "admin", password: "Lomket@2026" }
        : null
    });
    return;
  }

  if (method === "POST" && pathname === "/api/admin/login") {
    if (!isLocalAdminRequest(request)) {
      sendJson(response, 403, {
        error: "desktop_admin_only",
        message: "Admin access is only available from the Lomket CBT desktop app on the server computer."
      });
      return;
    }
    const body = await readJson(request);
    const db = store.read();
    const usernameOk = String(body.username || "").trim() === db.settings.adminUsername;
    const passwordOk = verifyPassword(body.password || "", db.settings.adminPasswordHash);

    if (!usernameOk || !passwordOk) {
      sendJson(response, 401, {
        error: "invalid_login",
        message: "Incorrect admin username or password."
      });
      return;
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
    store.mutate((next) => {
      next.adminSessions.push({ token, createdAt: nowIso(), expiresAt });
      store.audit("admin", "admin_login", "Admin signed in.");
    });

    response.setHeader("Set-Cookie", cookie("lomket_session", token, 60 * 60 * 12));
    sendJson(response, 200, {
      ok: true,
      admin: adminProfile(store.read())
    });
    return;
  }

  if (method === "POST" && pathname === "/api/admin/logout") {
    const token = parseCookies(request).lomket_session;
    if (token) {
      store.mutate((next) => {
        next.adminSessions = next.adminSessions.filter((session) => session.token !== token);
      });
    }
    response.setHeader("Set-Cookie", cookie("lomket_session", "", 0));
    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname.startsWith("/api/admin/")) {
    if (!isLocalAdminRequest(request)) {
      sendJson(response, 403, {
        error: "desktop_admin_only",
        message: "Admin access is only available from the Lomket CBT desktop app on the server computer."
      });
      return;
    }
    const admin = requireAdmin(request, response, store);
    if (!admin) return;
    await handleAdminApi(request, response, store, url, options);
    return;
  }

  if (pathname.startsWith("/api/exam/") || pathname.startsWith("/api/student/")) {
    await handleStudentApi(request, response, store, url);
    return;
  }

  sendJson(response, 404, {
    error: "not_found",
    message: "API route not found."
  });
}

async function handleAdminApi(request, response, store, url, options) {
  const { method } = request;
  const pathname = url.pathname;
  const db = store.read();

  if (method === "GET" && pathname === "/api/admin/me") {
    sendJson(response, 200, {
      ok: true,
      admin: adminProfile(db)
    });
    return;
  }

  if (method === "GET" && pathname === "/api/admin/overview") {
    sendJson(response, 200, buildOverview(db, request, options));
    return;
  }

  if (method === "GET" && pathname === "/api/admin/students") {
    sendJson(response, 200, { students: db.students.map(sanitizeStudentForAdmin) });
    return;
  }

  if (method === "POST" && pathname === "/api/admin/students") {
    const body = await readJson(request);
    const created = cleanStudentInput(body);
    if (!created.userId || !created.firstName) {
      sendJson(response, 400, {
        error: "invalid_student",
        message: "Student ID and first name are required."
      });
      return;
    }

    const exists = db.students.some(
      (student) => student.userId.toLowerCase() === created.userId.toLowerCase()
    );
    if (exists) {
      sendJson(response, 409, {
        error: "duplicate_student",
        message: "A student with that user ID already exists."
      });
      return;
    }

    const student = {
      id: id("stu"),
      ...created,
      status: created.status || "active",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.mutate((next) => {
      next.students.push(student);
      store.audit("admin", "student_created", `Created student ${student.userId}.`);
    });
    sendJson(response, 201, { student: sanitizeStudentForAdmin(student) });
    return;
  }

  const studentMatch = pathname.match(/^\/api\/admin\/students\/([^/]+)$/);
  if (studentMatch && method === "PUT") {
    const body = await readJson(request);
    const studentId = decodeURIComponent(studentMatch[1]);
    let updated = null;
    const input = cleanStudentInput(body);
    if (!input.userId || !input.firstName) {
      sendJson(response, 400, {
        error: "invalid_student",
        message: "Student ID and first name are required."
      });
      return;
    }
    const duplicate = db.students.some(
      (student) =>
        student.id !== studentId && student.userId.toLowerCase() === input.userId.toLowerCase()
    );
    if (duplicate) {
      sendJson(response, 409, {
        error: "duplicate_student",
        message: "Another student already uses that user ID."
      });
      return;
    }
    store.mutate((next) => {
      const student = next.students.find((item) => item.id === studentId);
      if (!student) return;
      Object.assign(student, input, { updatedAt: nowIso() });
      updated = sanitizeStudentForAdmin(student);
      store.audit("admin", "student_updated", `Updated student ${student.userId}.`);
    });
    if (!updated) {
      sendJson(response, 404, { error: "not_found", message: "Student not found." });
      return;
    }
    sendJson(response, 200, { student: updated });
    return;
  }

  if (studentMatch && method === "DELETE") {
    const studentId = decodeURIComponent(studentMatch[1]);
    store.mutate((next) => {
      next.students = next.students.filter((student) => student.id !== studentId);
      next.assignments.forEach((assignment) => {
        assignment.studentIds = assignment.studentIds.filter((idValue) => idValue !== studentId);
      });
      store.audit("admin", "student_deleted", `Deleted student ${studentId}.`);
    });
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "GET" && pathname === "/api/admin/exam-sets") {
    sendJson(response, 200, { examSets: db.examSets });
    return;
  }

  if (method === "GET" && pathname === "/api/admin/question-bank") {
    sendJson(response, 200, { questions: getQuestionBank() });
    return;
  }

  if (method === "POST" && pathname === "/api/admin/exam-sets") {
    const body = await readJson(request);
    const examSet = cleanExamSetInput(body);
    if (!examSet.title || examSet.questions.length === 0) {
      sendJson(response, 400, {
        error: "invalid_exam_set",
        message: "Exam title and at least one question are required."
      });
      return;
    }
    examSet.id = id("exam");
    examSet.createdAt = nowIso();
    examSet.updatedAt = nowIso();
    store.mutate((next) => {
      next.examSets.push(examSet);
      store.audit("admin", "exam_set_created", `Created exam set ${examSet.title}.`);
    });
    sendJson(response, 201, { examSet });
    return;
  }

  const examMatch = pathname.match(/^\/api\/admin\/exam-sets\/([^/]+)$/);
  if (examMatch && method === "PUT") {
    const examId = decodeURIComponent(examMatch[1]);
    const body = await readJson(request);
    const input = cleanExamSetInput(body);
    let updated = null;
    store.mutate((next) => {
      const examSet = next.examSets.find((item) => item.id === examId);
      if (!examSet) return;
      Object.assign(examSet, input, { id: examId, updatedAt: nowIso() });
      updated = examSet;
      store.audit("admin", "exam_set_updated", `Updated exam set ${examSet.title}.`);
    });
    if (!updated) {
      sendJson(response, 404, { error: "not_found", message: "Exam set not found." });
      return;
    }
    sendJson(response, 200, { examSet: updated });
    return;
  }

  if (examMatch && method === "DELETE") {
    const examId = decodeURIComponent(examMatch[1]);
    const used = db.assignments.some((assignment) => assignment.examSetId === examId);
    if (used) {
      sendJson(response, 409, {
        error: "exam_in_use",
        message: "This exam set has assignments. Close or delete assignments first."
      });
      return;
    }
    store.mutate((next) => {
      next.examSets = next.examSets.filter((examSet) => examSet.id !== examId);
      store.audit("admin", "exam_set_deleted", `Deleted exam set ${examId}.`);
    });
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "GET" && pathname === "/api/admin/assignments") {
    sendJson(response, 200, { assignments: db.assignments.map((item) => enrichAssignment(item, db)) });
    return;
  }

  if (method === "POST" && pathname === "/api/admin/assignments") {
    const body = await readJson(request);
    const examSet = db.examSets.find((item) => item.id === body.examSetId);
    if (!examSet) {
      sendJson(response, 400, { error: "invalid_exam", message: "Choose a valid exam set." });
      return;
    }
    const studentIds = Array.isArray(body.studentIds)
      ? body.studentIds.filter((studentId) => db.students.some((student) => student.id === studentId))
      : [];
    if (studentIds.length === 0) {
      sendJson(response, 400, {
        error: "no_students",
        message: "Assign the exam to at least one student."
      });
      return;
    }

    const assignment = {
      id: id("assign"),
      examSetId: examSet.id,
      title: String(body.title || examSet.title).trim(),
      accessSlug: slugify(examSet.title),
      studentIds,
      status: "draft",
      startAt: body.startAt || null,
      endAt: body.endAt || null,
      allowRetake: Boolean(body.allowRetake),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.mutate((next) => {
      next.assignments.push(assignment);
      store.audit("admin", "assignment_created", `Created assignment ${assignment.title}.`);
    });
    sendJson(response, 201, { assignment: enrichAssignment(assignment, store.read()) });
    return;
  }

  const assignmentActionMatch = pathname.match(/^\/api\/admin\/assignments\/([^/]+)\/(live|close)$/);
  if (assignmentActionMatch && method === "POST") {
    const assignmentId = decodeURIComponent(assignmentActionMatch[1]);
    const action = assignmentActionMatch[2];
    let updated = null;
    store.mutate((next) => {
      const assignment = next.assignments.find((item) => item.id === assignmentId);
      if (!assignment) return;
      assignment.status = action === "live" ? "live" : "closed";
      assignment.updatedAt = nowIso();
      updated = enrichAssignment(assignment, next);
      store.audit("admin", `assignment_${assignment.status}`, `${assignment.title} is now ${assignment.status}.`);
    });
    if (!updated) {
      sendJson(response, 404, { error: "not_found", message: "Assignment not found." });
      return;
    }
    sendJson(response, 200, { assignment: updated });
    return;
  }

  const assignmentMatch = pathname.match(/^\/api\/admin\/assignments\/([^/]+)$/);
  if (assignmentMatch && method === "PUT") {
    const assignmentId = decodeURIComponent(assignmentMatch[1]);
    const body = await readJson(request);
    let updated = null;
    store.mutate((next) => {
      const assignment = next.assignments.find((item) => item.id === assignmentId);
      if (!assignment || assignment.status === "closed") return;
      const validStudents = Array.isArray(body.studentIds)
        ? body.studentIds.filter((studentId) => next.students.some((student) => student.id === studentId))
        : assignment.studentIds;
      Object.assign(assignment, {
        title: String(body.title || assignment.title).trim(),
        studentIds: validStudents,
        startAt: body.startAt || null,
        endAt: body.endAt || null,
        allowRetake: Boolean(body.allowRetake),
        updatedAt: nowIso()
      });
      updated = enrichAssignment(assignment, next);
      store.audit("admin", "assignment_updated", `Updated assignment ${assignment.title}.`);
    });
    if (!updated) {
      sendJson(response, 404, { error: "not_found", message: "Assignment not found or closed." });
      return;
    }
    sendJson(response, 200, { assignment: updated });
    return;
  }

  if (assignmentMatch && method === "DELETE") {
    const assignmentId = decodeURIComponent(assignmentMatch[1]);
    const hasAttempts = db.attempts.some((attempt) => attempt.assignmentId === assignmentId);
    if (hasAttempts) {
      sendJson(response, 409, {
        error: "assignment_has_attempts",
        message: "This assignment already has attempts. Close it instead of deleting it."
      });
      return;
    }
    store.mutate((next) => {
      next.assignments = next.assignments.filter((assignment) => assignment.id !== assignmentId);
      store.audit("admin", "assignment_deleted", `Deleted assignment ${assignmentId}.`);
    });
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "GET" && pathname === "/api/admin/attempts") {
    sendJson(response, 200, {
      attempts: db.attempts.map((attempt) => enrichAttempt(attempt, db))
    });
    return;
  }

  const gradeMatch = pathname.match(/^\/api\/admin\/attempts\/([^/]+)\/grade$/);
  if (gradeMatch && method === "PUT") {
    const attemptId = decodeURIComponent(gradeMatch[1]);
    const body = await readJson(request);
    let graded = null;
    store.mutate((next) => {
      const attempt = next.attempts.find((item) => item.id === attemptId);
      if (!attempt) return;
      const examSet = next.examSets.find((item) => item.id === attempt.examSetId);
      if (!examSet) return;
      attempt.manualGrades = cleanManualGrades(body.manualGrades || {}, examSet);
      finalizeScore(attempt, examSet);
      attempt.gradedAt = attempt.needsManual ? null : nowIso();
      attempt.updatedAt = nowIso();
      graded = enrichAttempt(attempt, next);
      store.audit("admin", "attempt_graded", `Updated marking for attempt ${attempt.id}.`);
    });
    if (!graded) {
      sendJson(response, 404, { error: "not_found", message: "Attempt not found." });
      return;
    }
    sendJson(response, 200, { attempt: graded });
    return;
  }

  if (method === "GET" && pathname === "/api/admin/results.csv") {
    sendCsv(response, resultsCsv(db));
    return;
  }

  if (method === "GET" && pathname === "/api/admin/settings") {
    sendJson(response, 200, {
      settings: publicSettings(db, store.filePath),
      network: getNetworkUrls(request, options)
    });
    return;
  }

  if (method === "PUT" && pathname === "/api/admin/settings") {
    const body = await readJson(request);
    store.mutate((next) => {
      next.settings.appName = String(body.appName || next.settings.appName).trim();
      next.settings.organizationName = String(body.organizationName || next.settings.organizationName).trim();
      next.settings.defaultShowScoreImmediately = Boolean(body.defaultShowScoreImmediately);
      next.settings.recoveryContact = String(body.recoveryContact || next.settings.recoveryContact).trim();
      next.settings.update.repository = String(body.updateRepository || next.settings.update.repository).trim();
      next.settings.update.autoCheck = Boolean(body.updateAutoCheck);
      store.audit("admin", "settings_updated", "Updated application settings.");
    });
    sendJson(response, 200, {
      settings: publicSettings(store.read(), store.filePath)
    });
    return;
  }

  if (method === "POST" && pathname === "/api/admin/change-password") {
    const body = await readJson(request);
    const currentOk = verifyPassword(body.currentPassword || "", db.settings.adminPasswordHash);
    const nextPassword = String(body.newPassword || "");
    if (!currentOk) {
      sendJson(response, 401, {
        error: "bad_current_password",
        message: "Current password is incorrect."
      });
      return;
    }
    if (nextPassword.length < 8) {
      sendJson(response, 400, {
        error: "weak_password",
        message: "Use at least 8 characters for the new password."
      });
      return;
    }
    store.mutate((next) => {
      next.settings.adminPasswordHash = hashPassword(nextPassword);
      next.settings.forcePasswordChange = false;
      next.adminSessions = [];
      store.audit("admin", "password_changed", "Admin password changed.");
    });
    response.setHeader("Set-Cookie", cookie("lomket_session", "", 0));
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "POST" && pathname === "/api/admin/update/check") {
    const result = await checkForUpdate(store);
    sendJson(response, 200, result);
    return;
  }

  if (method === "POST" && pathname === "/api/admin/update/download") {
    const body = await readJson(request);
    const result = await downloadUpdate(store, body.assetUrl);
    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 404, {
    error: "not_found",
    message: "Admin route not found."
  });
}

async function handleStudentApi(request, response, store, url) {
  const { method } = request;
  const pathname = url.pathname;
  const statusMatch = pathname.match(/^\/api\/exam\/([^/]+)\/status$/);
  const loginMatch = pathname.match(/^\/api\/exam\/([^/]+)\/login$/);

  if (statusMatch && method === "GET") {
    const slug = decodeURIComponent(statusMatch[1]);
    const db = store.read();
    const assignment = db.assignments.find((item) => item.accessSlug === slug);
    const examSet = assignment && db.examSets.find((item) => item.id === assignment.examSetId);
    if (!assignment || !examSet || !isAssignmentAvailable(assignment)) {
      sendJson(response, 200, {
        active: false,
        message: "No active exam now."
      });
      return;
    }
    sendJson(response, 200, {
      active: true,
      title: assignment.title || examSet.title,
      examTitle: examSet.title,
      durationMinutes: examSet.durationMinutes,
      instructions: examSet.instructions
    });
    return;
  }

  if (loginMatch && method === "POST") {
    const slug = decodeURIComponent(loginMatch[1]);
    const body = await readJson(request);
    const login = studentLogin(store, slug, body.userId, body.password);
    sendJson(response, login.status, login.payload);
    return;
  }

  const saveMatch = pathname.match(/^\/api\/student\/attempts\/([^/]+)\/answer$/);
  if (saveMatch && method === "POST") {
    const tokenResult = requireStudentSession(request, response, store);
    if (!tokenResult) return;
    const attemptId = decodeURIComponent(saveMatch[1]);
    if (tokenResult.attempt.id !== attemptId) {
      sendJson(response, 403, {
        error: "wrong_attempt",
        message: "This exam session does not match the attempt."
      });
      return;
    }
    const body = await readJson(request);
    const saved = saveStudentAnswer(store, tokenResult.attempt, body);
    sendJson(response, saved.status, saved.payload);
    return;
  }

  const submitMatch = pathname.match(/^\/api\/student\/attempts\/([^/]+)\/submit$/);
  if (submitMatch && method === "POST") {
    const tokenResult = requireStudentSession(request, response, store);
    if (!tokenResult) return;
    const attemptId = decodeURIComponent(submitMatch[1]);
    if (tokenResult.attempt.id !== attemptId) {
      sendJson(response, 403, {
        error: "wrong_attempt",
        message: "This exam session does not match the attempt."
      });
      return;
    }
    const body = await readJson(request);
    const submitted = submitStudentAttempt(store, tokenResult.attempt, body.answers || {});
    sendJson(response, submitted.status, submitted.payload);
    return;
  }

  sendJson(response, 404, {
    error: "not_found",
    message: "Student route not found."
  });
}

function adminProfile(db) {
  return {
    username: db.settings.adminUsername,
    appName: db.settings.appName,
    forcePasswordChange: db.settings.forcePasswordChange,
    version: APP_VERSION
  };
}

function buildOverview(db, request, options) {
  const liveAssignments = db.assignments.filter((assignment) => assignment.status === "live");
  const pendingManual = db.attempts.filter((attempt) => attempt.needsManual).length;
  const gradedAttempts = db.attempts.filter((attempt) => attempt.status === "graded").length;
  const activeStudents = db.students.filter((student) => student.status !== "inactive").length;
  return {
    version: APP_VERSION,
    appName: db.settings.appName,
    organizationName: db.settings.organizationName,
    network: getNetworkUrls(request, options),
    counts: {
      students: db.students.length,
      activeStudents,
      examSets: db.examSets.length,
      liveAssignments: liveAssignments.length,
      attempts: db.attempts.length,
      pendingManual,
      gradedAttempts
    },
    recentAttempts: db.attempts
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt || b.startedAt) - Date.parse(a.updatedAt || a.startedAt))
      .slice(0, 6)
      .map((attempt) => enrichAttempt(attempt, db)),
    liveAssignments: liveAssignments.map((assignment) => enrichAssignment(assignment, db))
  };
}

function cleanStudentInput(body) {
  return {
    userId: String(body.userId || "").trim(),
    firstName: String(body.firstName || "").trim(),
    lastName: String(body.lastName || "").trim(),
    groupName: String(body.groupName || "").trim(),
    email: String(body.email || "").trim(),
    status: body.status === "inactive" ? "inactive" : "active"
  };
}

function sanitizeStudentForAdmin(student) {
  return {
    ...student,
    tempPassword: studentTempPassword(student)
  };
}

function cleanExamSetInput(body) {
  const questions = Array.isArray(body.questions) ? body.questions : [];
  return {
    title: String(body.title || "").trim(),
    subject: String(body.subject || "").trim(),
    durationMinutes: clampNumber(body.durationMinutes, 5, 480, 45),
    passingScore: clampNumber(body.passingScore, 0, 100, 60),
    showScoreImmediately: Boolean(body.showScoreImmediately),
    shuffleQuestions: Boolean(body.shuffleQuestions),
    instructions: String(body.instructions || "").trim(),
    questions: questions.map(cleanQuestion).filter(Boolean)
  };
}

function cleanQuestion(question) {
  const allowedTypes = new Set(["multiple-choice", "typed", "theory", "practical"]);
  const type = allowedTypes.has(question.type) ? question.type : "multiple-choice";
  const cleaned = {
    id: question.id || id("q"),
    type,
    topic: String(question.topic || "").trim(),
    points: clampNumber(question.points, 1, 1000, 5),
    prompt: String(question.prompt || "").trim()
  };
  if (!cleaned.prompt) return null;

  if (type === "multiple-choice") {
    const options = Array.isArray(question.options) ? question.options : [];
    cleaned.options = options
      .map((option) => ({
        id: option.id || id("opt"),
        text: String(option.text || "").trim(),
        correct: Boolean(option.correct)
      }))
      .filter((option) => option.text);
    if (cleaned.options.length < 2) return null;
    if (!cleaned.options.some((option) => option.correct)) cleaned.options[0].correct = true;
  }

  if (type === "typed") {
    cleaned.acceptedAnswers = Array.isArray(question.acceptedAnswers)
      ? question.acceptedAnswers.map((answer) => String(answer || "").trim()).filter(Boolean)
      : [];
    cleaned.rubric = String(question.rubric || "").trim();
  }

  if (type === "theory" || type === "practical") {
    cleaned.rubric = String(question.rubric || "").trim();
  }

  return cleaned;
}

function cleanManualGrades(manualGrades, examSet) {
  const result = {};
  for (const question of examSet.questions) {
    if (!isManualQuestion(question)) continue;
    const grade = manualGrades[question.id] || {};
    const hasScore = grade.score !== "" && grade.score !== null && grade.score !== undefined;
    if (!hasScore) continue;
    result[question.id] = {
      score: clampNumber(grade.score, 0, Number(question.points) || 0, 0),
      feedback: String(grade.feedback || "").trim()
    };
  }
  return result;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function enrichAssignment(assignment, db) {
  const examSet = db.examSets.find((item) => item.id === assignment.examSetId);
  const attempts = db.attempts.filter((attempt) => attempt.assignmentId === assignment.id);
  return {
    ...assignment,
    examTitle: examSet ? examSet.title : "Missing exam set",
    durationMinutes: examSet ? examSet.durationMinutes : 0,
    studentCount: assignment.studentIds.length,
    attemptCount: attempts.length,
    submittedCount: attempts.filter((attempt) => attempt.status !== "in_progress").length,
    isAvailable: isAssignmentAvailable(assignment)
  };
}

function enrichAttempt(attempt, db) {
  const student = db.students.find((item) => item.id === attempt.studentId);
  const examSet = db.examSets.find((item) => item.id === attempt.examSetId);
  const assignment = db.assignments.find((item) => item.id === attempt.assignmentId);
  const maxScore = examSet ? maxScoreForExam(examSet) : attempt.maxScore || 0;
  const totalScore = Number(attempt.totalScore || 0);
  return {
    ...attempt,
    studentName: student ? `${student.firstName} ${student.lastName}`.trim() : "Unknown student",
    studentUserId: student ? student.userId : "",
    examTitle: examSet ? examSet.title : "Missing exam",
    assignmentTitle: assignment ? assignment.title : "",
    showScoreImmediately: examSet ? Boolean(examSet.showScoreImmediately) : false,
    maxScore,
    percentage: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0
  };
}

function publicSettings(db, dataPath) {
  return {
    appName: db.settings.appName,
    organizationName: db.settings.organizationName,
    version: APP_VERSION,
    defaultShowScoreImmediately: db.settings.defaultShowScoreImmediately,
    recoveryContact: db.settings.recoveryContact,
    updateRepository: db.settings.update.repository,
    updateAutoCheck: db.settings.update.autoCheck,
    updateLastCheckAt: db.settings.update.lastCheckAt,
    updateLastResult: db.settings.update.lastResult,
    downloadedFile: db.settings.update.downloadedFile,
    dataPath
  };
}

function isAssignmentAvailable(assignment) {
  if (!assignment || assignment.status !== "live") return false;
  const now = Date.now();
  if (assignment.startAt && Date.parse(assignment.startAt) > now) return false;
  if (assignment.endAt && Date.parse(assignment.endAt) < now) return false;
  return true;
}

function studentLogin(store, slug, userId, password) {
  const db = store.read();
  const assignment = db.assignments.find((item) => item.accessSlug === slug);
  const examSet = assignment && db.examSets.find((item) => item.id === assignment.examSetId);
  if (!assignment || !examSet || !isAssignmentAvailable(assignment)) {
    return {
      status: 404,
      payload: { error: "no_active_exam", message: "No active exam now." }
    };
  }

  const student = db.students.find(
    (item) => item.userId.toLowerCase() === String(userId || "").trim().toLowerCase()
  );
  if (!student || student.status === "inactive" || !assignment.studentIds.includes(student.id)) {
    return {
      status: 403,
      payload: {
        error: "not_assigned",
        message: "No active exam is assigned to this student ID."
      }
    };
  }

  if (!constantTimeTextMatch(password, studentTempPassword(student))) {
    return {
      status: 401,
      payload: { error: "bad_student_password", message: "Temporary password is incorrect." }
    };
  }

  const existingSubmitted = db.attempts.find(
    (attempt) =>
      attempt.assignmentId === assignment.id &&
      attempt.studentId === student.id &&
      attempt.status !== "in_progress"
  );
  if (existingSubmitted && !assignment.allowRetake) {
    return {
      status: 409,
      payload: {
        error: "already_submitted",
        message: "This exam has already been submitted for this student."
      }
    };
  }

  let attempt = db.attempts.find(
    (item) =>
      item.assignmentId === assignment.id &&
      item.studentId === student.id &&
      item.status === "in_progress"
  );

  const expiresAt = new Date(Date.now() + examSet.durationMinutes * 60 * 1000 + 60 * 60 * 1000).toISOString();
  const token = randomToken();
  store.mutate((next) => {
    if (!attempt) {
      attempt = {
        id: id("attempt"),
        assignmentId: assignment.id,
        examSetId: examSet.id,
        studentId: student.id,
        status: "in_progress",
        answers: {},
        manualGrades: {},
        autoScore: 0,
        manualScore: 0,
        totalScore: 0,
        maxScore: maxScoreForExam(examSet),
        needsManual: false,
        startedAt: nowIso(),
        submittedAt: null,
        updatedAt: nowIso()
      };
      next.attempts.push(attempt);
    }
    next.studentSessions.push({
      token,
      attemptId: attempt.id,
      studentId: student.id,
      createdAt: nowIso(),
      expiresAt
    });
    store.audit(student.userId, "student_login", `Started ${examSet.title}.`);
  });

  return {
    status: 200,
    payload: {
      ok: true,
      attemptToken: token,
      attempt: {
        id: attempt.id,
        startedAt: attempt.startedAt,
        answers: attempt.answers || {}
      },
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        userId: student.userId
      },
      assignment: {
        id: assignment.id,
        title: assignment.title,
        accessSlug: assignment.accessSlug
      },
      exam: sanitizeExamForStudent(examSet)
    }
  };
}

function sanitizeExamForStudent(examSet) {
  const questions = examSet.questions.map((question) => {
    const safe = {
      id: question.id,
      type: question.type,
      topic: question.topic,
      points: question.points,
      prompt: question.prompt
    };
    if (question.type === "multiple-choice") {
      safe.options = question.options.map((option) => ({
        id: option.id,
        text: option.text
      }));
    }
    return safe;
  });
  return {
    id: examSet.id,
    title: examSet.title,
    subject: examSet.subject,
    durationMinutes: examSet.durationMinutes,
    passingScore: examSet.passingScore,
    instructions: examSet.instructions,
    showScoreImmediately: examSet.showScoreImmediately,
    questions: examSet.shuffleQuestions ? shuffle(questions) : questions,
    maxScore: maxScoreForExam(examSet)
  };
}

function requireStudentSession(request, response, store) {
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const db = store.read();
  const session = db.studentSessions.find(
    (item) => item.token === token && Date.parse(item.expiresAt) > Date.now()
  );
  if (!session) {
    sendJson(response, 401, {
      error: "student_session_expired",
      message: "Exam session expired. Please sign in again."
    });
    return null;
  }
  const attempt = db.attempts.find((item) => item.id === session.attemptId);
  if (!attempt) {
    sendJson(response, 404, { error: "not_found", message: "Attempt not found." });
    return null;
  }
  return { session, attempt };
}

function saveStudentAnswer(store, attempt, body) {
  if (attempt.status !== "in_progress") {
    return {
      status: 409,
      payload: { error: "already_submitted", message: "This attempt has already been submitted." }
    };
  }
  const questionId = String(body.questionId || "");
  let saved = null;
  store.mutate((next) => {
    const current = next.attempts.find((item) => item.id === attempt.id);
    if (!current) return;
    const examSet = next.examSets.find((item) => item.id === current.examSetId);
    if (!examSet || !examSet.questions.some((question) => question.id === questionId)) return;
    current.answers = current.answers || {};
    current.answers[questionId] = normalizeAnswer(body.answer);
    current.updatedAt = nowIso();
    saved = current.answers[questionId];
  });
  if (!saved) {
    return { status: 404, payload: { error: "bad_question", message: "Question not found." } };
  }
  return { status: 200, payload: { ok: true, answer: saved } };
}

function submitStudentAttempt(store, attempt, answers) {
  let submitted = null;
  store.mutate((next) => {
    const current = next.attempts.find((item) => item.id === attempt.id);
    if (!current || current.status !== "in_progress") return;
    current.answers = {
      ...(current.answers || {}),
      ...normalizeAnswersObject(answers)
    };
    const examSet = next.examSets.find((item) => item.id === current.examSetId);
    if (!examSet) return;
    current.submittedAt = nowIso();
    current.updatedAt = nowIso();
    finalizeScore(current, examSet);
    submitted = enrichAttempt(current, next);
    store.audit(current.studentId, "attempt_submitted", `Submitted attempt ${current.id}.`);
  });
  if (!submitted) {
    return {
      status: 409,
      payload: { error: "cannot_submit", message: "This attempt cannot be submitted." }
    };
  }
  return {
    status: 200,
    payload: {
      ok: true,
      attempt: scoreVisibilityPayload(submitted)
    }
  };
}

function normalizeAnswersObject(answers) {
  const result = {};
  for (const [questionId, answer] of Object.entries(answers || {})) {
    result[questionId] = normalizeAnswer(answer);
  }
  return result;
}

function normalizeAnswer(answer) {
  if (Array.isArray(answer)) return answer.map((item) => String(item));
  if (answer && typeof answer === "object") return String(answer.value || "");
  return String(answer || "");
}

function scoreVisibilityPayload(attempt) {
  const payload = {
    id: attempt.id,
    status: attempt.status,
    needsManual: attempt.needsManual,
    submittedAt: attempt.submittedAt,
    showScoreImmediately: attempt.showScoreImmediately
  };
  if (attempt.showScoreImmediately) {
    payload.autoScore = attempt.autoScore;
    payload.manualScore = attempt.manualScore;
    payload.totalScore = attempt.totalScore;
    payload.maxScore = attempt.maxScore;
    payload.percentage = attempt.percentage;
  }
  return payload;
}

function finalizeScore(attempt, examSet) {
  const auto = scoreAutomaticQuestions(examSet, attempt.answers || {});
  const manualGrades = attempt.manualGrades || {};
  let manualScore = 0;
  let needsManual = false;
  for (const question of examSet.questions) {
    if (!isManualQuestion(question)) continue;
    if (!manualGrades[question.id]) {
      needsManual = true;
      continue;
    }
    manualScore += clampNumber(manualGrades[question.id].score, 0, Number(question.points) || 0, 0);
  }
  attempt.autoScore = auto.autoScore;
  attempt.manualScore = manualScore;
  attempt.totalScore = auto.autoScore + manualScore;
  attempt.maxScore = maxScoreForExam(examSet);
  attempt.needsManual = needsManual;
  attempt.status = attempt.needsManual ? "submitted" : "graded";
}

function scoreAutomaticQuestions(examSet, answers) {
  let autoScore = 0;
  let needsManual = false;
  for (const question of examSet.questions) {
    const answer = answers[question.id];
    if (question.type === "multiple-choice") {
      const selected = Array.isArray(answer) ? answer : [answer].filter(Boolean);
      const correct = question.options.filter((option) => option.correct).map((option) => option.id);
      const matches =
        selected.length === correct.length && selected.every((optionId) => correct.includes(optionId));
      if (matches) autoScore += Number(question.points) || 0;
      continue;
    }
    if (question.type === "typed" && Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length) {
      const normalized = String(answer || "").trim().toLowerCase();
      const matches = question.acceptedAnswers.some(
        (accepted) => String(accepted || "").trim().toLowerCase() === normalized
      );
      if (matches) autoScore += Number(question.points) || 0;
      continue;
    }
    needsManual = true;
  }
  return { autoScore, needsManual };
}

function isManualQuestion(question) {
  return (
    question.type === "theory" ||
    question.type === "practical" ||
    (question.type === "typed" &&
      (!Array.isArray(question.acceptedAnswers) || question.acceptedAnswers.length === 0))
  );
}

function maxScoreForExam(examSet) {
  return examSet.questions.reduce((total, question) => total + (Number(question.points) || 0), 0);
}

function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function checkForUpdate(store) {
  const db = store.read();
  const repository = db.settings.update.repository || "akinsolasco/cbtlomket";
  const checkedAt = nowIso();
  let result;
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `Lomket-CBT/${APP_VERSION}`
      }
    });
    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status}`);
    }
    const release = await response.json();
    const latestVersion = String(release.tag_name || "").replace(/^v/i, "");
    const updateAvailable = semverCompare(latestVersion, APP_VERSION) > 0;
    result = {
      ok: true,
      checkedAt,
      currentVersion: APP_VERSION,
      latestVersion,
      updateAvailable,
      releaseName: release.name || release.tag_name,
      releaseUrl: release.html_url,
      assets: Array.isArray(release.assets)
        ? release.assets.map((asset) => ({
            name: asset.name,
            size: asset.size,
            browser_download_url: asset.browser_download_url
          }))
        : []
    };
  } catch (error) {
    result = {
      ok: false,
      checkedAt,
      currentVersion: APP_VERSION,
      updateAvailable: false,
      message: "Could not check for updates. Confirm internet access and try again.",
      detail: error.message
    };
  }

  store.mutate((next) => {
    next.settings.update.lastCheckAt = checkedAt;
    next.settings.update.lastResult = result;
  });
  return result;
}

async function downloadUpdate(store, assetUrl) {
  if (!assetUrl || !/^https:\/\/github\.com\//i.test(assetUrl)) {
    return {
      ok: false,
      message: "No downloadable GitHub release asset was selected."
    };
  }
  fs.mkdirSync(UPDATE_DIR, { recursive: true });
  const fileName = path.basename(new URL(assetUrl).pathname) || `lomket-update-${Date.now()}`;
  const targetPath = path.join(UPDATE_DIR, fileName);
  const response = await fetch(assetUrl, {
    headers: { "User-Agent": `Lomket-CBT/${APP_VERSION}` }
  });
  if (!response.ok) {
    return {
      ok: false,
      message: `Download failed with status ${response.status}.`
    };
  }
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(targetPath, Buffer.from(arrayBuffer));
  store.mutate((next) => {
    next.settings.update.downloadedFile = targetPath;
    store.audit("admin", "update_downloaded", `Downloaded update to ${targetPath}.`);
  });
  return {
    ok: true,
    message: "Update package downloaded.",
    filePath: targetPath
  };
}

function resultsCsv(db) {
  const rows = [
    [
      "Student ID",
      "Student Name",
      "Exam",
      "Assignment",
      "Status",
      "Auto Score",
      "Manual Score",
      "Total Score",
      "Max Score",
      "Percentage",
      "Submitted At"
    ]
  ];
  for (const attempt of db.attempts.map((item) => enrichAttempt(item, db))) {
    rows.push([
      attempt.studentUserId,
      attempt.studentName,
      attempt.examTitle,
      attempt.assignmentTitle,
      attempt.status,
      attempt.autoScore,
      attempt.manualScore,
      attempt.totalScore,
      attempt.maxScore,
      attempt.percentage,
      attempt.submittedAt || ""
    ]);
  }
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? "");
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(",")
    )
    .join("\n");
}

function requireAdmin(request, response, store) {
  const token = parseCookies(request).lomket_session;
  if (!token) {
    sendJson(response, 401, { error: "not_signed_in", message: "Admin sign in required." });
    return null;
  }
  const db = store.read();
  const session = db.adminSessions.find(
    (item) => item.token === token && Date.parse(item.expiresAt) > Date.now()
  );
  if (!session) {
    sendJson(response, 401, { error: "session_expired", message: "Admin session expired." });
    return null;
  }
  return session;
}

function getNetworkUrls(request, options = {}) {
  const hostHeader = request.headers.host || "";
  const portFromHost = hostHeader.includes(":") ? hostHeader.split(":").pop() : "";
  const port = options.port || process.env.PORT || portFromHost || "4090";
  const urls = [];
  const interfaces = os.networkInterfaces();
  for (const netItems of Object.values(interfaces)) {
    for (const item of netItems || []) {
      if (item.family === "IPv4" && !item.internal) {
        urls.push(`http://${item.address}:${port}`);
      }
    }
  }
  urls.push(`http://localhost:${port}`);
  return [...new Set(urls)];
}

function isLocalAdminRequest(request) {
  const address = request.socket.remoteAddress || "";
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1" ||
    address === "localhost"
  );
}

function parseCookies(request) {
  const header = request.headers.cookie || "";
  const result = {};
  header.split(";").forEach((part) => {
    const [key, ...value] = part.trim().split("=");
    if (!key) return;
    result[key] = decodeURIComponent(value.join("="));
  });
  return result;
}

function cookie(name, value, maxAge) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ];
  return parts.join("; ");
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) {
      throw new Error("Request body too large.");
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, status, payload) {
  if (response.headersSent) return;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendCsv(response, csv) {
  response.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=\"lomket-results.csv\"",
    "Cache-Control": "no-store"
  });
  response.end(csv);
}

function setBaseHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
}

function serveStatic(response, requestPath) {
  const safePath = decodeURIComponent(requestPath.split("?")[0]);
  let filePath = path.join(PUBLIC_DIR, safePath === "/" ? "index.html" : safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: "forbidden" });
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const noStore = [".html", ".js", ".css"].includes(ext);
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": noStore ? "no-store" : "public, max-age=3600"
  });
  fs.createReadStream(filePath).pipe(response);
}

module.exports = {
  createApp
};
