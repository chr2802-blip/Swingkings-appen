# Swingkings

Holdets app: **bødekasse**, **opgavefordeler**, **chat** og **feed**.
Next.js 15 (App Router) · Prisma · PostgreSQL (Supabase) · Tailwind 4 · Web Push ·
Supabase Realtime · Vercel.

Appen er helt selvstændig og deler intet med andre apps: egen kode, egen database, eget
Supabase-projekt, eget Vercel-projekt og egne nøgler.

## Funktioner

**Bødekassen** — Kassereren/træneren opretter et **bødekatalog**: hver bøde koster et antal
bøder, og **1 bøde = 10 kr** (prisen kan ændres under Holdindstillinger; allerede givne
bøder beholder deres pris). En bøde gives til én eller flere spillere på én gang, fra
kataloget eller skrevet frit, og kan knyttes til en kamp. Betalinger registreres som beløb
(fx MobilePay), så saldoen er *bøder − betalinger*. **Bødetavlen** viser hvem der skylder
mest; hver spiller har sin egen konto med historik.

**Udfordringer** — En spiller udfordrer en anden om et antal bøder ("jeg scorer før dig på
lørdag"). Modstanderen accepterer eller afviser. Bagefter melder den ene en vinder og den
anden bekræfter (eller er uenig). Kassereren kan afgøre en uenighed. Når udfordringen er
afgjort, får taberen automatisk en bøde på indsatsen.

**Kampe fra DBU KampKlar** — Træneren indsætter holdets kalenderlink fra KampKlar
(*Fodbold-appen / Mit DBU → KampKlar → holdets kalender → "Eksporter kalender"*) under
Holdindstillinger. Kampene hentes hver morgen og med knappen **Hent fra KampKlar**. Flyttede
kampe opdateres, fjernede/aflyste markeres som aflyst, og træninger vises separat. Kampe kan
også oprettes i hånden (pokal, træningskamp).

**Opgaver** — En opgave hører til en kamp (fristen er kampstart) eller står alene med sin
egen frist. Den gives til udvalgte personer, **fordeles retfærdigt** (dem med færrest
opgaver det seneste år først), eller lades åben, så nogen kan tage den. **Standardopgaver**
(tøjvask, frugt, kørsel…) lægges automatisk på hver ny kamp fra KampKlar og fordeles.
Tildelte får en notifikation, og dagen før fristen en påmindelse.

**Chat** — Én holdchat med tekst og billeder. Live via Supabase Realtime, ellers poller den.

**Feed** — Opslag med billede og/eller tekst, likes og kommentarer. Billeder skaleres ned i
browseren og gemmes i Postgres bag login — der er ingen offentlige billed-URL'er.

**Roller** (pr. hold): *Træner/holdleder* (alt), *Kasserer* (bøder og betalinger),
*Spiller*. En super admin opretter hold under **Admin**. Invitationer laves under
Holdindstillinger: man får en engangskode, som sendes til spilleren, der opretter sig på
`/accept-invite`.

## Kom i gang lokalt

```bash
npm install
cp .env.example .env      # udfyld DATABASE_URL, AUTH_SECRET m.fl.
npx prisma migrate deploy
npm run db:seed           # super admin + holdet "Swingkings" med startkatalog
npm run dev
```

`npm run db:demo` laver et demohold med spillere, bøder, udfordringer, kampe, opgaver, chat
og feed (login `mads@demo.swingkings.dk` / `demo-password`).

## Tests

```bash
npm test                  # unit + integration (integration kræver Postgres)
npm run verify            # lint, typer, migrations-tjek og alle tests
```

Integrationstestene bruger deres egen database (`<db>_test`) og rører aldrig udviklingsdata.

## Deploy (Vercel + Supabase)

1. Opret et **nyt** Supabase-projekt og et **nyt** Vercel-projekt fra dette repo — genbrug
   ikke en anden apps database, projekt eller nøgler. Generér nye værdier til
   `AUTH_SECRET`, `CRON_SECRET` og VAPID-nøglerne.
2. Sæt miljøvariablerne fra `.env.example` i Vercel (`DATABASE_URL` = pooled forbindelse,
   `DIRECT_URL` = direkte forbindelse).
3. Push til `main`. Buildet kører unit-tests og `prisma migrate deploy`. Kun `main` deployes.
4. Kør `npm run db:seed` én gang mod produktionsdatabasen for at oprette super admin.
5. `vercel.json` kører `/api/cron/daily` hver morgen (KampKlar-synk + påmindelser).
   Sæt `CRON_SECRET`.
6. Valgfrit: Supabase Realtime til live chat — sæt de fire `SUPABASE_*`-variabler.
