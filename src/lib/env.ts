function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get BETTER_AUTH_SECRET() {
    return required("BETTER_AUTH_SECRET");
  },
  get BETTER_AUTH_URL() {
    return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  },
  get APP_URL() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  get RECOVERY_PASSPHRASE(): string | null {
    return process.env.RECOVERY_PASSPHRASE ?? null;
  },
  get NODE_ENV() {
    return process.env.NODE_ENV ?? "development";
  },
};
