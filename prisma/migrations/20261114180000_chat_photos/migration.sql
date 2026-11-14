-- A chat message can carry several pictures.
--
-- Pictures move from ChatMessage.photoId to ChatPhoto rows; every existing message keeps
-- its one picture, copied across before the column is dropped.

-- CreateTable
CREATE TABLE "ChatPhoto" (
    "messageId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ChatPhoto_pkey" PRIMARY KEY ("messageId","photoId")
);

-- CreateIndex
CREATE INDEX "ChatPhoto_photoId_idx" ON "ChatPhoto"("photoId");

-- AddForeignKey
ALTER TABLE "ChatPhoto" ADD CONSTRAINT "ChatPhoto_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPhoto" ADD CONSTRAINT "ChatPhoto_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing messages keep their picture, as the first (and only) one.
INSERT INTO "ChatPhoto" ("messageId", "photoId", "position")
SELECT "id", "photoId", 0 FROM "ChatMessage" WHERE "photoId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_photoId_fkey";

-- DropIndex
DROP INDEX "ChatMessage_photoId_idx";

-- AlterTable
ALTER TABLE "ChatMessage" DROP COLUMN "photoId";

-- Closed to Supabase's Data API, like every other table.
ALTER TABLE "ChatPhoto" ENABLE ROW LEVEL SECURITY;
