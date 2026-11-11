-- There is one super admin on the installation, and the database keeps it that way: a
-- unique index over the role, for the rows that have it. Prisma's schema cannot say a
-- partial index, so it lives only here.
CREATE UNIQUE INDEX "User_single_super_admin" ON "User" ("role") WHERE "role" = 'SUPER_ADMIN';
