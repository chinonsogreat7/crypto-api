const { copyFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const isRender = process.env.RENDER === "true";
const skip = process.env.SKIP_RENDER_POSTINSTALL === "true";

if (!isRender || skip) {
  console.log("Skipping Render postinstall build outside Render.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("");
  console.error("DATABASE_URL is missing.");
  console.error("Add your Neon Postgres connection string in Render: Service > Environment > Add Environment Variable.");
  console.error("Example value: postgresql://USER:PASSWORD@HOST.neon.tech/DATABASE?sslmode=require");
  console.error("");
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

copyFileSync("prisma/schema.postgres.prisma", "prisma/schema.prisma");
run("node", ["scripts/render-db-compat.cjs"]);
run("npx", ["prisma", "generate"]);
run("npx", ["prisma", "db", "push"]);
run("npm", ["run", "build"]);
