-- Reactions (👍 ❤️ 😂 😮 😢 🔥) on posts, comments, chat messages and activity comments,
-- in place of likes on posts: every like is kept as a ❤️. And comments on activities.

-- CreateEnum
CREATE TYPE "ReactionKind" AS ENUM ('THUMBS', 'HEART', 'LAUGH', 'WOW', 'SAD', 'FIRE');

-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ReactionKind" NOT NULL,
    "postId" TEXT,
    "postCommentId" TEXT,
    "chatMessageId" TEXT,
    "activityCommentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityComment" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reaction_teamId_idx" ON "Reaction"("teamId");

-- CreateIndex
CREATE INDEX "Reaction_userId_idx" ON "Reaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_postId_userId_kind_key" ON "Reaction"("postId", "userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_postCommentId_userId_kind_key" ON "Reaction"("postCommentId", "userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_chatMessageId_userId_kind_key" ON "Reaction"("chatMessageId", "userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_activityCommentId_userId_kind_key" ON "Reaction"("activityCommentId", "userId", "kind");

-- CreateIndex
CREATE INDEX "ActivityComment_matchId_createdAt_idx" ON "ActivityComment"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityComment_teamId_idx" ON "ActivityComment"("teamId");

-- CreateIndex
CREATE INDEX "ActivityComment_authorId_idx" ON "ActivityComment"("authorId");

-- CreateIndex
CREATE INDEX "ActivityComment_parentId_idx" ON "ActivityComment"("parentId");

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_postCommentId_fkey" FOREIGN KEY ("postCommentId") REFERENCES "PostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_chatMessageId_fkey" FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_activityCommentId_fkey" FOREIGN KEY ("activityCommentId") REFERENCES "ActivityComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityComment" ADD CONSTRAINT "ActivityComment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityComment" ADD CONSTRAINT "ActivityComment_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityComment" ADD CONSTRAINT "ActivityComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityComment" ADD CONSTRAINT "ActivityComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ActivityComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A reaction is on exactly one thing.
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_one_target" CHECK (num_nonnulls("postId", "postCommentId", "chatMessageId", "activityCommentId") = 1);

-- Every like becomes a ❤️ on the same post, by the same person, at the same time.
INSERT INTO "Reaction" ("id", "teamId", "userId", "kind", "postId", "createdAt")
SELECT 'like_' || md5(l."postId" || ':' || l."userId"), p."teamId", l."userId", 'HEART', l."postId", l."createdAt"
FROM "PostLike" l JOIN "Post" p ON p."id" = l."postId";

-- DropForeignKey
ALTER TABLE "PostLike" DROP CONSTRAINT "PostLike_postId_fkey";

-- DropForeignKey
ALTER TABLE "PostLike" DROP CONSTRAINT "PostLike_userId_fkey";

-- DropTable
DROP TABLE "PostLike";


-- Supabase serves `public` to the publishable key.
ALTER TABLE "Reaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityComment" ENABLE ROW LEVEL SECURITY;
