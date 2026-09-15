import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["--conditions=react-server", "--import=tsx", "scripts/test-google-auth.ts"], { stdio: "inherit", windowsHide: true });
process.exit(result.status ?? 1);
