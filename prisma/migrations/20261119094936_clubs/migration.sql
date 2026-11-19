-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "clubId" TEXT,
ALTER COLUMN "teamId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "clubId" TEXT,
ALTER COLUMN "teamId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "clubId" TEXT,
ALTER COLUMN "teamId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "clubId" TEXT;

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubAdmin" (
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubAdmin_pkey" PRIMARY KEY ("clubId","userId")
);

-- CreateTable
CREATE TABLE "PostTeam" (
    "postId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "PostTeam_pkey" PRIMARY KEY ("postId","teamId")
);

-- CreateTable
CREATE TABLE "MatchTeam" (
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "MatchTeam_pkey" PRIMARY KEY ("matchId","teamId")
);

-- CreateIndex
CREATE INDEX "ClubAdmin_userId_idx" ON "ClubAdmin"("userId");

-- CreateIndex
CREATE INDEX "PostTeam_teamId_idx" ON "PostTeam"("teamId");

-- CreateIndex
CREATE INDEX "MatchTeam_teamId_idx" ON "MatchTeam"("teamId");

-- CreateIndex
CREATE INDEX "Match_clubId_startsAt_idx" ON "Match"("clubId", "startsAt");

-- CreateIndex
CREATE INDEX "Post_clubId_createdAt_idx" ON "Post"("clubId", "createdAt");

-- CreateIndex
CREATE INDEX "Team_clubId_idx" ON "Team"("clubId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubAdmin" ADD CONSTRAINT "ClubAdmin_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubAdmin" ADD CONSTRAINT "ClubAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTeam" ADD CONSTRAINT "PostTeam_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTeam" ADD CONSTRAINT "PostTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTeam" ADD CONSTRAINT "MatchTeam_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTeam" ADD CONSTRAINT "MatchTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A post, a poll and an activity are a team's or a club's — never both, never neither.
ALTER TABLE "Post" ADD CONSTRAINT "Post_team_or_club" CHECK (num_nonnulls("teamId", "clubId") = 1);
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_team_or_club" CHECK (num_nonnulls("teamId", "clubId") = 1);
ALTER TABLE "Match" ADD CONSTRAINT "Match_team_or_club" CHECK (num_nonnulls("teamId", "clubId") = 1);

-- Closed to Supabase's Data API, like every other table.
ALTER TABLE "Club" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClubAdmin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PostTeam" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatchTeam" ENABLE ROW LEVEL SECURITY;
