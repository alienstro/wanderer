-- An admin can add, take away or set the energy of a user, and give a user an own daily amount.
ALTER TYPE "EnergyReason" ADD VALUE 'admin';

ALTER TABLE "users" ADD COLUMN "daily_energy" INTEGER;
ALTER TABLE "users" ADD CONSTRAINT "users_daily_energy_check" CHECK ("daily_energy" IS NULL OR "daily_energy" >= 0);
