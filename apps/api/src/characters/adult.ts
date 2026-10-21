import type { User } from "../generated/prisma/client.js";

/** A user sees 18+ characters only after the 18+ confirm and with "Show 18+" on. A visitor never sees them. */
export function canSeeAdult(viewer: User | null): boolean {
  return viewer !== null && viewer.showAdult && viewer.adultConfirmedAt !== null;
}
