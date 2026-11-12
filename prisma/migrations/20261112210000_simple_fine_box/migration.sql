-- A simpler fine box: nobody pays. A fine is outstanding until the treasurer clears it
-- (Fine.clearedAt) or the player challenges it away. A challenge is reported once it has
-- been played and goes through when anybody else approves it.

-- ── Fines: cleared instead of paid ──────────────────────────────────────────────────
ALTER TABLE "Fine" ADD COLUMN "clearedAt" TIMESTAMP(3);

-- Somebody whose payments covered every fine they had starts with a clean sheet: their
-- fines are cleared as of their last payment. Anybody else keeps what they owed.
WITH paid AS (
  SELECT "teamId", "playerId", SUM("amountKr") AS kr, MAX("createdAt") AS at
  FROM "Payment" GROUP BY "teamId", "playerId"
), fined AS (
  SELECT "teamId", "playerId", SUM("units" * "unitPriceKr") AS kr
  FROM "Fine" GROUP BY "teamId", "playerId"
)
UPDATE "Fine" f SET "clearedAt" = paid.at
FROM paid JOIN fined ON fined."teamId" = paid."teamId" AND fined."playerId" = paid."playerId"
WHERE f."teamId" = paid."teamId" AND f."playerId" = paid."playerId" AND paid.kr >= fined.kr;

ALTER TABLE "Payment" DROP CONSTRAINT "Payment_playerId_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_recordedById_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_teamId_fkey";
DROP TABLE "Payment";

-- A challenge now writes two fines (the winner's negative, the loser's positive).
DROP INDEX "Fine_challengeId_key";
CREATE INDEX "Fine_challengeId_idx" ON "Fine"("challengeId");
CREATE INDEX "Fine_playerId_clearedAt_idx" ON "Fine"("playerId", "clearedAt");

-- ── Challenges: reported, then approved ─────────────────────────────────────────────
ALTER TABLE "Challenge"
  ADD COLUMN "reportedById" TEXT,
  ADD COLUMN "loserId" TEXT,
  ADD COLUMN "approvedById" TEXT;

-- Settled: the winner is known, the loser is the other one.
UPDATE "Challenge" SET
  "reportedById" = "challengerId",
  "loserId" = CASE WHEN "winnerId" = "challengerId" THEN "opponentId" ELSE "challengerId" END
WHERE "status" = 'SETTLED' AND "winnerId" IS NOT NULL;

-- On with a winner claimed: that claim is the report, waiting for approval.
UPDATE "Challenge" SET
  "status" = 'PENDING',
  "reportedById" = "claimedById",
  "winnerId" = "claimedWinnerId",
  "loserId" = CASE WHEN "claimedWinnerId" = "challengerId" THEN "opponentId" ELSE "challengerId" END
WHERE "status" = 'ACCEPTED' AND "claimedById" IS NOT NULL AND "claimedWinnerId" IS NOT NULL;

-- Everything else has no winner — never played, declined or withdrawn — and wrote no
-- fine, so it has no place in the new flow.
DELETE FROM "Challenge" WHERE "reportedById" IS NULL;

ALTER TABLE "Challenge" DROP CONSTRAINT "Challenge_challengerId_fkey";
ALTER TABLE "Challenge" DROP CONSTRAINT "Challenge_claimedById_fkey";
ALTER TABLE "Challenge" DROP CONSTRAINT "Challenge_claimedWinnerId_fkey";
ALTER TABLE "Challenge" DROP CONSTRAINT "Challenge_opponentId_fkey";
ALTER TABLE "Challenge" DROP CONSTRAINT "Challenge_winnerId_fkey";
DROP INDEX "Challenge_challengerId_idx";
DROP INDEX "Challenge_claimedById_idx";
DROP INDEX "Challenge_claimedWinnerId_idx";
DROP INDEX "Challenge_opponentId_idx";

ALTER TABLE "Challenge"
  DROP COLUMN "challengerId",
  DROP COLUMN "claimedById",
  DROP COLUMN "claimedWinnerId",
  DROP COLUMN "opponentId",
  DROP COLUMN "respondedAt",
  ALTER COLUMN "reportedById" SET NOT NULL,
  ALTER COLUMN "winnerId" SET NOT NULL,
  ALTER COLUMN "loserId" SET NOT NULL;

CREATE TYPE "ChallengeStatus_new" AS ENUM ('PENDING', 'SETTLED', 'CANCELLED');
ALTER TABLE "Challenge" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Challenge" ALTER COLUMN "status" TYPE "ChallengeStatus_new" USING ("status"::text::"ChallengeStatus_new");
ALTER TYPE "ChallengeStatus" RENAME TO "ChallengeStatus_old";
ALTER TYPE "ChallengeStatus_new" RENAME TO "ChallengeStatus";
DROP TYPE "ChallengeStatus_old";
ALTER TABLE "Challenge" ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE INDEX "Challenge_reportedById_idx" ON "Challenge"("reportedById");
CREATE INDEX "Challenge_loserId_idx" ON "Challenge"("loserId");
CREATE INDEX "Challenge_approvedById_idx" ON "Challenge"("approvedById");

ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
