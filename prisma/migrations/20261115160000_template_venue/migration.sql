-- An automatic standard job can be limited to home or away matches.

-- CreateEnum
CREATE TYPE "Venue" AS ENUM ('ALL', 'HOME', 'AWAY');

-- AlterTable
ALTER TABLE "TaskTemplate" ADD COLUMN     "autoVenue" "Venue" NOT NULL DEFAULT 'ALL';
