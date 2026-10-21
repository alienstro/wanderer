import type { CookieOptions } from "express";

/** The __Host- prefix makes the browser refuse the cookie without Secure, with a Domain, or with another Path. */
export const SESSION_COOKIE = "__Host-wanderer_session";

export function sessionCookieOptions(expiresAt: Date): CookieOptions {
  return { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: expiresAt };
}

/** The options for res.clearCookie. They must match the options of the cookie. */
export const clearSessionCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
};
