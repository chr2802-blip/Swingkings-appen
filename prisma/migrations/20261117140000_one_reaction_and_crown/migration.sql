-- One reaction per person on a thing, and the crown from the club's crest as the reaction
-- a press gives.

-- AlterEnum
ALTER TYPE "ReactionKind" ADD VALUE 'CROWN' BEFORE 'THUMBS';

-- Where somebody gave several kinds to one thing, the latest stands.
DELETE FROM "Reaction" r
USING "Reaction" newer
WHERE r."userId" = newer."userId"
  AND r."postId" IS NOT DISTINCT FROM newer."postId"
  AND r."postCommentId" IS NOT DISTINCT FROM newer."postCommentId"
  AND r."chatMessageId" IS NOT DISTINCT FROM newer."chatMessageId"
  AND r."activityCommentId" IS NOT DISTINCT FROM newer."activityCommentId"
  AND (r."createdAt", r."id") < (newer."createdAt", newer."id");

-- DropIndex
DROP INDEX "Reaction_activityCommentId_userId_kind_key";

-- DropIndex
DROP INDEX "Reaction_chatMessageId_userId_kind_key";

-- DropIndex
DROP INDEX "Reaction_postCommentId_userId_kind_key";

-- DropIndex
DROP INDEX "Reaction_postId_userId_kind_key";

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_postId_userId_key" ON "Reaction"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_postCommentId_userId_key" ON "Reaction"("postCommentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_chatMessageId_userId_key" ON "Reaction"("chatMessageId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_activityCommentId_userId_key" ON "Reaction"("activityCommentId", "userId");
