import { ApiError } from "@/lib/api";

/** The title of the toast when an action costs more than the balance. */
export const ENERGY_LOW_TITLE = "Not enough energy";

/** An action that costs energy and can fail with energy_low. */
export type EnergyAction = "reply" | "scene" | "memory";

const ACTION_NAME: Record<EnergyAction, string> = {
  reply: "A reply",
  scene: "A scene image",
  memory: "A memory summary",
};

/** The 429 body of a spend that costs more than the balance. */
interface EnergyLowBody {
  balance: number;
  price: number;
  nextRefillAt: string;
}

/** The refill time as the clock time of the user, such as "8:00 AM". The refill is always less than 24 hours away. */
export function refillTimeText(nextRefillAt: string): string {
  return new Date(nextRefillAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
}

function energyLowBody(error: unknown): EnergyLowBody | null {
  if (!(error instanceof ApiError) || error.code !== "energy_low") {
    return null;
  }
  const body = error.body as Partial<EnergyLowBody> | null;
  if (typeof body?.balance !== "number" || typeof body.price !== "number" || typeof body.nextRefillAt !== "string") {
    return null;
  }
  return { balance: body.balance, price: body.price, nextRefillAt: body.nextRefillAt };
}

/** The text for an energy_low error, such as "A reply costs 2 energy. You have 1.5. …". Null for each other error. */
export function energyLowText(error: unknown, action: EnergyAction): string | null {
  const body = energyLowBody(error);
  if (!body) {
    return null;
  }
  return `${ACTION_NAME[action]} costs ${body.price} energy. You have ${body.balance}. Your energy refills at ${refillTimeText(body.nextRefillAt)}.`;
}
