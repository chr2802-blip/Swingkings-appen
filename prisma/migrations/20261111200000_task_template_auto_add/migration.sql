-- Standard tasks are chosen per activity; this says which ones the KampKlar sync adds
-- to every new match by itself. Existing templates keep doing what they did.
ALTER TABLE "TaskTemplate" ADD COLUMN "autoAdd" BOOLEAN NOT NULL DEFAULT true;
