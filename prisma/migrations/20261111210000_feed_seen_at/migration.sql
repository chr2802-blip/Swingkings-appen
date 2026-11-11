-- When each member last had the team feed in view, so the front page can count new posts.
ALTER TABLE "TeamMember" ADD COLUMN "feedSeenAt" TIMESTAMP(3);
