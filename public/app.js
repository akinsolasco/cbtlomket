const app = document.querySelector("#app");

const state = {
  bootstrap: null,
  admin: null,
  overview: null,
  students: [],
  examSets: [],
  assignments: [],
  attempts: [],
  questionBank: [],
  settings: null,
  view: "dashboard",
  draftExam: null,
  editingStudentId: null,
  selectedAttemptId: null,
  updateResult: null,
  questionPoolFilter: {
    search: "",
    topic: "all",
    type: "all",
    level: "all"
  },
  student: {
    slug: null,
    status: null,
    token: null,
    attempt: null,
    exam: null,
    profile: null,
    answers: {},
    questionIndex: 0,
    timer: null
  }
};

const saveTimers = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const logo = () => "/assets/logo.png";
const clone = (value) => JSON.parse(JSON.stringify(value));

window.addEventListener("lomket-desktop-update", (event) => {
  state.desktopUpdateMessage = event.detail;
  if (state.admin) {
    renderAdminShell();
  }
});

function h(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(payload.message || "Request failed.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function setApp(html) {
  app.innerHTML = html;
}

function renderSplash(message = "Preparing Lomket CBT") {
  setApp(`
    <section class="splash">
      <div class="splash-panel">
        <img class="brand-mark" src="${logo()}" alt="Lomket logo" />
        <div class="brand-line"><span class="pulse-dot"></span> Version 1.0.1</div>
        <h1>Lomket CBT</h1>
        <p class="muted">${h(message)}</p>
        <div class="progress" aria-hidden="true"><span></span></div>
      </div>
    </section>
  `);
}

function renderFatal(message) {
  setApp(`
    <section class="splash">
      <div class="splash-panel">
        <img class="brand-mark" src="${logo()}" alt="Lomket logo" />
        <h1>Server not ready</h1>
        <p class="notice error">${h(message)}</p>
        <button class="btn primary" onclick="location.reload()">Try again</button>
      </div>
    </section>
  `);
}

async function start() {
  renderSplash("Starting the local server and loading saved exam data");
  try {
    const [bootstrap] = await Promise.all([api("/api/bootstrap"), sleep(900)]);
    state.bootstrap = bootstrap;
    if (location.pathname.startsWith("/exam/")) {
      await openStudentPortal(location.pathname.split("/").filter(Boolean)[1]);
      return;
    }
    if (!isDesktopAdminRoute()) {
      renderStudentHome();
      return;
    }
    await bootAdmin();
  } catch (error) {
    renderFatal(error.message);
  }
}

function isDesktopAdminRoute() {
  const params = new URLSearchParams(location.search);
  return params.get("desktop") === "1" || location.pathname === "/admin";
}

function renderStudentHome() {
  const urls = state.bootstrap?.network || [location.origin];
  setApp(`
    <section class="student-shell">
      ${studentHeader("Student web access")}
      <main class="student-main">
        <section class="panel" style="text-align:center">
          <img class="brand-mark" src="${logo()}" alt="Lomket logo" />
          <h1>Use your exam link</h1>
          <p class="muted">Students open the unique link given by the admin desktop app. The link looks like <span class="kbd">${h(urls[0])}/exam/...</span>.</p>
          <div class="notice warn" style="margin-top:18px">Admin login is available only inside the Lomket CBT desktop app on the server computer.</div>
        </section>
      </main>
    </section>
  `);
}

async function bootAdmin() {
  try {
    const session = await api("/api/admin/me");
    state.admin = session.admin;
    await loadAdminData();
    renderAdminShell();
  } catch {
    renderLogin();
  }
}

function renderLogin(message = "") {
  const firstLaunch = state.bootstrap?.firstLaunch;
  setApp(`
    <section class="auth-shell">
      <div class="auth-visual">
        <div>
          <img class="brand-mark" src="${logo()}" alt="Lomket logo" />
          <h1>Local CBT control for serious training rooms.</h1>
          <p>Run exams from one admin computer, publish secure access links across the same network, and keep every result saved locally.</p>
        </div>
        <div class="feature-strip">
          <div><strong>LAN server</strong><span>Students connect through the live exam link from the admin computer.</span></div>
          <div><strong>Mixed questions</strong><span>Multiple choice, typed answers, theory, and practical marking.</span></div>
          <div><strong>Local records</strong><span>Students, exam sets, attempts, and results stay on this machine.</span></div>
        </div>
      </div>
      <div class="auth-card">
        <form class="login-box" onsubmit="Lomket.loginAdmin(event)">
          <div class="panel-head">
            <div>
              <h3>Admin Login</h3>
              <p>Version ${h(state.bootstrap?.version || "1.0.1")}</p>
            </div>
          </div>
          ${message ? `<div class="notice error">${h(message)}</div>` : ""}
          ${
            firstLaunch
              ? `<div class="notice warn">First launch login: <span class="kbd">admin</span> / <span class="kbd">Lomket@2026</span>. Change it after signing in.</div>`
              : ""
          }
          <div class="field">
            <label for="username">Username</label>
            <input id="username" name="username" autocomplete="username" required value="admin" />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required />
          </div>
          <button class="btn primary" type="submit">Sign in</button>
        </form>
      </div>
    </section>
  `);
}

async function loginAdmin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await api("/api/admin/login", { method: "POST", body });
    state.admin = result.admin;
    await loadAdminData();
    renderAdminShell();
  } catch (error) {
    renderLogin(error.message);
  }
}

async function logoutAdmin() {
  await api("/api/admin/logout", { method: "POST" }).catch(() => null);
  state.admin = null;
  renderLogin();
}

async function loadAdminData() {
  const [overview, students, examSets, questionBank, assignments, attempts, settings] = await Promise.all([
    api("/api/admin/overview"),
    api("/api/admin/students"),
    api("/api/admin/exam-sets"),
    api("/api/admin/question-bank"),
    api("/api/admin/assignments"),
    api("/api/admin/attempts"),
    api("/api/admin/settings")
  ]);
  state.overview = overview;
  state.students = students.students;
  state.examSets = examSets.examSets;
  state.questionBank = questionBank.questions;
  state.assignments = assignments.assignments;
  state.attempts = attempts.attempts;
  state.settings = settings.settings;
}

function setView(view) {
  state.view = view;
  state.draftExam = view === "examSets" ? state.draftExam : null;
  state.selectedAttemptId = view === "marking" ? state.selectedAttemptId : null;
  renderAdminShell();
}

function renderAdminShell() {
  const view = state.view;
  setApp(`
    <section class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-logo">
          <img src="${logo()}" alt="Lomket logo" />
          <div><b>${h(state.settings?.appName || "Lomket CBT")}</b><span>Admin console</span></div>
        </div>
        <nav class="nav">
          ${navButton("dashboard", "Dashboard", view)}
          ${navButton("students", "Students", view)}
          ${navButton("examSets", "Exam Sets", view)}
          ${navButton("live", "Live Exams", view)}
          ${navButton("marking", "Marking", view)}
          ${navButton("results", "Results", view)}
          ${navButton("settings", "Settings", view)}
        </nav>
        <div class="sidebar-footer">
          <div class="notice">LAN: ${h((state.overview?.network || [location.origin])[0])}</div>
          <button class="btn ghost" onclick="Lomket.logoutAdmin()">Sign out</button>
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <div>
            <h1>${viewTitle(view)}</h1>
            <p>${viewSubtitle(view)}</p>
          </div>
          <div class="actions">
            <span class="pill">v${h(state.overview?.version || "1.0.1")}</span>
            <button class="btn ghost" onclick="Lomket.refreshAdmin()">Refresh</button>
          </div>
        </div>
        ${renderView(view)}
      </main>
    </section>
  `);
}

