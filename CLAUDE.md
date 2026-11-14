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
npm run verify         # lint + types + schema drift check + all tests + browser tests
npm test               # vitest: unit (no DB) + integration (real Postgres, <db>_test)
npm run e2e            # Playwright: builds, serves on :3210 against <db>_e2e, drives Chromium
npx playwright test e2e/x.spec.ts   # one spec, once `npm run e2e:build` has built
npm run db:migrate     # new migration after a schema change
npm run db:demo        # demo team for screenshots (mads@demo.swingkings.dk / demo-password); -- --remove deletes it
                       # in production: "Opret testhold" / "Slet testhold" on /admin (super admin)
```

In a bare cloud container: `service postgresql start`, set the postgres password, and point
`DATABASE_URL`/`DIRECT_URL` at it.

## Tests gate everything — nothing new without one

**Every change ships with its tests, in the same commit.** A new or changed action, lib
module, API route or page is not done until a test shows it working and shows it refusing
what it should refuse (wrong team, wrong role, bad input). `tests/unit/test-coverage.test.ts`
enforces the floor: every file in `src/lib`, `src/app/actions` and `src/app/api` must be
imported by a test, and every page must be opened by a spec in `e2e/` — a new file without
one fails by name, and that test runs in the Vercel build. `EXEMPT` there takes a reason.

- **Unit** (`tests/unit`): pure code, no database. Runs in `npm run build`, so it gates deploys.
- **Integration** (`tests/integration`): the real actions and routes against Postgres
  (`<db>_test`, truncated before each test, refused unless the name ends in `_test`).
  `tests/integration/setup.ts` mocks `cookies`, `headers`, `redirect`, `notFound`,
  `revalidatePath`, React's `cache` and `after()` — `runAfter()` drains what `after()`
  queued. Use `tests/helpers/factories.ts` (`makeSquad`, `signIn`, `formData`, …) and
  `tests/helpers/expect.ts` (`expectDenied`, `expectRedirect`, …). Every action test covers
  another team's id ("not found") and the role that may not do it (`expectDenied`).
- **Browser** (`e2e/`, Playwright): a production build on port 3210 against `<db>_e2e`, one
  worker, the database truncated before each test. `loginAs` puts a session cookie straight
  in; `auth.spec.ts` drives the real login form. Query by role and label as a person would.
  The confirmation drawer and the colour radios (`sr-only`) need the label or the dialog.
- **A flaky test is worse than no test: fix the race, do not add a timeout.** CI refuses
  `.only` in both suites.
- **Never pipe a suite whose exit code you are asking about** (`| tail` reports `tail`'s).
- CI (`.github/workflows/test.yml`) runs the checks and the browser suite side by side;
  `Lint, types and tests` is green only when both are.

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
  bødekasseformand (`canManageFines`: the catalogue, deleting others' fines, resetting
  fines, withdrawing others' challenges), ADMIN (`canAdministerTeam`: team settings, members, roles, invitation links, standard jobs,
  moderation), and one SUPER_ADMIN on the installation (a partial unique index allows only
  one). A fine is deleted by its giver or `canManageFines` (`canDeleteFine`). Never ask
  "the team on screen" alone.
- **Every action** that reads input takes `(prev, formData)` and returns `ActionResult`;
  records referenced by id are looked up through `teamDb`, so another team's id is "not found".
- **Money**: a `Fine` copies `units` and `unitPriceKr` when given — never recompute from the
  current catalogue or price. Nobody pays: there is no payment model. Outstanding = the
  fines without `clearedAt` (`balances` in `src/lib/money.ts`), never below zero. The
  treasurer resets (`resetFines`) by setting `clearedAt` — a reset means paid; nothing is
  deleted until the season ends.
- **Paying** is in MobilePay, to the team's box: its pay-in link `Team.mobilePayLink` (set
  by an admin, with `duesKr`). "Betal" (`PayLink`) opens it with `amount` in øre and
  `message` ("Bøder – Anna") filled in (`payLink`, `src/lib/pay.ts`). MobilePay Box has no
  API: nothing is marked paid by it — the treasurer still resets fines and an admin still
  ticks kontingent.
- **Seasons**: "Start ny sæson" (`startNewSeason`, admin, `/hold/saeson`) saves a `Season`
  summary (`summarizeSeason`, `src/lib/season.ts`), then deletes every fine and challenge,
  the activities that have taken place (their jobs and sign-ups go with them), done jobs
  with no activity and the invitation links, and clears `TeamMember.duesPaidAt`
  (kontingent, marked by an admin in `updateMember`, seen by everybody). All in one
  transaction guarded on `Team.seasonStartedAt`, so a double press ends it once. The
  KampKlar sync brings nothing back from before `seasonStartedAt`.
- **Challenges** are reported after they are played (winner, loser, stake) and go through
  when anybody but the reporter approves — the only flow (`canMove` in
  `src/lib/challenges.ts`). Approving is `settleChallenge` (`src/lib/fines.ts`): the
  winner gets a fine with negative units, the loser one with positive, so the stake
  moves; capped at what the winner owes, guarded on status so a double press moves it
  once. Deleting either fine deletes both and withdraws the challenge.
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
- **A feed post** is edited (`editPost`: words and pictures, never the poll) and deleted by
  its author or `canAdministerTeam`; anybody on the team pins and unpins it (`pinPost`).
  Pinned posts lead the first page of `feedPosts` and are not counted in its pages
  (`nextFeedCursor`). A single-choice poll is voted by pressing the answer; only a
  multiple-choice one has "Stem".
- **Pictures** are shrunk in the browser (`downscale.ts`), re-measured on arrival
  (`photo-file.ts`), stored in Postgres, served from `/api/photos/<id>` behind the session.
  Pages read `photoId`, never the bytes.
- **A migration that adds a table ends with `ENABLE ROW LEVEL SECURITY`** (Supabase serves
  `public` to the publishable key). Run `npm run db:check` after any schema change.
- **No Suspense boundaries** (`<Suspense>`, `loading.tsx`): an action that revalidates
  then waits on the boundary and its button can hang ("Stemmer…") on a slow machine. It
  happened twice and failed CI a few runs in ten; `tests/unit/no-suspense.test.ts` refuses it.
- **Push and realtime are optional** and silent when unconfigured; `notifyLater` and
  `announce` run after the response via `after()`.
