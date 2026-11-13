-- A picture's bytes may live in Supabase Storage instead of Postgres: then `storageKey`
-- names the objects and the byte columns are empty. Existing rows keep their bytes until
-- `npm run db:photos` moves them.
ALTER TABLE "Photo" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "Photo" ALTER COLUMN "bytes" DROP NOT NULL;
ALTER TABLE "Photo" ALTER COLUMN "thumbBytes" DROP NOT NULL;
