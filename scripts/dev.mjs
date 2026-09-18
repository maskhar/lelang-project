import { spawn } from "node:child_process";
import { createRequire } from "node:module";

// Trust the operating system certificate store when starting the dev server.
// Some machines terminate TLS locally (antivirus HTTPS scanning, corporate proxy,
// VPN inspection) with a root CA that only the OS store knows about. Without this
// Node rejects outbound HTTPS such as the Google token endpoint with
// "unable to verify the first certificate", which breaks OIDC login.
// NODE_OPTIONS is used instead of an inline flag so the server process that
// `next dev` spawns inherits it too.
const flag = "--use-system-ca";
const options = (process.env.NODE_OPTIONS || "").split(" ").filter(Boolean);
if (process.allowedNodeEnvironmentFlags.has(flag) && !options.includes(flag)) options.push(flag);

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", "--port", "3003"], {
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: options.join(" ") },
});
child.on("exit", (code, signal) => { process.exitCode = signal ? 1 : code ?? 0; });
