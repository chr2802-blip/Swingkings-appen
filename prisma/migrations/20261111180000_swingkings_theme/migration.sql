-- The club's own colours, taken from the crest. Its own migration, because Postgres will
-- not use a new enum value in the transaction that added it.
ALTER TYPE "TeamTheme" ADD VALUE 'SWINGKINGS' BEFORE 'GREEN';
