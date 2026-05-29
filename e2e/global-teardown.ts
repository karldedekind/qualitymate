import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

export default async function globalTeardown() {
  try { execSync("docker rm -f qualitymate_e2e_pg", { stdio: "ignore" }); } catch {}
  try { rmSync(join(process.cwd(), "e2e", ".e2e-config.json"), { force: true }); } catch {}
}
