# Swingkings

A football team's app: fine box (bødekasse), task distribution tied to DBU KampKlar
matches, team chat and a photo feed. Same stack and conventions as HomeHub
(`chr2802-blip/HomeApp`), with **team** where HomeHub has **home**. Danish UI only.

## Commands

```bash
npm run dev            # dev server
npm run verify         # lint + types + schema drift check + all tests
npm test               # vitest: unit (no DB) + integration (real Postgres, <db>_test)
npm run db:migrate     # new migration after a schema change
npm run db:demo        # demo team for screenshots (mads@demo.swingkings.dk / demo-password)
```

In a bare cloud container: `service postgresql start`, set the postgres password, and point
`DATABASE_URL`/`DIRECT_URL` at it.

## Rules

- **Team-scoped data goes through `teamDb(teamId)`** (`src/lib/team-db.ts`), which stamps
  and filters `teamId` on every model that has the column, and refuses models that read
  like a team's but carry no `teamId` (`TaskAssignee`, `PostLike`, `PostComment`, `User`).
  A new model must be classified there or `tests/unit/team-scoping.test.ts` fails. Lint
  rejects `prisma.<teamModel>` in pages and components. Use `prisma` directly only where
  crossing teams is the point (cron, admin) — say so in a comment. Creates still pass
  `teamId: user.teamId` explicitly so the types are satisfied.
- **Permissions are per team** (`src/lib/access.ts`): `canAdministerTeam` (ADMIN),
  `canManageFines` (ADMIN or TREASURER). Never ask "the team on screen" alone.
- **Every action** that reads input takes `(prev, formData)` and returns `ActionResult`;
  records referenced by id are looked up through `teamDb`, so another team's id is "not found".
- **Money**: a `Fine` copies `units` and `unitPriceKr` when given — never recompute from the
  current catalogue or price. Balance = fines − payments (`balances` in `src/lib/money.ts`).
- **Challenges** move only through `canMove` (`src/lib/challenges.ts`); settling is
  `settleChallenge` (`src/lib/fines.ts`), guarded on status so a double press writes one fine.
- **KampKlar** is read as the team's iCalendar export (`src/lib/ical.ts`,
  `src/lib/kampklar.ts`), fetched with `safeFetch`. Rows are matched by UID; hand-made matches
  are never touched by the sync. New future MATCH rows get the team's `TaskTemplate`s,
  distributed by `src/lib/distribution.ts` (fewest jobs in the last year first).
- **Dates go through `src/lib/time.ts`** (Europe/Copenhagen). Tests run with `TZ=UTC`.
- **Pictures** are shrunk in the browser (`downscale.ts`), re-measured on arrival
  (`photo-file.ts`), stored in Postgres, served from `/api/photos/<id>` behind the session.
  Pages read `photoId`, never the bytes.
- **A migration that adds a table ends with `ENABLE ROW LEVEL SECURITY`** (Supabase serves
  `public` to the publishable key). Run `npm run db:check` after any schema change.
- **Push and realtime are optional** and silent when unconfigured; `notifyLater` and
  `announce` run after the response via `after()`.
