-- DropForeignKey
ALTER TABLE "Fine" DROP CONSTRAINT "Fine_issuedById_fkey";

-- AlterTable
ALTER TABLE "Fine" ALTER COLUMN "issuedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
