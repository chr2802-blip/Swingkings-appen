-- A post can be edited after it is made, and pinned to the top of the feed.
ALTER TABLE "Post" ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "pinnedAt" TIMESTAMP(3);

CREATE INDEX "Post_teamId_pinnedAt_idx" ON "Post"("teamId", "pinnedAt");
