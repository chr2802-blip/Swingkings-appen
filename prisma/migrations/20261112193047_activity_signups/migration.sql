-- CreateTable
CREATE TABLE "ActivitySignup" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "going" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivitySignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivitySignup_teamId_idx" ON "ActivitySignup"("teamId");

-- CreateIndex
CREATE INDEX "ActivitySignup_userId_idx" ON "ActivitySignup"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySignup_matchId_userId_key" ON "ActivitySignup"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "ActivitySignup" ADD CONSTRAINT "ActivitySignup_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySignup" ADD CONSTRAINT "ActivitySignup_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySignup" ADD CONSTRAINT "ActivitySignup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase serves the public schema to the publishable key; nothing reads this table there.
ALTER TABLE "ActivitySignup" ENABLE ROW LEVEL SECURITY;
