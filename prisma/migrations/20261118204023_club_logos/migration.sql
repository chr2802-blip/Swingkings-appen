-- CreateTable
CREATE TABLE "ClubLogo" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubLogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubLogo_key_key" ON "ClubLogo"("key");

-- Closed to Supabase's Data API, like every other table.
ALTER TABLE "ClubLogo" ENABLE ROW LEVEL SECURITY;
