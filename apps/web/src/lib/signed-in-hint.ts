/** A cookie on the web host. The web server reads it on `/` to send a logged-in user to Discover. */
export const SIGNED_IN_HINT_COOKIE = "wanderer_signed_in";

/** The session lifetime of the API (apps/api/src/auth). The browser updates the hint each time it loads /me. */
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Sets or clears the signed-in hint. The session cookie is on the API host, so the web server cannot read it.
 * The hint is not a proof of a session: the web server uses it only to pick a page, and the API checks each request.
 */
export function setSignedInHint(signedIn: boolean): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const value = signedIn ? `1; Max-Age=${MAX_AGE_SECONDS}` : "; Max-Age=0";
  document.cookie = `${SIGNED_IN_HINT_COOKIE}=${value}; Path=/; SameSite=Lax${secure}`;
}
