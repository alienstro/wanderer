import { defineConfig } from "prisma/config";

// Prisma 7 does not read .env files. Node reads apps/api/.env when the file exists.
try {
  process.loadEnvFile();
} catch {
  // No .env file. The environment has the values.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
