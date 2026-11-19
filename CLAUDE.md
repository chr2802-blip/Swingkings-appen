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
  bødekasseformand (`canManageFines`: the catalogue, deleting others' fines, marking
  fines paid, withdrawing others' challenges), ADMIN (`canAdministerTeam`: team settings, members, roles, invitation links, standard jobs,
  moderation), and one SUPER_ADMIN on the installation (a partial unique index allows only
  one). A fine is deleted by its giver or `canManageFines` (`canDeleteFine`). Never ask
  "the team on screen" alone.
- **Every action** that reads input takes `(prev, formData)` and returns `ActionResult`;
  records referenced by id are looked up through `teamDb`, so another team's id is "not found".
- **A fine is always from the catalogue** (`giveFine` requires `fineTypeId`): its name and
  number of fines are the `FineType`'s, never written freely or chosen by the giver, and a
  `reason`/`units` in the form is not read. It takes several `fineTypeId`s too (a player's
  page offers it, `severalFines`): each is given to every player chosen, with one notice per
  player naming them all.
- **Players are chosen with `PlayerSelect`** (`src/components/player-select.tsx`) everywhere
  a form picks people — a fine, a job's assignees, a notice's recipients, a poll's roster.
  It is the app's own `MultiSelect` (`src/components/select.tsx`, the multi-choice twin of
  `Select`), posted as one `name` field per player; in e2e, `chooseMany` drives it.
- **What a press made is shown arriving** (`src/components/fresh.tsx`): `giveFine`,
  `createChallenge` and an approving `moveChallenge` return the ids in `ActionResult.created`,
  and the dialog's `onDone` hands them to `useShowFresh(result, href)`. A fine given on an
  activity or a player's page stays there: that page's own fines tab slides in
  (`GiveFineDialog`'s `showIn`). Given in the fine box, or moved by an approval, fines go to
  its history — slid to when on screen, else opened — and a reported challenge opens the
  challenges' sheet. `FreshPulse` (in the app layout) pulses each row (`data-fresh`) once
  it is in view. The page moves only after
  `sheetsSettled()`, or the closing sheet's `history.back()` lands after it and undoes it.
- **Money**: a `Fine` copies `units` and `unitPriceKr` when given — never recompute from the
  current catalogue or price. A fine stands all season and is never cleared one by one: a
  player owes the sum of their fines (`balances` in `src/lib/money.ts`), never below zero.
  There is no credit and no part payment — a player has paid all of it or none of it.
- **Paying the fines** happens once, at the end of the season: an admin opens the box for
  payment (`setFinePayment`, "Åbn for betaling" under Holdindstillinger → Betaling, or the
  season guide), which sets `Team.finePaymentOpenedAt` and tells everybody what they owe.
  While it is open, "Betal" shows on your own page, and `giveFine`, `createChallenge` and
  `settleChallenge` refuse (`PAYMENT_OPEN`), so the sums stand still. The treasurer marks a
  player paid (`markFinesPaid` → `TeamMember.finesPaidAt`); nothing about the fines changes.
  It closes again only while nobody is marked paid, or with the new season.
- **MobilePay**: the team's box, its pay-in link `Team.mobilePayLink` (set by an admin, with
  `duesKr`). "Betal" (`PayLink`) opens it with `amount` in øre and `message` ("Bøder –
  Anna") filled in (`payLink`, `src/lib/pay.ts`). MobilePay Box has no API: nothing is
  marked paid by it — the treasurer still marks fines paid and an admin still ticks
  kontingent.
- **Seasons**: "Start ny sæson" (`startNewSeason`, admin, `/hold/saeson`) saves a `Season`
  summary (`summarizeSeason`, `src/lib/season.ts`), then deletes every fine and challenge,
  the activities that have taken place (their jobs and sign-ups go with them), done jobs
  with no activity and the invitation links, clears `TeamMember.duesPaidAt` (kontingent,
  marked by an admin in `updateMember`, seen by everybody) and `finesPaidAt`, and closes the
  box for payment. The summary keeps only totals, never who paid. All in one
  transaction guarded on `Team.seasonStartedAt`, so a double press ends it once. The
  KampKlar sync brings nothing back from before `seasonStartedAt`.
- **Challenges** are reported after they are played (winner, loser, stake) and go through
  when anybody but the reporter approves — the only flow (`canMove` in
  `src/lib/challenges.ts`). Approving is `settleChallenge` (`src/lib/fines.ts`): the
  winner gets a fine with negative units, the loser one with positive, so the stake
  moves; capped at what the winner owes, guarded on status so a double press moves it
  once. A withdrawn challenge is deleted and shown nowhere: withdrawing one that waits
  (`moveChallenge` "cancel") deletes it, and deleting either fine of a settled one deletes
  both fines and the challenge. There is no CANCELLED status.
- **Activities** (aktiviteter, `/aktiviteter`) are `Match` rows — the model kept its name;
  `kind` says match, training or other. Every task belongs to one (new tasks always do;
  old rows may have `matchId` null). There is no tasks menu; `/kampe` and `/opgaver` redirect.
  Standard jobs are added with `addTemplatesToActivity` (ticked ids, or `"auto"`), copied
  from an earlier activity with `copyTasksFromActivity` (`src/lib/tasks.ts`).
- **Nobody takes a task themselves.** A place on one moves only by being handed over, or
  by the creator/admin editing the task.
- **Nobody ticks a task off.** A task is done once its activity's day is over (Copenhagen
  clock), one with no activity once its deadline's day is; `openTask()` / `isTaskOpen`
  (`src/lib/tasks.ts`) is the one meaning of "open" — counts, reminders, handovers, the
  season's summary. `Task.doneAt` is only what was ticked before, and still counts as done.
