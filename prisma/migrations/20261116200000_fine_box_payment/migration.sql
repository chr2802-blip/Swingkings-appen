-- The fine box is paid in one go at the end of the season ("Åbn for betaling"), so a fine
-- is no longer cleared one at a time, and a withdrawn challenge is deleted, not kept.

-- Fines the treasurer reset (nulstillede) were paid: they go. A challenge that has lost one
-- of its two fines that way goes too, with the other, so no half of a stake is left behind.
DELETE FROM "Fine" WHERE "clearedAt" IS NOT NULL;
DELETE FROM "Fine" WHERE "challengeId" IN (
  SELECT "challengeId" FROM "Fine" WHERE "challengeId" IS NOT NULL GROUP BY "challengeId" HAVING COUNT(*) < 2
);
DELETE FROM "Challenge" WHERE "status" = 'SETTLED' AND "id" NOT IN (
  SELECT "challengeId" FROM "Fine" WHERE "challengeId" IS NOT NULL
);
-- Withdrawn challenges are shown nowhere any more.
DELETE FROM "Fine" WHERE "challengeId" IN (SELECT "id" FROM "Challenge" WHERE "status" = 'CANCELLED');
DELETE FROM "Challenge" WHERE "status" = 'CANCELLED';

-- AlterEnum
BEGIN;
CREATE TYPE "ChallengeStatus_new" AS ENUM ('PENDING', 'SETTLED');
ALTER TABLE "public"."Challenge" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Challenge" ALTER COLUMN "status" TYPE "ChallengeStatus_new" USING ("status"::text::"ChallengeStatus_new");
ALTER TYPE "ChallengeStatus" RENAME TO "ChallengeStatus_old";
ALTER TYPE "ChallengeStatus_new" RENAME TO "ChallengeStatus";
DROP TYPE "public"."ChallengeStatus_old";
ALTER TABLE "Challenge" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropIndex
DROP INDEX "Fine_playerId_clearedAt_idx";

-- AlterTable
ALTER TABLE "Fine" DROP COLUMN "clearedAt";

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "finePaymentOpenedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "finesPaidAt" TIMESTAMP(3);
