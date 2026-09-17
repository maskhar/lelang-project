export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertBootEnvironment } = await import("@/server/env");
  assertBootEnvironment();
}