- **Giving a task away** (`offerTask`, `askInChat`, `answerHandover`, `withdrawHandover`):
  somebody on a task asks one teammate, or the whole team in the chat (`askInChat`: a
  `TaskHandover` with `inChat` and `toId` null, plus a `ChatMessage` whose `taskId` draws a
  link to the task), to take over their place. Nothing moves until somebody accepts on the
  task's page; accepting swaps the two `TaskAssignee` rows (and writes the taker into
  `toId`), guarded on status so a double press — or two people at once — moves it once.
  One open request per person per task (a partial unique index), chat or not. The
  `TaskHandover` rows stay as the task's history ("Historik" on `/opgaver/<id>`); being
  taken off the task withdraws an open request.
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
- **Accounts** (`src/lib/account.ts`): the app sends no mail, so a forgotten password is
  reset by an admin (`resetMemberPassword`, "Nulstil adgangskode" in the member menu): a
  temporary password shown once, every session ended, and `User.mustChangePassword` sends
  the next login to `/ny-adgangskode` (`setNewPassword`) — the app layout redirects there
  until it is done. The admin must administer every team the member is on, and only the
  super admin resets the super admin. Anybody deletes their own account under Profil
  (`deleteMyAccount`, password again), refused by `deletionBlocker` for the super admin,
  a team's last admin while others are on it, and fines owed and not marked paid (on any
  team, left or not). Their own content and pictures go; fines they gave stand with
  `issuedById` null ("Slettet bruger"). `/privatliv` says what is kept — keep it true.
- **Dates go through `src/lib/time.ts`** (Europe/Copenhagen). Tests run with `TZ=UTC`.
- **Polls** live on a feed post. Rules are `src/lib/polls.ts`; writing a vote is `castVote`
  (`src/lib/voting.ts`); what reaches the browser is built by `pollView` (`src/lib/feed.ts`).
  An anonymous poll's `PollVote` rows have `voterId` null and no timestamp, and who has voted
  is only in `PollBallot` — never add a column, log line or query that links the two, and
  never send results to somebody who has not voted while the poll is open.
  A poll made with `hideResults` sends its result to nobody — maker and admins included,
  open or closed — until the maker or an admin shows it (`showPollResults` →
  `resultsShownAt`, "Offentliggør resultat" in the ⋯ menu, which tells the team).
