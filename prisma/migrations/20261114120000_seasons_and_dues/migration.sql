-- "Start ny sæson": when the current season began, a kontingent mark per member, and the
-- summaries of the seasons that have ended.
ALTER TABLE "Team" ADD COLUMN "seasonStartedAt" TIMESTAMP(3);

ALTER TABLE "TeamMember" ADD COLUMN "duesPaidAt" TIMESTAMP(3);

CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Season_teamId_endedAt_idx" ON "Season"("teamId", "endedAt");

ALTER TABLE "Season" ADD CONSTRAINT "Season_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase serves the public schema to the publishable key; nothing reads this table there.
ALTER TABLE "Season" ENABLE ROW LEVEL SECURITY;
