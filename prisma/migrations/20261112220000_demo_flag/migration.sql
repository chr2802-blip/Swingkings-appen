-- Demo data is marked, not recognised by its name and address: a team that happened to be
-- called "Swingkings Demo", or somebody signing up with a @demo.swingkings.dk address, was
-- deleted by "Slet testhold".
ALTER TABLE "Team" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- Whatever demo data exists today was made by the button, so it carries the marks it would
-- have been given. The super admin can never be one of them.
UPDATE "Team" SET "isDemo" = true WHERE "name" = 'Swingkings Demo';
UPDATE "User" SET "isDemo" = true WHERE "email" LIKE '%@demo.swingkings.dk' AND "role" <> 'SUPER_ADMIN';
