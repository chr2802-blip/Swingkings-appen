-- Grouped notifications: when each person last had the chat open, and when they were
-- last sent a full push about a thread (the chat, one post's comments).

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "chatSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PushPause" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushPause_pkey" PRIMARY KEY ("userId","key")
);

-- CreateIndex
CREATE INDEX "PushPause_pushedAt_idx" ON "PushPause"("pushedAt");

-- AddForeignKey
ALTER TABLE "PushPause" ADD CONSTRAINT "PushPause_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Closed to Supabase's Data API, like every other table.
ALTER TABLE "PushPause" ENABLE ROW LEVEL SECURITY;