- **A feed post's pictures** are `PostPhoto` rows (up to `MAX_POST_PHOTOS`), read with
  `readPhotoChoices`.
- **A feed post** is edited (`editPost`: words and pictures, never the poll) and deleted by
  its author or `canAdministerTeam`; anybody on the team pins and unpins it (`pinPost`).
  Pinned posts lead the first page of `feedPosts` and are not counted in its pages
  (`nextFeedCursor`). A single-choice poll is voted by pressing the answer; only a
  multiple-choice one has "Stem".
- **Club logos** (`ClubLogo`, `src/lib/club-logos.ts`) are the super admin's, put in under
  /admin and shared by every team — no `teamId`. A club is found by its folded name
  (`clubKey`), also without a team number ("Hvidovre IF (2)"). Served from
  `/api/club-logos/<id>` to anybody signed in; a new logo is a new row. The opponent's shows
  on the front page's fixture poster, which is there on match day only.
- **Pictures** are shrunk in the browser (`downscale.ts`), re-measured on arrival
  (`photo-file.ts`) and served from `/api/photos/<id>` behind the session. The bytes are in
  Postgres, or in a private Supabase Storage bucket when `SUPABASE_URL` and
  `SUPABASE_SECRET_KEY` are set (`storage.ts`; a row's `storageKey` says which, and
  `npm run db:photos` moves the old ones). Pages read `photoId`, never the bytes.
- **A migration that adds a table ends with `ENABLE ROW LEVEL SECURITY`** (Supabase serves
  `public` to the publishable key). Run `npm run db:check` after any schema change.
- **Everything pressable answers the press and is at least 32×32 px.** Each button, link,
  `<summary>`, choice label and sheet trigger carries a press class from `globals.css`,
  chosen by its look: `press-icon` / `press-button` / `press-card` (by size; a card's shade
  is cut by its own rounded corners, and `Card padded={false}` clips its rows to its own),
  `press-text` for a word in a line (with `tap-inline` for the 32 px target without moving
  the line), `press-photo` for a picture. `tests/unit/press-feedback.test.ts` reads the
  source; `e2e/tap-targets.spec.ts` measures the demo team's pages and sheets.
- **No Suspense boundaries** (`<Suspense>`, `loading.tsx`): an action that revalidates
  then waits on the boundary and its button can hang ("Stemmer…") on a slow machine. It
  happened twice and failed CI a few runs in ten; `tests/unit/no-suspense.test.ts` refuses it.
- **Notifications go through `notify`/`notifyEach`** (`src/lib/notifications.ts`), never
  `sendPushToUsers` directly: they write a `Notification` row per person (the notification
  center, the bell beside the chat) before the response, and push after it unless the person
  muted that category on the team (`TeamMember.mutedPush`). Every notice names a `category`;
  `TEAM` and `always: true` (pay your fines, take over a task) cannot be muted. Link it to what
  it is about (`taskId`, `postId`, `matchId`, `challengeId`, `fineId`) so deleting that deletes
  it. The chat has no rows (its own count), only a mutable push. Comments on one's own post
  are one row per post while unread (`recordComment`). "Set" is `notificationsSeenAt` (the
  bell's count); "ny" is `readAt` null, cleared by opening it in the center or the push.
  The daily job deletes rows older than `KEEP_DAYS`; a new season deletes the fine and
  challenge ones.
- **Push and realtime are optional** and silent when unconfigured; the push from `notify`
  and `announce` run after the response via `after()`.
- **Open pages stay current through Realtime nudges** (`src/lib/realtime-topic.ts`): the
  chat (`CHAT_POSTED`), the bell (`NOTIFIED`), the feed (`FEED_CHANGED`) and the fine box
  (`FINES_CHANGED`). A nudge carries nothing but its name. An action that changes the feed
  or the fine box calls `announce` with its event (in `fines.ts` through `refresh(teamId)`);
  a page that shows them renders `<LiveRefresh events={[…]} />`, which `router.refresh()`es
  by the rules in `src/lib/live-refresh.ts`. `tests/integration/live-signals.test.ts` shows
  which actions nudge — add a new one there.
