import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.url(),
  COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must have 32 or more characters"),
  // The Origin header of a browser has no path and no trailing slash, so keep only the origin.
  WEB_ORIGIN: z.url().transform((value) => new URL(value).origin),
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0),
    ),
  /** The master key for the proxy API keys: the base64 text of 32 random bytes (`openssl rand -base64 32`). */
  KEY_ENCRYPTION_KEY: z
    .string()
    .transform((value) => Buffer.from(value, "base64"))
    .refine((key) => key.length === 32, "KEY_ENCRYPTION_KEY must be the base64 text of 32 bytes"),
  /** The RunPod API key for the scene images. Only the API reads it. The browser never gets it. */
  RUNPOD_API_KEY: z.string({ error: "RUNPOD_API_KEY is missing" }).min(1, "RUNPOD_API_KEY is empty"),
  /** The directory for the uploaded images. In Docker, it is a volume. */
  UPLOAD_DIR: z.string().min(1).default("./uploads"),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

/** The Nest injection token for the checked environment. */
export const ENV = Symbol("ENV");

/** Checks the environment at start. It throws with the names of the missing or wrong values. */
export function loadEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment: ${problems.join("; ")}`);
  }
  return result.data;
}
