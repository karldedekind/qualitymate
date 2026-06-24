// Next.js calls register() once when a server instance boots.
export async function register() {
  // Node runtime only (skip edge); skip the production build phase so CI builds
  // without runtime secrets don't trip the env validation.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { validateEnv } = await import("@/lib/validate-env");
    validateEnv();
  }
}
