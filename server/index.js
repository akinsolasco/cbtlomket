const path = require("node:path");
const { createApp } = require("./app");

function parseArgs(argv) {
  const args = {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT || 4090)
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--host" && argv[i + 1]) {
      args.host = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--port" && argv[i + 1]) {
      args.port = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--data" && argv[i + 1]) {
      args.dbPath = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const { server, dbPath } = createApp({ port: args.port, dbPath: args.dbPath });

server.listen(args.port, args.host, () => {
  const shownHost = args.host === "0.0.0.0" ? "localhost" : args.host;
  console.log("Lomket CBT student web server is ready.");
  console.log("Admin should use the Lomket CBT desktop app.");
  console.log(`Student web entry: http://${shownHost}:${args.port}`);
  console.log(`Data file: ${dbPath}`);
  console.log("Students should use the live /exam/... link shown inside the desktop admin app.");
});
