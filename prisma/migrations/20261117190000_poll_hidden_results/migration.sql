-- A poll's result may be kept from everybody until its maker or an admin shows it.

-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "hideResults" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resultsShownAt" TIMESTAMP(3);
