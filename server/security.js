const crypto = require("node:crypto");

const PASSWORD_ITERATIONS = 180000;

function nowIso() {
  return new Date().toISOString();
}

function id(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(9).toString("hex")}`;
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto
    .pbkdf2Sync(String(password), salt, PASSWORD_ITERATIONS, 32, "sha256")
    .toString("hex");
  return `pbkdf2$sha256$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") {
    return false;
  }
  const iterations = Number(parts[2]);
  const salt = parts[3];
  const expected = Buffer.from(parts[4], "hex");
  const actual = crypto.pbkdf2Sync(String(password), salt, iterations, expected.length, "sha256");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function slugify(value) {
  const base = String(value || "exam")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return `${base || "exam"}-${crypto.randomBytes(4).toString("hex")}`;
}

function studentTempPassword(student) {
  const firstName = String(student.firstName || "student")
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `${firstName || "student"}@${String(student.userId || "").trim()}`;
}

function constantTimeTextMatch(a, b) {
  const left = Buffer.from(String(a || "").trim().toLowerCase());
  const right = Buffer.from(String(b || "").trim().toLowerCase());
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function semverCompare(left, right) {
  const parse = (value) =>
    String(value || "0.0.0")
      .replace(/^v/i, "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

module.exports = {
  constantTimeTextMatch,
  hashPassword,
  id,
  nowIso,
  randomToken,
  semverCompare,
  slugify,
  studentTempPassword,
  verifyPassword
};
