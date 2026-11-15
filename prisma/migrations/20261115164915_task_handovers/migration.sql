-- Giving a task to somebody else: the request, which they accept or decline, and the
-- task's history of them.

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "TaskHandover" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "note" TEXT,
    "status" "HandoverStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "TaskHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskHandover_teamId_toId_status_idx" ON "TaskHandover"("teamId", "toId", "status");

-- CreateIndex
CREATE INDEX "TaskHandover_taskId_idx" ON "TaskHandover"("taskId");

-- CreateIndex
CREATE INDEX "TaskHandover_fromId_idx" ON "TaskHandover"("fromId");

-- CreateIndex
CREATE INDEX "TaskHandover_toId_idx" ON "TaskHandover"("toId");

-- AddForeignKey
ALTER TABLE "TaskHandover" ADD CONSTRAINT "TaskHandover_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHandover" ADD CONSTRAINT "TaskHandover_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHandover" ADD CONSTRAINT "TaskHandover_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHandover" ADD CONSTRAINT "TaskHandover_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Closed to Supabase's Data API, like every other table.
ALTER TABLE "TaskHandover" ENABLE ROW LEVEL SECURITY;

-- One open request per person per task, so a double press asks once.
CREATE UNIQUE INDEX "TaskHandover_one_pending" ON "TaskHandover" ("taskId", "fromId") WHERE "status" = 'PENDING';
