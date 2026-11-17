-- Asking the whole team in the chat to take over a task: the request has nobody named
-- until somebody says yes, and the chat message links to the task.

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "TaskHandover" ALTER COLUMN "toId" DROP NOT NULL,
ADD COLUMN     "inChat" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ChatMessage_taskId_idx" ON "ChatMessage"("taskId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
