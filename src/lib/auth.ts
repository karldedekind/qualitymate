import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;   // sliding renew window: 1 day

export type SessionCookieAttributes = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
  path: "/";
};

export function sessionCookieAttributes(baseUrl: string): SessionCookieAttributes {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: baseUrl.startsWith("https://"),
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  };
}

let _auth: ReturnType<typeof create> | null = null;

function create() {
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const cookieAttrs = sessionCookieAttributes(baseURL);
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET ?? "",
    baseURL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      minPasswordLength: 8,
    },
    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "site_staff", input: false },
      },
    },
    advanced: {
      cookiePrefix: "qm",
      useSecureCookies: cookieAttrs.secure,
      defaultCookieAttributes: cookieAttrs,
    },
  });
}

function buildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

export const auth = new Proxy({} as ReturnType<typeof create>, {
  get(_target, prop) {
    if (!_auth) {
      if (!process.env.BETTER_AUTH_SECRET && !buildPhase()) {
        throw new Error("Missing required env var: BETTER_AUTH_SECRET");
      }
      _auth = create();
    }
    return Reflect.get(_auth, prop, _auth);
  },
});

export type Auth = typeof auth;
