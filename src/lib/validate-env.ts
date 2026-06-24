// Boot-time environment sanity checks. Hard-fails on misconfigurations that
// silently compromise security or break public URLs; warns on softer footguns.
// Called from src/instrumentation.ts at server startup.

const DEV_SECRET_SENTINEL = "dev-secret-change-me-32bytes-min";

function isLocalUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(url.trim());
}

/** Throws on fatal misconfig, warns on soft issues. Safe to call in local dev. */
export function validateEnv(): void {
  const problems: string[] = [];

  // 1. Auth secret must be set and must not be the well-known dev fallback.
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.trim().length === 0) {
    problems.push("BETTER_AUTH_SECRET is not set. Generate one: openssl rand -base64 32");
  } else if (secret === DEV_SECRET_SENTINEL) {
    problems.push(
      "BETTER_AUTH_SECRET is still the dev default — anyone can forge sessions. Set a strong unique value.",
    );
  }

  // 2. Public URLs: a real (non-localhost) host must use HTTPS. Cookies' secure
  //    flag and all emailed/QR links depend on this.
  for (const key of ["APP_URL", "BETTER_AUTH_URL"] as const) {
    const val = process.env[key];
    if (val && val.trim().length > 0 && !isLocalUrl(val) && !val.trim().startsWith("https://")) {
      problems.push(`${key}="${val}" must use https:// for a non-localhost host.`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start — environment misconfiguration:\n  - ${problems.join("\n  - ")}`,
    );
  }

  // Soft warnings (don't block boot, but surface in logs).
  const appUrl = process.env.APP_URL;
  if (!appUrl || isLocalUrl(appUrl)) {
    console.warn(
      "[env] APP_URL is unset or localhost — QR posters, invite emails, and roster links will point to localhost. Set APP_URL for production.",
    );
  }
  if (!process.env.INSTALL_PASSPHRASE) {
    console.warn(
      "[env] INSTALL_PASSPHRASE is unset — encryption-at-rest falls back to BETTER_AUTH_SECRET. Rotating the auth secret would then make encrypted settings unreadable. Set a dedicated INSTALL_PASSPHRASE.",
    );
  }
}
