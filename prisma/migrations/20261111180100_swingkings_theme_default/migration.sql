-- New teams wear the club's colours. Existing teams keep the colour they have.
ALTER TABLE "Team" ALTER COLUMN "theme" SET DEFAULT 'SWINGKINGS';
