-- Where kontingent and fines are paid (a MobilePay Box), and what kontingent costs.
ALTER TABLE "Team" ADD COLUMN "mobilePayBox" TEXT,
ADD COLUMN "duesKr" INTEGER;
