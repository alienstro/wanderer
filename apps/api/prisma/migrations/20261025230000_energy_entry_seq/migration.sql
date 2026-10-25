-- The save order of the ledger. Two rows of one transaction have the same created_at, so the time alone cannot order them.
ALTER TABLE "energy_entries" ADD COLUMN "seq" SERIAL NOT NULL;
