const path = require("node:path");
const { hashPassword } = require("../server/security");
const { Store } = require("../server/store");

function parseArgs(argv) {
  const args = {
    password: null,
    dataPath: process.env.LOMKET_DB_PATH || path.join(process.cwd(), "data", "lomket-db.json")
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--data" && argv[i + 1]) {
      args.dataPath = path.resolve(argv[i + 1]);
      i += 1;
    } else if (!args.password) {
      args.password = argv[i];
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.password || args.password.length < 8) {
  console.error("Usage: node scripts/reset-admin-password.js NewStrongPassword --data data/lomket-db.json");
  console.error("The new password must be at least 8 characters.");
  process.exit(1);
}

const store = new Store(args.dataPath);
store.mutate((db) => {
  db.settings.adminPasswordHash = hashPassword(args.password);
  db.settings.forcePasswordChange = false;
  db.adminSessions = [];
  db.auditLog.unshift({
    id: `audit_${Date.now()}`,
    at: new Date().toISOString(),
    actor: "owner",
    action: "admin_password_reset",
    details: "Admin password reset locally by owner script."
  });
});

console.log("Admin password reset complete.");
console.log(`Data file: ${args.dataPath}`);
