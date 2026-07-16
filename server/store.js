const fs = require("node:fs");
const path = require("node:path");
const { createSampleExamSets, createSampleStudents } = require("./sample-data");
const { hashPassword, id, nowIso } = require("./security");

const APP_VERSION = "1.0.1";
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "Lomket@2026";

function defaultDatabase() {
  return {
    schemaVersion: 1,
    appVersion: APP_VERSION,
    settings: {
      appName: "Lomket CBT",
      organizationName: "Lomket",
      adminUsername: DEFAULT_ADMIN_USERNAME,
      adminPasswordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
      forcePasswordChange: true,
      defaultShowScoreImmediately: false,
      recoveryContact: "Application owner",
      update: {
        repository: "akinsolasco/cbtlomket",
        autoCheck: true,
        lastCheckAt: null,
        lastResult: null,
        downloadedFile: null
      }
    },
    students: createSampleStudents(id),
    examSets: createSampleExamSets(id),
    assignments: [],
    attempts: [],
    adminSessions: [],
    studentSessions: [],
    auditLog: [
      {
        id: id("audit"),
        at: nowIso(),
        actor: "system",
        action: "database_initialized",
        details: "Created Lomket CBT version 1.0.1 local data store."
      }
    ],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

function ensureShape(db) {
  db.schemaVersion = db.schemaVersion || 1;
  db.appVersion = db.appVersion || APP_VERSION;
  db.settings = db.settings || {};
  db.settings.appName = db.settings.appName || "Lomket CBT";
  db.settings.organizationName = db.settings.organizationName || "Lomket";
  db.settings.adminUsername = db.settings.adminUsername || DEFAULT_ADMIN_USERNAME;
  db.settings.adminPasswordHash = db.settings.adminPasswordHash || hashPassword(DEFAULT_ADMIN_PASSWORD);
  db.settings.forcePasswordChange = Boolean(db.settings.forcePasswordChange);
  db.settings.defaultShowScoreImmediately = Boolean(db.settings.defaultShowScoreImmediately);
  db.settings.recoveryContact = db.settings.recoveryContact || "Application owner";
  db.settings.update = db.settings.update || {};
  db.settings.update.repository = db.settings.update.repository || "akinsolasco/cbtlomket";
  db.settings.update.autoCheck = db.settings.update.autoCheck !== false;
  db.students = Array.isArray(db.students) ? db.students : [];
  db.examSets = Array.isArray(db.examSets) ? db.examSets : [];
  db.assignments = Array.isArray(db.assignments) ? db.assignments : [];
  db.attempts = Array.isArray(db.attempts) ? db.attempts : [];
  db.adminSessions = Array.isArray(db.adminSessions) ? db.adminSessions : [];
  db.studentSessions = Array.isArray(db.studentSessions) ? db.studentSessions : [];
  db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];
  db.createdAt = db.createdAt || nowIso();
  db.updatedAt = db.updatedAt || nowIso();
  return db;
}

class Store {
  constructor(filePath) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.db = this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      const db = defaultDatabase();
      this.saveDatabase(db);
      return db;
    }

    const raw = fs.readFileSync(this.filePath, "utf8");
    const parsed = ensureShape(JSON.parse(raw));
    this.saveDatabase(parsed);
    return parsed;
  }

  read() {
    return this.db;
  }

  mutate(updater) {
    const result = updater(this.db);
    this.db.updatedAt = nowIso();
    this.pruneSessions();
    this.saveDatabase(this.db);
    return result;
  }

  audit(actor, action, details) {
    this.db.auditLog.unshift({
      id: id("audit"),
      at: nowIso(),
      actor,
      action,
      details
    });
    this.db.auditLog = this.db.auditLog.slice(0, 300);
  }

  pruneSessions() {
    const now = Date.now();
    this.db.adminSessions = this.db.adminSessions.filter((session) => Date.parse(session.expiresAt) > now);
    this.db.studentSessions = this.db.studentSessions.filter((session) => Date.parse(session.expiresAt) > now);
  }

  saveDatabase(db) {
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, this.filePath);
  }
}

module.exports = {
  APP_VERSION,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  Store
};
