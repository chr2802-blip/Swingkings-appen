# Swingkings

A football team's app: fine box (bødekasse), task distribution tied to DBU KampKlar
matches, team chat and a photo feed. Next.js 15, Prisma/Postgres, Tailwind, Web Push,
Supabase Realtime, Vercel. Danish UI only.

**This app shares nothing with any other app**: its own repository, database, Supabase
project, Vercel project, secrets (`AUTH_SECRET`, VAPID keys, `CRON_SECRET`), session cookie
(`swingkings_session`) and Realtime channels (`team:<id>`). Never point it at another app's
database or reuse another app's keys, and never import code from another repository.

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
- **Permissions are per team** (`src/lib/access.ts`). Roles: PLAYER (everything day to
  day: activities, tasks, giving fines, challenges, posts, polls), TREASURER =
  bødekasseformand (`canManageFines`: the catalogue, deleting others' fines, settling
  disputes), ADMIN (`canAdministerTeam`: team settings, members, roles, invitation links, standard jobs,
  moderation), and one SUPER_ADMIN on the installation (a partial unique index allows only
  one). A fine is deleted by its giver or `canManageFines` (`canDeleteFine`). Payments
  cannot be recorded for now. Never ask "the team on screen" alone.
- **Every action** that reads input takes `(prev, formData)` and returns `ActionResult`;
  records referenced by id are looked up through `teamDb`, so another team's id is "not found".
- **Money**: a `Fine` copies `units` and `unitPriceKr` when given — never recompute from the
  current catalogue or price. Balance = fines − payments (`balances` in `src/lib/money.ts`).
- **Challenges** move only through `canMove` (`src/lib/challenges.ts`); settling is
  `settleChallenge` (`src/lib/fines.ts`), guarded on status so a double press writes one fine.
- **Activities** (aktiviteter, `/aktiviteter`) are `Match` rows — the model kept its name;
  `kind` says match, training or other. Every task belongs to one (new tasks always do;
  old rows may have `matchId` null). There is no tasks menu; `/kampe` and `/opgaver` redirect.
  Standard jobs are added with `addTemplatesToActivity` (ticked ids, or `"auto"`), copied
  from an earlier activity with `copyTasksFromActivity` (`src/lib/tasks.ts`).
- **KampKlar** is read as the team's iCalendar export (`src/lib/ical.ts`,
  `src/lib/kampklar.ts`), fetched with `safeFetch`. Rows are matched by UID; hand-made
  activities are never touched by the sync. New future MATCH rows get the team's
  `TaskTemplate`s with `autoAdd`, distributed by `src/lib/distribution.ts` (fewest jobs in
  the last year first).
- **Invitations are links** (`src/lib/invite-links.ts`, `/join/<token>`): only the token's
  hash is stored, and a link carries no role — everybody joins as PLAYER. A place is taken
  only by `redeemInviteLink`, whose guarded update (`uses < maxUses`) makes the account in
  the same transaction. New accounts are also limited by `takeAttempt("signup")` (per
  address) and `takeAttempt("join-link")` (per link).
- **Dates go through `src/lib/time.ts`** (Europe/Copenhagen). Tests run with `TZ=UTC`.
- **Polls** live on a feed post. Rules are `src/lib/polls.ts`; writing a vote is `castVote`
  (`src/lib/voting.ts`); what reaches the browser is built by `pollView` (`src/lib/feed.ts`).
  An anonymous poll's `PollVote` rows have `voterId` null and no timestamp, and who has voted
  is only in `PollBallot` — never add a column, log line or query that links the two, and
  never send results to somebody who has not voted while the poll is open.
- **A feed post's pictures** are `PostPhoto` rows (up to `MAX_POST_PHOTOS`), read with
  `readPhotoChoices`.
- **Pictures** are shrunk in the browser (`downscale.ts`), re-measured on arrival
  (`photo-file.ts`), stored in Postgres, served from `/api/photos/<id>` behind the session.
  Pages read `photoId`, never the bytes.
- **A migration that adds a table ends with `ENABLE ROW LEVEL SECURITY`** (Supabase serves
  `public` to the publishable key). Run `npm run db:check` after any schema change.
- **Push and realtime are optional** and silent when unconfigured; `notifyLater` and
  `announce` run after the response via `after()`.