function navButton(name, label, current) {
  return `<button class="${name === current ? "active" : ""}" onclick="Lomket.setView('${name}')">${label}</button>`;
}

function viewTitle(view) {
  return {
    dashboard: "Dashboard",
    students: "Students",
    examSets: "Exam Sets",
    live: "Live Exams",
    marking: "Manual Marking",
    results: "Results",
    settings: "Settings"
  }[view];
}

function viewSubtitle(view) {
  return {
    dashboard: "Server status, live links, and recent exam activity.",
    students: "Manage student IDs and temporary passwords.",
    examSets: "Build objective, typed, theory, and practical questions.",
    live: "Assign exam sets to students and publish access links.",
    marking: "Review theory, typed, and practical answers that need manual scores.",
    results: "View attempts, scores, status, and export records.",
    settings: "Admin password, version updates, network, and recovery settings."
  }[view];
}

function renderView(view) {
  return {
    dashboard: renderDashboard,
    students: renderStudents,
    examSets: renderExamSets,
    live: renderLiveExams,
    marking: renderMarking,
    results: renderResults,
    settings: renderSettings
  }[view]();
}

async function refreshAdmin() {
  await loadAdminData();
  renderAdminShell();
}

function renderDashboard() {
  const counts = state.overview.counts;
  const live = state.overview.liveAssignments || [];
  const recent = state.overview.recentAttempts || [];
  return `
    <div class="grid four">
      ${metric("Students", counts.students, `${counts.activeStudents} active`)}
      ${metric("Exam sets", counts.examSets, "Question banks ready")}
      ${metric("Live exams", counts.liveAssignments, "Published to LAN")}
      ${metric("Manual marking", counts.pendingManual, "Awaiting review")}
    </div>
    <div class="grid two" style="margin-top:16px">
      <section class="panel">
        <div class="panel-head">
          <div><h3>Network access</h3><p>Use these links on devices connected to the same network.</p></div>
        </div>
        <div class="list">
          ${(state.overview.network || [])
            .map((url) => `<div class="list-item"><div><strong>${h(url)}</strong><p>Admin console and exam links are served from here.</p></div><button class="btn small" onclick="Lomket.copyText('${h(url)}')">Copy</button></div>`)
            .join("")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-head">
          <div><h3>Live exams</h3><p>Students only enter exams that are live and assigned to them.</p></div>
          <button class="btn primary" onclick="Lomket.setView('live')">Manage</button>
        </div>
        ${live.length ? live.map(renderAssignmentMini).join("") : `<div class="empty">No exam is live now.</div>`}
      </section>
    </div>
    <section class="panel" style="margin-top:16px">
      <div class="panel-head">
        <div><h3>Recent attempts</h3><p>Latest student activity saved on this computer.</p></div>
      </div>
      ${
        recent.length
          ? `<div class="table-wrap">${attemptTable(recent, false)}</div>`
          : `<div class="empty">No student attempts yet.</div>`
      }
    </section>
  `;
}

function metric(label, value, note) {
  return `<div class="card metric"><span>${h(label)}</span><strong>${h(value)}</strong><small>${h(note)}</small></div>`;
}

function renderAssignmentMini(assignment) {
  const link = examLink(assignment.accessSlug);
  return `
    <div class="list-item">
      <div>
        <h4>${h(assignment.title)}</h4>
        <p>${h(assignment.studentCount)} students assigned · ${h(assignment.submittedCount)} submitted</p>
        <p><span class="kbd">${h(link)}</span></p>
      </div>
      <button class="btn small" onclick="Lomket.copyText('${h(link)}')">Copy link</button>
    </div>
  `;
}

