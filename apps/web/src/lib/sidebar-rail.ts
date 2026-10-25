/** A cookie on the web host. The shell layout reads it, so the first paint shows the sidebar in the saved state. */
export const SIDEBAR_COOKIE = "wanderer_sidebar";

const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** Keeps the choice of the user (the full sidebar or the rail) for the next visit. */
export function saveSidebarRail(rail: boolean): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SIDEBAR_COOKIE}=${rail ? "rail" : "full"}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}
