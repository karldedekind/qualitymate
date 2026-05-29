import { execSync, spawnSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { join, resolve } from "node:path";

const CONTAINER_NAME = "qualitymate_e2e_pg";
const PG_PORT = 55432;
const DB_URL = `postgres://qm:qm@localhost:${PG_PORT}/qualitymate_e2e`;
const CONFIG_FILE = join(process.cwd(), "e2e", ".e2e-config.json");
const NEXT_BUILD_ID = join(process.cwd(), ".next", "BUILD_ID");

async function waitForPort(port: number, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const sock = createConnection(port, "localhost");
      sock.once("connect", () => { sock.destroy(); resolve(true); });
      sock.once("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Port ${port} did not open within ${timeoutMs}ms`);
}

async function main() {
  // Stop any leftover container from a previous run
  try { execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: "ignore" }); } catch {}

  console.log("[e2e:server] starting postgres container...");
  execSync(
    `docker run -d --name ${CONTAINER_NAME} -p ${PG_PORT}:5432 ` +
    `-e POSTGRES_USER=qm -e POSTGRES_PASSWORD=qm -e POSTGRES_DB=qualitymate_e2e ` +
    `postgres:16-alpine`,
    { stdio: "ignore" },
  );

  console.log("[e2e:server] waiting for postgres...");
  await waitForPort(PG_PORT, 30_000);
  await new Promise((r) => setTimeout(r, 1_000)); // postgres init scripts

  const outboxDir = join(process.cwd(), "e2e", "outbox");
  const uploadsDir = resolve(process.cwd(), "e2e", "uploads");
  mkdirSync(uploadsDir, { recursive: true });
  mkdirSync(outboxDir, { recursive: true });

  writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ databaseUrl: DB_URL, port: 3001, outboxDir }, null, 2),
  );

  const seedEnv = {
    ...process.env,
    DATABASE_URL: DB_URL,
    BETTER_AUTH_SECRET: "e2e-secret-32-bytes-minimum-aaaaaa",
    BETTER_AUTH_URL: "http://127.0.0.1:3001",
    APP_URL: "http://127.0.0.1:3001",
    INSTALL_PASSPHRASE: "e2e-install-passphrase-32bytes-aaaaa",
    E2E: "1",
  };

  console.log("[e2e:server] running migrations + seed...");
  const seed = spawnSync("npm", ["run", "-s", "e2e:seed"], { stdio: "inherit", env: seedEnv });
  if (seed.status !== 0) throw new Error(`seed failed (status ${seed.status})`);

  if (!existsSync(NEXT_BUILD_ID)) {
    console.log("[e2e:server] building next.js...");
    const build = spawnSync("npm", ["run", "build", "--silent"], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production", E2E: "1" },
    });
    if (build.status !== 0) throw new Error("build failed");
  } else {
    console.log("[e2e:server] reusing existing .next build");
  }

  // Standalone server needs static assets and public dir beside it
  execSync("cp -r .next/static .next/standalone/.next/static", { stdio: "ignore" });
  execSync("cp -r public .next/standalone/public", { stdio: "ignore" });

  console.log("[e2e:server] starting server on :3001...");
  const startEnv = {
    ...process.env,
    DATABASE_URL: DB_URL,
    NODE_ENV: "production",
    PORT: "3001",
    HOSTNAME: "127.0.0.1",
    E2E: "1",
    E2E_OUTBOX_DIR: outboxDir,
    UPLOADS_DIR: uploadsDir,
    BETTER_AUTH_SECRET: "e2e-secret-32-bytes-minimum-aaaaaa",
    BETTER_AUTH_URL: "http://127.0.0.1:3001",
    APP_URL: "http://127.0.0.1:3001",
    INSTALL_PASSPHRASE: "e2e-install-passphrase-32bytes-aaaaa",
  };
  const server = spawn("node", [".next/standalone/server.js"], { stdio: "inherit", env: startEnv });
  server.on("exit", (c) => process.exit(c ?? 0));
}

main().catch((e) => {
  console.error("[e2e:server] fatal:", e.message);
  process.exit(1);
});