function renderStudents() {
  const editingStudent = state.students.find((student) => student.id === state.editingStudentId);
  return `
    <div class="grid two">
      <section class="panel">
        <div class="panel-head">
          <div><h3>Add student</h3><p>Temporary password is generated from first name and student ID.</p></div>
        </div>
        <form class="form-grid" onsubmit="Lomket.addStudent(event)">
          <div class="field"><label>Student ID</label><input name="userId" placeholder="LOM004" required /></div>
          <div class="field"><label>First name</label><input name="firstName" required /></div>
          <div class="field"><label>Last name</label><input name="lastName" /></div>
          <div class="field"><label>Class / group</label><input name="groupName" /></div>
          <div class="field full"><label>Email</label><input name="email" type="email" /></div>
          <input name="status" type="hidden" value="active" />
          <div class="field full"><button class="btn primary" type="submit">Add student</button></div>
        </form>
      </section>
      <section class="panel">
        ${
          editingStudent
            ? renderStudentEditor(editingStudent)
            : `
              <div class="panel-head">
                <div><h3>Password pattern</h3><p>Example: Ada with ID LOM001 signs in as <span class="kbd">ada@LOM001</span>.</p></div>
              </div>
              <div class="notice">Select Edit beside a learner to update their profile, class, status, or student ID. The temporary password updates immediately when the first name or ID changes.</div>
            `
        }
      </section>
    </div>
    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><div><h3>Student list</h3><p>${state.students.length} registered learners.</p></div></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>User ID</th><th>Name</th><th>Group</th><th>Temporary password</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${state.students
              .map(
                (student) => `
                  <tr>
                    <td><strong>${h(student.userId)}</strong></td>
                    <td>${h(`${student.firstName} ${student.lastName}`.trim())}<br><span class="muted">${h(student.email || "")}</span></td>
                    <td>${h(student.groupName || "Unassigned")}</td>
                    <td><span class="kbd">${h(student.tempPassword)}</span></td>
                    <td>${statusPill(student.status)}</td>
                    <td class="actions">
                      <button class="btn small ghost" onclick="Lomket.editStudent('${student.id}')">Edit</button>
                      <button class="btn small danger" onclick="Lomket.deleteStudent('${student.id}')">Delete</button>
                    </td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderStudentEditor(student) {
  return `
    <div class="panel-head">
      <div><h3>Edit student</h3><p>${h(student.userId)} · temporary password <span class="kbd">${h(student.tempPassword)}</span></p></div>
      <button class="btn small ghost" onclick="Lomket.cancelStudentEdit()">Close</button>
    </div>
    <form class="form-grid" onsubmit="Lomket.saveStudentEdit(event, '${student.id}')">
      <div class="field"><label>Student ID</label><input name="userId" value="${h(student.userId)}" required /></div>
      <div class="field"><label>Status</label>
        <select name="status">
          <option value="active" ${student.status !== "inactive" ? "selected" : ""}>Active</option>
          <option value="inactive" ${student.status === "inactive" ? "selected" : ""}>Inactive</option>
        </select>
      </div>
      <div class="field"><label>First name</label><input name="firstName" value="${h(student.firstName)}" required /></div>
      <div class="field"><label>Last name</label><input name="lastName" value="${h(student.lastName || "")}" /></div>
      <div class="field"><label>Class / group</label><input name="groupName" value="${h(student.groupName || "")}" /></div>
      <div class="field"><label>Email</label><input name="email" type="email" value="${h(student.email || "")}" /></div>
      <div class="field full"><button class="btn primary" type="submit">Save student</button></div>
    </form>
  `;
}

async function addStudent(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    await api("/api/admin/students", { method: "POST", body });
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

function editStudent(studentId) {
  state.editingStudentId = studentId;
  renderAdminShell();
}

function cancelStudentEdit() {
  state.editingStudentId = null;
  renderAdminShell();
}

async function saveStudentEdit(event, studentId) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    await api(`/api/admin/students/${studentId}`, { method: "PUT", body });
    state.editingStudentId = null;
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteStudent(studentId) {
  if (!confirm("Delete this student from the local record?")) return;
  try {
    await api(`/api/admin/students/${studentId}`, { method: "DELETE" });
    if (state.editingStudentId === studentId) state.editingStudentId = null;
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

function renderExamSets() {
  return `
    <div class="grid ${state.draftExam ? "two" : ""}">
      <section class="panel">
        <div class="panel-head">
          <div><h3>Exam sets</h3><p>Reusable question sets for assignments.</p></div>
          <button class="btn primary" onclick="Lomket.newExam()">New exam set</button>
        </div>
        ${
          state.examSets.length
            ? `<div class="list">${state.examSets.map(renderExamSetItem).join("")}</div>`
            : `<div class="empty">No exam set has been created yet.</div>`
        }
      </section>
      ${state.draftExam ? renderExamEditorV2() : ""}
    </div>
  `;
}

function renderExamSetItem(exam) {
  return `
    <div class="list-item">
      <div>
        <h4>${h(exam.title)}</h4>
        <p>${h(exam.subject || "General")} · ${exam.questions.length} questions · ${maxScore(exam)} marks · ${exam.durationMinutes} minutes</p>
        <p>${exam.showScoreImmediately ? "Scores shown immediately for fully auto-marked attempts." : "Scores held until admin release or marking."}</p>
      </div>
      <div class="actions">
        <button class="btn small" onclick="Lomket.editExam('${exam.id}')">Edit</button>
        <button class="btn small danger" onclick="Lomket.deleteExam('${exam.id}')">Delete</button>
      </div>
    </div>
  `;
}

function newExam() {
  state.draftExam = {
    title: "",
    subject: "",
    durationMinutes: 45,
    passingScore: 60,
    showScoreImmediately: Boolean(state.settings?.defaultShowScoreImmediately),
    shuffleQuestions: false,
    instructions: "",
    questions: []
  };
  renderAdminShell();
}

function editExam(examId) {
  const exam = state.examSets.find((item) => item.id === examId);
  state.draftExam = clone(exam);
  renderAdminShell();
}

function cancelExam() {
  state.draftExam = null;
  renderAdminShell();
}

function renderExamEditorV2() {
  const exam = state.draftExam;
  const poolQuestions = filteredQuestionPool();
  return `
    <section class="panel">
      <div class="panel-head">
        <div><h3>${exam.id ? "Edit exam set" : "Create exam set"}</h3><p>${exam.questions.length} questions · ${maxScore(exam)} marks</p></div>
        <button class="btn ghost" onclick="Lomket.cancelExam()">Close</button>
      </div>
      <form id="exam-meta-form" class="form-grid" onsubmit="Lomket.saveExam(event)">
        <div class="field full"><label>Title</label><input name="title" value="${h(exam.title)}" required /></div>
        <div class="field"><label>Subject</label><input name="subject" value="${h(exam.subject)}" /></div>
        <div class="field"><label>Duration minutes</label><input name="durationMinutes" type="number" min="5" value="${h(exam.durationMinutes)}" /></div>
        <div class="field"><label>Passing score (%)</label><input name="passingScore" type="number" min="0" max="100" value="${h(exam.passingScore)}" /></div>
        <label class="check-row"><input name="showScoreImmediately" type="checkbox" ${exam.showScoreImmediately ? "checked" : ""} /> Show score immediately when possible</label>
        <label class="check-row"><input name="shuffleQuestions" type="checkbox" ${exam.shuffleQuestions ? "checked" : ""} /> Shuffle questions for students</label>
        <div class="field full"><label>Instructions</label><textarea name="instructions">${h(exam.instructions)}</textarea></div>
        <div class="field full"><button class="btn primary" type="submit">Save exam set</button></div>
      </form>

      <hr style="border:0;border-top:1px solid var(--line);margin:20px 0" />

      <section class="question-pool">
        <div class="panel-head">
          <div><h3>Question pool</h3><p>Use ready-made samples, then save them into this exam set.</p></div>
          <button class="btn small orange" onclick="Lomket.addVisiblePoolQuestions()" ${poolQuestions.length ? "" : "disabled"}>Add visible</button>
        </div>
        <div class="pool-toolbar">
          <div class="field"><label>Search</label><input value="${h(state.questionPoolFilter.search)}" oninput="Lomket.setQuestionPoolFilter('search', this.value)" placeholder="Search topic or wording" /></div>
          <div class="field"><label>Topic</label><select onchange="Lomket.setQuestionPoolFilter('topic', this.value)">${poolOptions(questionPoolTopics(), state.questionPoolFilter.topic)}</select></div>
          <div class="field"><label>Type</label><select onchange="Lomket.setQuestionPoolFilter('type', this.value)">${poolOptions(["all", "multiple-choice", "typed", "theory", "practical"], state.questionPoolFilter.type)}</select></div>
          <div class="field"><label>Level</label><select onchange="Lomket.setQuestionPoolFilter('level', this.value)">${poolOptions(["all", "Basic", "Intermediate"], state.questionPoolFilter.level)}</select></div>
        </div>
        <div class="pool-list">
          ${poolQuestions.length ? poolQuestions.map(renderPoolQuestion).join("") : `<div class="empty">No pool questions match this filter.</div>`}
        </div>
      </section>

      <hr style="border:0;border-top:1px solid var(--line);margin:20px 0" />

      <details class="custom-question">
        <summary>Add custom question</summary>
        <form class="form-grid" onsubmit="Lomket.addQuestion(event)">
          <div class="field"><label>Question type</label>
            <select name="type">
              <option value="multiple-choice">Multiple choice</option>
              <option value="typed">Typed answer</option>
              <option value="theory">Theory</option>
              <option value="practical">Practical</option>
            </select>
          </div>
          <div class="field"><label>Topic</label><input name="topic" placeholder="Python, PowerPoint, Excel" /></div>
          <div class="field"><label>Marks</label><input name="points" type="number" min="1" value="5" /></div>
          <div class="field full"><label>Question</label><textarea name="prompt" required></textarea></div>
          <div class="field full">
            <label>Multiple choice options</label>
            <div class="option-grid">
              ${[0, 1, 2, 3]
                .map(
                  (index) => `<div class="option-row"><input type="radio" name="correctOption" value="${index}" ${index === 0 ? "checked" : ""} /><input name="option${index}" placeholder="Option ${index + 1}" /></div>`
                )
                .join("")}
            </div>
          </div>
          <div class="field full"><label>Typed accepted answers</label><textarea name="acceptedAnswers" placeholder="One accepted answer per line. Leave blank for manual marking."></textarea></div>
          <div class="field full"><label>Rubric for manual marking</label><textarea name="rubric"></textarea></div>
          <div class="field full"><button class="btn orange" type="submit">Add custom question</button></div>
        </form>
      </details>

      <div style="margin-top:16px">
        <div class="panel-head">
          <div><h3>Questions in this exam</h3><p>${exam.questions.length} selected · ${maxScore(exam)} total marks</p></div>
        </div>
        ${exam.questions.length ? exam.questions.map(renderDraftQuestionV2).join("") : `<div class="empty">Add questions from the pool or create a custom question.</div>`}
      </div>
    </section>
  `;
}

function questionPoolTopics() {
  return ["all", ...new Set(state.questionBank.map((question) => question.topic).filter(Boolean))];
}

function poolOptions(values, selected) {
  return values
    .map((value) => `<option value="${h(value)}" ${value === selected ? "selected" : ""}>${h(value === "all" ? "All" : value)}</option>`)
    .join("");
}

function filteredQuestionPool() {
  const filter = state.questionPoolFilter;
  const search = filter.search.trim().toLowerCase();
  return state.questionBank.filter((question) => {
    const matchesSearch =
      !search ||
      [question.prompt, question.topic, question.type, question.level]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    return (
      matchesSearch &&
      (filter.topic === "all" || question.topic === filter.topic) &&
      (filter.type === "all" || question.type === filter.type) &&
      (filter.level === "all" || question.level === filter.level)
    );
  });
}

function renderPoolQuestion(question) {
  const alreadyAdded = state.draftExam.questions.some((item) => item.sourceBankId === question.id);
  return `
    <div class="pool-question ${alreadyAdded ? "selected" : ""}">
      <div>
        <div class="actions">
          <span class="pill">${h(question.type)}</span>
          <span class="pill gold">${h(question.level || "Sample")}</span>
          <span class="pill">${h(question.points)} marks</span>
        </div>
        <h4>${h(question.prompt)}</h4>
        <p>${h(question.topic || "General")}</p>
      </div>
      <button class="btn small ${alreadyAdded ? "ghost" : "primary"}" onclick="Lomket.addPoolQuestion('${question.id}')">${alreadyAdded ? "Add again" : "Add"}</button>
    </div>
  `;
}

function renderDraftQuestionV2(question, index) {
  const answerText =
    question.type === "multiple-choice"
      ? (question.options || []).map((option) => `${option.correct ? "Correct: " : ""}${option.text}`).join(" / ")
      : question.type === "typed"
        ? (question.acceptedAnswers || []).join(", ") || "manual marking"
        : question.rubric || "manual marking";
  return `
    <div class="question-card">
      <div class="list-item" style="border:0;padding:0;background:transparent">
        <div>
          <div class="actions">
            <span class="pill">${h(question.type)}</span>
            <span class="pill">${h(question.points)} marks</span>
          </div>
          <h4>${index + 1}. ${h(question.prompt)}</h4>
          <p>${h(question.topic || "General")}</p>
          <p>${h(answerText)}</p>
        </div>
        <button class="btn small danger" onclick="Lomket.removeQuestion('${question.id}')">Remove</button>
      </div>
    </div>
  `;
}

function renderExamEditor() {
  const exam = state.draftExam;
  return `
    <section class="panel">
      <div class="panel-head">
        <div><h3>${exam.id ? "Edit exam set" : "Create exam set"}</h3><p>${exam.questions.length} questions · ${maxScore(exam)} marks</p></div>
        <button class="btn ghost" onclick="Lomket.cancelExam()">Close</button>
      </div>
      <form id="exam-meta-form" class="form-grid" onsubmit="Lomket.saveExam(event)">
        <div class="field full"><label>Title</label><input name="title" value="${h(exam.title)}" required /></div>
        <div class="field"><label>Subject</label><input name="subject" value="${h(exam.subject)}" /></div>
        <div class="field"><label>Duration minutes</label><input name="durationMinutes" type="number" min="5" value="${h(exam.durationMinutes)}" /></div>
        <div class="field"><label>Passing score (%)</label><input name="passingScore" type="number" min="0" max="100" value="${h(exam.passingScore)}" /></div>
        <label class="check-row"><input name="showScoreImmediately" type="checkbox" ${exam.showScoreImmediately ? "checked" : ""} /> Show score immediately when possible</label>
        <label class="check-row"><input name="shuffleQuestions" type="checkbox" ${exam.shuffleQuestions ? "checked" : ""} /> Shuffle questions for students</label>
        <div class="field full"><label>Instructions</label><textarea name="instructions">${h(exam.instructions)}</textarea></div>
        <div class="field full"><button class="btn primary" type="submit">Save exam set</button></div>
      </form>
      <hr style="border:0;border-top:1px solid var(--line);margin:20px 0" />
      <form class="form-grid" onsubmit="Lomket.addQuestion(event)">
        <div class="field"><label>Question type</label>
          <select name="type">
            <option value="multiple-choice">Multiple choice</option>
            <option value="typed">Typed answer</option>
            <option value="theory">Theory</option>
            <option value="practical">Practical</option>
          </select>
        </div>
        <div class="field"><label>Topic</label><input name="topic" placeholder="Python, PowerPoint, Excel" /></div>
        <div class="field"><label>Marks</label><input name="points" type="number" min="1" value="5" /></div>
        <div class="field full"><label>Question</label><textarea name="prompt" required></textarea></div>
        <div class="field full">
          <label>Multiple choice options</label>
          <div class="option-grid">
            ${[0, 1, 2, 3]
              .map(
                (index) => `<div class="option-row"><input type="radio" name="correctOption" value="${index}" ${index === 0 ? "checked" : ""} /><input name="option${index}" placeholder="Option ${index + 1}" /></div>`
              )
              .join("")}
          </div>
        </div>
        <div class="field full"><label>Typed accepted answers</label><textarea name="acceptedAnswers" placeholder="One accepted answer per line. Leave blank for manual marking."></textarea></div>
        <div class="field full"><label>Rubric for manual marking</label><textarea name="rubric"></textarea></div>
        <div class="field full"><button class="btn orange" type="submit">Add question</button></div>
      </form>
      <div style="margin-top:16px">
        ${exam.questions.length ? exam.questions.map(renderDraftQuestion).join("") : `<div class="empty">Add at least one question.</div>`}
      </div>
    </section>
  `;
}

function renderDraftQuestion(question, index) {
  const answerText =
    question.type === "multiple-choice"
      ? (question.options || []).map((option) => `${option.correct ? "✓ " : ""}${option.text}`).join(" · ")
      : question.type === "typed"
        ? (question.acceptedAnswers || []).join(", ") || "manual marking"
        : question.rubric || "manual marking";
  return `
    <div class="question-card">
      <div class="list-item" style="border:0;padding:0;background:transparent">
        <div>
          <span class="pill">${h(question.type)}</span>
          <h4>${index + 1}. ${h(question.prompt)}</h4>
          <p>${h(question.topic || "General")} · ${h(question.points)} marks</p>
          <p>${h(answerText)}</p>
        </div>
        <button class="btn small danger" onclick="Lomket.removeQuestion('${question.id}')">Remove</button>
      </div>
    </div>
  `;
}

function addQuestion(event) {
  event.preventDefault();
  syncDraftExamFromMeta();
  const form = event.currentTarget;
  const data = new FormData(form);
  const type = data.get("type");
  const question = {
    id: `q_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type,
    topic: data.get("topic"),
    points: Number(data.get("points") || 5),
    prompt: data.get("prompt")
  };
  if (type === "multiple-choice") {
    const correctIndex = Number(data.get("correctOption") || 0);
    question.options = [0, 1, 2, 3]
      .map((index) => ({
        id: `${question.id}_o${index}`,
        text: String(data.get(`option${index}`) || "").trim(),
        correct: index === correctIndex
      }))
      .filter((option) => option.text);
    if (question.options.length < 2) {
      alert("Add at least two multiple choice options.");
      return;
    }
  }
  if (type === "typed") {
    question.acceptedAnswers = String(data.get("acceptedAnswers") || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    question.rubric = data.get("rubric");
  }
  if (type === "theory" || type === "practical") {
    question.rubric = data.get("rubric");
  }
  state.draftExam.questions.push(question);
  renderAdminShell();
}

function setQuestionPoolFilter(key, value) {
  syncDraftExamFromMeta();
  state.questionPoolFilter[key] = value;
  renderAdminShell();
}

function addPoolQuestion(questionId) {
  syncDraftExamFromMeta();
  const question = state.questionBank.find((item) => item.id === questionId);
  if (!question) return;
  state.draftExam.questions.push(cloneQuestionFromPool(question));
  renderAdminShell();
}

function addVisiblePoolQuestions() {
  syncDraftExamFromMeta();
  const visibleQuestions = filteredQuestionPool();
  if (!visibleQuestions.length) return;
  state.draftExam.questions.push(...visibleQuestions.map(cloneQuestionFromPool));
  renderAdminShell();
}

function cloneQuestionFromPool(question) {
  const questionId = `q_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const cloned = {
    id: questionId,
    sourceBankId: question.id,
    type: question.type,
    topic: question.topic,
    points: question.points,
    prompt: question.prompt
  };
  if (question.type === "multiple-choice") {
    cloned.options = (question.options || []).map((option, index) => ({
      id: `${questionId}_o${index}`,
      text: option.text,
      correct: Boolean(option.correct)
    }));
  }
  if (question.type === "typed") {
    cloned.acceptedAnswers = Array.isArray(question.acceptedAnswers)
      ? question.acceptedAnswers.slice()
      : [];
    cloned.rubric = question.rubric || "";
  }
  if (question.type === "theory" || question.type === "practical") {
    cloned.rubric = question.rubric || "";
  }
  return cloned;
}

function removeQuestion(questionId) {
  syncDraftExamFromMeta();
  state.draftExam.questions = state.draftExam.questions.filter((question) => question.id !== questionId);
  renderAdminShell();
}

function syncDraftExamFromMeta() {
  const form = document.querySelector("#exam-meta-form");
  if (!form || !state.draftExam) return;
  const data = new FormData(form);
  Object.assign(state.draftExam, {
    title: data.get("title"),
    subject: data.get("subject"),
    durationMinutes: Number(data.get("durationMinutes")),
    passingScore: Number(data.get("passingScore")),
    showScoreImmediately: form.elements.showScoreImmediately.checked,
    shuffleQuestions: form.elements.shuffleQuestions.checked,
    instructions: data.get("instructions")
  });
}

async function saveExam(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const exam = {
    ...state.draftExam,
    title: data.get("title"),
    subject: data.get("subject"),
    durationMinutes: Number(data.get("durationMinutes")),
    passingScore: Number(data.get("passingScore")),
    showScoreImmediately: form.elements.showScoreImmediately.checked,
    shuffleQuestions: form.elements.shuffleQuestions.checked,
    instructions: data.get("instructions"),
    questions: state.draftExam.questions
  };
  try {
    if (exam.id) {
      await api(`/api/admin/exam-sets/${exam.id}`, { method: "PUT", body: exam });
    } else {
      await api("/api/admin/exam-sets", { method: "POST", body: exam });
    }
    state.draftExam = null;
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteExam(examId) {
  if (!confirm("Delete this exam set?")) return;
  try {
    await api(`/api/admin/exam-sets/${examId}`, { method: "DELETE" });
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

function maxScore(exam) {
  return (exam.questions || []).reduce((sum, question) => sum + Number(question.points || 0), 0);
}

function renderLiveExams() {
  return `
    <div class="grid two">
      <section class="panel">
        <div class="panel-head"><div><h3>Create assignment</h3><p>Choose a set, assign students, then push live.</p></div></div>
        <form class="form-grid" onsubmit="Lomket.createAssignment(event)">
          <div class="field full">
            <label>Exam set</label>
            <select name="examSetId" required>
              <option value="">Select exam set</option>
              ${state.examSets.map((exam) => `<option value="${h(exam.id)}">${h(exam.title)}</option>`).join("")}
            </select>
          </div>
          <div class="field full"><label>Assignment title</label><input name="title" placeholder="July Python Test" /></div>
          <div class="field"><label>Start time</label><input name="startAt" type="datetime-local" /></div>
          <div class="field"><label>End time</label><input name="endAt" type="datetime-local" /></div>
          <label class="check-row full"><input name="allowRetake" type="checkbox" /> Allow retake</label>
          <div class="field full">
            <label>Students</label>
            <div class="student-list">
              ${state.students
                .map(
                  (student) => `<label><input type="checkbox" name="studentIds" value="${h(student.id)}" /> ${h(student.userId)} · ${h(`${student.firstName} ${student.lastName}`.trim())}</label>`
                )
                .join("")}
            </div>
          </div>
          <div class="field full"><button class="btn primary" type="submit">Create access link</button></div>
        </form>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h3>Assignments</h3><p>${state.assignments.length} access links created.</p></div></div>
        <div class="list">
          ${
            state.assignments.length
              ? state.assignments.map(renderAssignmentCard).join("")
              : `<div class="empty">Create an assignment to generate a student link.</div>`
          }
        </div>
      </section>
    </div>
  `;
}

function renderAssignmentCard(assignment) {
  const link = examLink(assignment.accessSlug);
  return `
    <div class="list-item">
      <div>
        <h4>${h(assignment.title)}</h4>
        <p>${h(assignment.examTitle)} · ${assignment.studentCount} students · ${assignment.submittedCount}/${assignment.studentCount} submitted</p>
        <p>${assignmentStatusPill(assignment)} ${assignment.isAvailable ? '<span class="pill green">Accepting students</span>' : ""}</p>
        <p><span class="kbd">${h(link)}</span></p>
      </div>
      <div class="actions">
        <button class="btn small" onclick="Lomket.copyText('${h(link)}')">Copy</button>
        <button class="btn small success" ${assignment.status === "live" ? "disabled" : ""} onclick="Lomket.assignmentAction('${assignment.id}', 'live')">Push live</button>
        <button class="btn small ghost" ${assignment.status === "closed" ? "disabled" : ""} onclick="Lomket.assignmentAction('${assignment.id}', 'close')">Close</button>
      </div>
    </div>
  `;
}

async function createAssignment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const body = {
    examSetId: data.get("examSetId"),
    title: data.get("title"),
    startAt: localDateTimeToIso(data.get("startAt")),
    endAt: localDateTimeToIso(data.get("endAt")),
    allowRetake: form.elements.allowRetake.checked,
    studentIds: data.getAll("studentIds")
  };
  try {
    await api("/api/admin/assignments", { method: "POST", body });
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function assignmentAction(assignmentId, action) {
  try {
    await api(`/api/admin/assignments/${assignmentId}/${action}`, { method: "POST" });
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

function renderMarking() {
  const manual = state.attempts.filter((attempt) => attempt.needsManual || attempt.status === "submitted");
  const selected = state.selectedAttemptId
    ? state.attempts.find((attempt) => attempt.id === state.selectedAttemptId)
    : manual[0];
  if (selected && !state.selectedAttemptId) state.selectedAttemptId = selected.id;
  return `
    <div class="grid two">
      <section class="panel">
        <div class="panel-head"><div><h3>Pending review</h3><p>${manual.length} attempts need attention.</p></div></div>
        ${
          manual.length
            ? `<div class="list">${manual.map((attempt) => renderAttemptPicker(attempt, selected?.id)).join("")}</div>`
            : `<div class="empty">No manual marking is pending.</div>`
        }
      </section>
      <section class="panel">
        ${selected ? renderMarkingForm(selected) : `<div class="empty">Select an attempt to mark.</div>`}
      </section>
    </div>
  `;
}

function renderAttemptPicker(attempt, selectedId) {
  return `
    <button class="list-item" style="width:100%;text-align:left;${attempt.id === selectedId ? "border-color:var(--blue-2)" : ""}" onclick="Lomket.selectAttempt('${attempt.id}')">
      <div>
        <h4>${h(attempt.studentName)}</h4>
        <p>${h(attempt.examTitle)} · ${h(attempt.studentUserId)}</p>
      </div>
      ${statusPill(attempt.status)}
    </button>
  `;
}

function selectAttempt(attemptId) {
  state.selectedAttemptId = attemptId;
  renderAdminShell();
}

function renderMarkingForm(attempt) {
  const exam = state.examSets.find((item) => item.id === attempt.examSetId);
  if (!exam) return `<div class="empty">Exam set missing.</div>`;
  const manualQuestions = exam.questions.filter((question) => isManualQuestionForAdmin(question));
  return `
    <div class="panel-head">
      <div><h3>${h(attempt.studentName)}</h3><p>${h(attempt.examTitle)} · Auto score ${h(attempt.autoScore)} / ${h(attempt.maxScore)}</p></div>
    </div>
    <form class="grid" onsubmit="Lomket.saveManualGrades(event, '${attempt.id}')">
      ${manualQuestions
        .map((question) => {
          const grade = attempt.manualGrades?.[question.id] || {};
          const answer = attempt.answers?.[question.id] || "";
          return `
            <div class="question-card">
              <span class="pill">${h(question.type)} · ${h(question.points)} marks</span>
              <h4>${h(question.prompt)}</h4>
              <p class="notice">${h(answer || "No answer submitted.")}</p>
              ${question.rubric ? `<p class="muted"><strong>Rubric:</strong> ${h(question.rubric)}</p>` : ""}
              <div class="form-grid">
                <div class="field"><label>Score</label><input name="score_${question.id}" type="number" min="0" max="${h(question.points)}" value="${h(grade.score ?? "")}" /></div>
                <div class="field"><label>Feedback</label><input name="feedback_${question.id}" value="${h(grade.feedback || "")}" /></div>
              </div>
            </div>
          `;
        })
        .join("")}
      <button class="btn primary" type="submit">Save marking</button>
    </form>
  `;
}

async function saveManualGrades(event, attemptId) {
  event.preventDefault();
  const attempt = state.attempts.find((item) => item.id === attemptId);
  const exam = state.examSets.find((item) => item.id === attempt.examSetId);
  const data = new FormData(event.currentTarget);
  const manualGrades = {};
  for (const question of exam.questions.filter((item) => isManualQuestionForAdmin(item))) {
    manualGrades[question.id] = {
      score: data.get(`score_${question.id}`),
      feedback: data.get(`feedback_${question.id}`)
    };
  }
  try {
    await api(`/api/admin/attempts/${attemptId}/grade`, {
      method: "PUT",
      body: { manualGrades }
    });
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

function renderResults() {
  return `
    <section class="panel">
      <div class="panel-head">
        <div><h3>Attempt records</h3><p>${state.attempts.length} saved attempts.</p></div>
        <a class="btn primary" href="/api/admin/results.csv">Export CSV</a>
      </div>
      ${
        state.attempts.length
          ? `<div class="table-wrap">${attemptTable(state.attempts, true)}</div>`
          : `<div class="empty">Results will appear after students submit exams.</div>`
      }
    </section>
  `;
}

function attemptTable(attempts, includeActions) {
  return `
    <table>
      <thead><tr><th>Student</th><th>Exam</th><th>Status</th><th>Score</th><th>Submitted</th>${includeActions ? "<th></th>" : ""}</tr></thead>
      <tbody>
        ${attempts
          .map(
            (attempt) => `
              <tr>
                <td><strong>${h(attempt.studentName)}</strong><br><span class="muted">${h(attempt.studentUserId)}</span></td>
                <td>${h(attempt.examTitle)}<br><span class="muted">${h(attempt.assignmentTitle || "")}</span></td>
                <td>${statusPill(attempt.status)} ${attempt.needsManual ? '<span class="pill gold">manual</span>' : ""}</td>
                <td><strong>${h(attempt.totalScore)} / ${h(attempt.maxScore)}</strong><br><span class="muted">${h(attempt.percentage)}%</span></td>
                <td>${h(formatDate(attempt.submittedAt || attempt.startedAt))}</td>
                ${includeActions ? `<td><button class="btn small ghost" onclick="Lomket.viewAttempt('${attempt.id}')">View</button></td>` : ""}
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function viewAttempt(attemptId) {
  state.selectedAttemptId = attemptId;
  state.view = "marking";
  renderAdminShell();
}

function renderSettings() {
  const settings = state.settings;
  const update = state.updateResult || settings.updateLastResult;
  return `
    <div class="grid two">
      <section class="panel">
        <div class="panel-head"><div><h3>Application settings</h3><p>Saved on this computer.</p></div></div>
        <form class="form-grid" onsubmit="Lomket.saveSettings(event)">
          <div class="field"><label>App name</label><input name="appName" value="${h(settings.appName)}" /></div>
          <div class="field"><label>Organization</label><input name="organizationName" value="${h(settings.organizationName)}" /></div>
          <div class="field full"><label>Recovery contact</label><input name="recoveryContact" value="${h(settings.recoveryContact)}" /></div>
          <label class="check-row full"><input name="defaultShowScoreImmediately" type="checkbox" ${settings.defaultShowScoreImmediately ? "checked" : ""} /> Show scores immediately by default for new exams</label>
          <div class="field full"><button class="btn primary" type="submit">Save settings</button></div>
        </form>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h3>Admin password</h3><p>Changing password signs out all admin sessions.</p></div></div>
        ${state.admin?.forcePasswordChange ? `<div class="notice warn">Change the first-launch password before using this in a real exam room.</div>` : ""}
        <form class="form-grid" onsubmit="Lomket.changePassword(event)">
          <div class="field full"><label>Current password</label><input name="currentPassword" type="password" required /></div>
          <div class="field full"><label>New password</label><input name="newPassword" type="password" minlength="8" required /></div>
          <div class="field full"><button class="btn primary" type="submit">Change password</button></div>
        </form>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h3>Updates</h3><p>Current version ${h(settings.version)}.</p></div></div>
        ${
          state.desktopUpdateMessage
            ? `<div class="notice" style="margin-bottom:14px">${h(state.desktopUpdateMessage.message)}</div>`
            : `<div class="notice" style="margin-bottom:14px">Installed desktop builds check GitHub Releases automatically when the admin app starts, then every 6 hours while open.</div>`
        }
        <form class="form-grid" onsubmit="Lomket.saveSettings(event)">
          <div class="field full"><label>GitHub repository</label><input name="updateRepository" value="${h(settings.updateRepository)}" /></div>
          <label class="check-row full"><input name="updateAutoCheck" type="checkbox" ${settings.updateAutoCheck ? "checked" : ""} /> Auto-check when internet is available</label>
          <input type="hidden" name="appName" value="${h(settings.appName)}" />
          <input type="hidden" name="organizationName" value="${h(settings.organizationName)}" />
          <input type="hidden" name="recoveryContact" value="${h(settings.recoveryContact)}" />
          <button class="btn ghost" type="submit">Save update settings</button>
        </form>
        <div class="actions" style="margin-top:14px">
          <button class="btn primary" onclick="Lomket.checkUpdates()">Check now</button>
          ${update?.assets?.length ? `<button class="btn orange" onclick="Lomket.downloadUpdate('${h(update.assets[0].browser_download_url)}')">Download latest</button>` : ""}
        </div>
        ${renderUpdateResult(update)}
      </section>
      <section class="panel">
        <div class="panel-head"><div><h3>Local data and recovery</h3><p>Back up this file before major updates.</p></div></div>
        <p><span class="kbd">${h(settings.dataPath)}</span></p>
        <div class="notice">If the admin password is lost, the owner can run the local reset script on this computer or ship a reset update. Student records and exam attempts remain in the local data file.</div>
      </section>
    </div>
  `;
}

function renderUpdateResult(update) {
  if (!update) return "";
  if (!update.ok) return `<div class="notice warn" style="margin-top:14px">${h(update.message || "No update information available.")}</div>`;
  if (update.updateAvailable) {
    return `<div class="notice success" style="margin-top:14px">Version ${h(update.latestVersion)} is available. ${update.releaseUrl ? `<a href="${h(update.releaseUrl)}" target="_blank" rel="noreferrer">Open release</a>` : ""}</div>`;
  }
  return `<div class="notice" style="margin-top:14px">You are on the latest available release.</div>`;
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const body = {
    appName: data.get("appName") || state.settings.appName,
    organizationName: data.get("organizationName") || state.settings.organizationName,
    recoveryContact: data.get("recoveryContact") || state.settings.recoveryContact,
    defaultShowScoreImmediately: form.elements.defaultShowScoreImmediately?.checked ?? state.settings.defaultShowScoreImmediately,
    updateRepository: data.get("updateRepository") || state.settings.updateRepository,
    updateAutoCheck: form.elements.updateAutoCheck?.checked ?? state.settings.updateAutoCheck
  };
  try {
    await api("/api/admin/settings", { method: "PUT", body });
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function changePassword(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    await api("/api/admin/change-password", { method: "POST", body });
    alert("Password changed. Please sign in again.");
    renderLogin();
  } catch (error) {
    alert(error.message);
  }
}

async function checkUpdates() {
  if (window.LomketDesktop?.checkForUpdates) {
    const result = await window.LomketDesktop.checkForUpdates();
    state.desktopUpdateMessage = {
      message: result.ok ? "Desktop update check started." : result.message,
      at: new Date().toISOString()
    };
  }
  state.updateResult = await api("/api/admin/update/check", { method: "POST" }).catch((error) => ({
    ok: false,
    message: error.message
  }));
  await loadAdminData();
  renderAdminShell();
}

async function downloadUpdate(assetUrl) {
  try {
    const result = await api("/api/admin/update/download", {
      method: "POST",
      body: { assetUrl }
    });
    alert(result.message || "Download complete.");
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function openStudentPortal(slug) {
  state.student.slug = slug;
  const status = await api(`/api/exam/${encodeURIComponent(slug)}/status`);
  state.student.status = status;
  renderStudentLanding(slug, status);
}

function renderStudentLanding(slug, status, message = "") {
  if (!status.active) {
    setApp(`
      <section class="student-shell">
        ${studentHeader("Exam Access")}
        <main class="student-main">
          <section class="panel" style="text-align:center">
            <img class="brand-mark" src="${logo()}" alt="Lomket logo" />
            <h1>No active exam now.</h1>
            <p class="muted">${h(status.message || "The administrator has not pushed this exam live.")}</p>
          </section>
        </main>
      </section>
    `);
    return;
  }

  setApp(`
    <section class="student-shell">
      ${studentHeader(status.title)}
      <main class="student-main">
        <section class="panel">
          <div class="panel-head">
            <div><h3>${h(status.title)}</h3><p>${h(status.durationMinutes)} minutes · Sign in with your student ID and temporary password.</p></div>
          </div>
          ${message ? `<div class="notice error">${h(message)}</div>` : ""}
          <form class="form-grid" onsubmit="Lomket.studentLogin(event, '${h(slug)}')">
            <div class="field"><label>Student ID</label><input name="userId" autocomplete="username" required /></div>
            <div class="field"><label>Temporary password</label><input name="password" type="password" autocomplete="current-password" required /></div>
            <div class="field full"><button class="btn primary" type="submit">Enter exam</button></div>
          </form>
          <div class="notice warn" style="margin-top:16px">Your temporary password uses your first name and student ID, for example <span class="kbd">ada@LOM001</span>.</div>
        </section>
      </main>
    </section>
  `);
}

function studentHeader(title) {
  return `
    <header class="student-header">
      <div class="brand">
        <img src="${logo()}" alt="Lomket logo" />
        <div><strong>Lomket CBT</strong><br><span class="muted">${h(title || "Student Exam")}</span></div>
      </div>
      <span class="pill">Local network exam</span>
    </header>
  `;
}

async function studentLogin(event, slug) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await api(`/api/exam/${encodeURIComponent(slug)}/login`, {
      method: "POST",
      body
    });
    state.student.token = result.attemptToken;
    state.student.attempt = result.attempt;
    state.student.exam = result.exam;
    state.student.profile = result.student;
    state.student.answers = result.attempt.answers || {};
    state.student.questionIndex = 0;
    renderExamRoom();
  } catch (error) {
    renderStudentLanding(slug, state.student.status, error.message);
  }
}

function renderExamRoom() {
  const exam = state.student.exam;
  const attempt = state.student.attempt;
  const question = exam.questions[state.student.questionIndex];
  setApp(`
    <section class="student-shell">
      <header class="student-header">
        <div class="brand">
          <img src="${logo()}" alt="Lomket logo" />
          <div><strong>${h(exam.title)}</strong><br><span class="muted">${h(state.student.profile.firstName)} ${h(state.student.profile.lastName || "")} · ${h(state.student.profile.userId)}</span></div>
        </div>
        <div class="timer" id="timer">--:--</div>
      </header>
      <main class="student-main">
        <div class="notice">${h(exam.instructions || "Answer all questions and submit before the timer ends.")}</div>
        <div class="exam-room" style="margin-top:16px">
          <aside class="panel question-nav">
            <div class="panel-head"><div><h3>Questions</h3><p>${answeredCount()} of ${exam.questions.length} answered</p></div></div>
            <div class="number-grid">
              ${exam.questions
                .map(
                  (item, index) => `<button class="${index === state.student.questionIndex ? "active" : ""} ${hasAnswer(item.id) ? "answered" : ""}" onclick="Lomket.goQuestion(${index})">${index + 1}</button>`
                )
                .join("")}
            </div>
            <button class="btn primary" style="width:100%;margin-top:16px" onclick="Lomket.submitExam(false)">Submit exam</button>
          </aside>
          <section class="panel exam-question">
            <span class="pill">${h(question.topic || "Question")} · ${h(question.points)} marks</span>
            <h2>Question ${state.student.questionIndex + 1}</h2>
            <p style="font-size:18px">${h(question.prompt)}</p>
            ${renderStudentAnswer(question)}
            <div class="actions" style="justify-content:space-between;margin-top:22px">
              <button class="btn ghost" ${state.student.questionIndex === 0 ? "disabled" : ""} onclick="Lomket.goQuestion(${state.student.questionIndex - 1})">Previous</button>
              <button class="btn primary" ${state.student.questionIndex === exam.questions.length - 1 ? "disabled" : ""} onclick="Lomket.goQuestion(${state.student.questionIndex + 1})">Next</button>
            </div>
          </section>
        </div>
      </main>
    </section>
  `);
  startTimer(attempt.startedAt, exam.durationMinutes);
}

function renderStudentAnswer(question) {
  const value = state.student.answers[question.id] || "";
  if (question.type === "multiple-choice") {
    return `
      <div>
        ${(question.options || [])
          .map(
            (option) => `
              <label class="choice">
                <input type="radio" name="choice_${h(question.id)}" ${value === option.id ? "checked" : ""} onchange="Lomket.answerChoice('${h(question.id)}', '${h(option.id)}')" />
                <span>${h(option.text)}</span>
              </label>
            `
          )
          .join("")}
      </div>
    `;
  }
  return `
    <div class="field">
      <label>Your answer</label>
      <textarea oninput="Lomket.answerText('${h(question.id)}', this.value)">${h(value)}</textarea>
    </div>
  `;
}

function goQuestion(index) {
  state.student.questionIndex = Math.max(0, Math.min(index, state.student.exam.questions.length - 1));
  renderExamRoom();
}

function answerChoice(questionId, optionId) {
  state.student.answers[questionId] = optionId;
  saveStudentAnswer(questionId);
  renderExamRoom();
}

function answerText(questionId, value) {
  state.student.answers[questionId] = value;
  clearTimeout(saveTimers.get(questionId));
  saveTimers.set(
    questionId,
    setTimeout(() => {
      saveStudentAnswer(questionId);
    }, 450)
  );
}

async function saveStudentAnswer(questionId) {
  if (!state.student.token || !state.student.attempt) return;
  await api(`/api/student/attempts/${state.student.attempt.id}/answer`, {
    method: "POST",
    token: state.student.token,
    body: {
      questionId,
      answer: state.student.answers[questionId] || ""
    }
  }).catch(() => null);
}

async function submitExam(autoSubmit) {
  if (!autoSubmit && !confirm("Submit this exam now?")) return;
  for (const [questionId, timer] of saveTimers.entries()) {
    clearTimeout(timer);
    await saveStudentAnswer(questionId);
  }
  saveTimers.clear();
  try {
    const result = await api(`/api/student/attempts/${state.student.attempt.id}/submit`, {
      method: "POST",
      token: state.student.token,
      body: { answers: state.student.answers }
    });
    renderStudentResult(result.attempt);
  } catch (error) {
    alert(error.message);
  }
}

function renderStudentResult(attempt) {
  if (state.student.timer) clearInterval(state.student.timer);
  const scoreVisible = attempt.showScoreImmediately;
  setApp(`
    <section class="student-shell">
      ${studentHeader("Submission complete")}
      <main class="student-main">
        <section class="panel" style="text-align:center">
          <img class="brand-mark" src="${logo()}" alt="Lomket logo" />
          <h1>Exam submitted</h1>
          ${
            scoreVisible
              ? `<div class="result-score"><div><strong>${h(attempt.percentage)}%</strong><br>${h(attempt.totalScore)} / ${h(attempt.maxScore)}</div></div>`
              : `<p class="notice">Your answers were saved. The administrator will release results when marking is complete.</p>`
          }
          ${attempt.needsManual ? `<p class="notice warn">Some answers need manual marking before the final score is complete.</p>` : ""}
        </section>
      </main>
    </section>
  `);
}

function startTimer(startedAt, durationMinutes) {
  if (state.student.timer) clearInterval(state.student.timer);
  const deadline = Date.parse(startedAt) + Number(durationMinutes) * 60 * 1000;
  const tick = () => {
    const remaining = Math.max(0, deadline - Date.now());
    const timer = document.querySelector("#timer");
    if (timer) timer.textContent = formatRemaining(remaining);
    if (remaining <= 0) {
      clearInterval(state.student.timer);
      submitExam(true);
    }
  };
  tick();
  state.student.timer = setInterval(tick, 1000);
}

function answeredCount() {
  return state.student.exam.questions.filter((question) => hasAnswer(question.id)).length;
}

function hasAnswer(questionId) {
  const value = state.student.answers[questionId];
  return Array.isArray(value) ? value.length > 0 : String(value || "").trim().length > 0;
}

function isManualQuestionForAdmin(question) {
  return (
    question.type === "theory" ||
    question.type === "practical" ||
    (question.type === "typed" &&
      (!Array.isArray(question.acceptedAnswers) || question.acceptedAnswers.length === 0))
  );
}

function statusPill(status) {
  const map = {
    active: "green",
    inactive: "red",
    draft: "gold",
    live: "green",
    closed: "red",
    in_progress: "gold",
    submitted: "gold",
    graded: "green"
  };
  return `<span class="pill ${map[status] || ""}">${h(String(status || "").replace(/_/g, " "))}</span>`;
}

function assignmentStatusPill(assignment) {
  return statusPill(assignment.status);
}

function examLink(slug) {
  const base = state.overview?.network?.[0] || location.origin;
  return `${base}/exam/${slug}`;
}

function localDateTimeToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatRemaining(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const input = document.createElement("input");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
}

window.Lomket = {
  addQuestion,
  addStudent,
  answerChoice,
  answerText,
  assignmentAction,
  cancelExam,
  cancelStudentEdit,
  changePassword,
  checkUpdates,
  copyText,
  createAssignment,
  deleteExam,
  deleteStudent,
  downloadUpdate,
  editExam,
  editStudent,
  goQuestion,
  loginAdmin,
  logoutAdmin,
  newExam,
  refreshAdmin,
  removeQuestion,
  addPoolQuestion,
  addVisiblePoolQuestions,
  saveExam,
  saveManualGrades,
  saveSettings,
  saveStudentEdit,
  selectAttempt,
  setQuestionPoolFilter,
  setView,
  studentLogin,
  submitExam,
  viewAttempt
};

start();
