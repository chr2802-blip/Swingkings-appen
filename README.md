# Swingkings

Holdets app: **bødekasse**, **opgavefordeler**, **chat** og **feed**.
Next.js 15 (App Router) · Prisma · PostgreSQL (Supabase) · Tailwind 4 · Web Push ·
Supabase Realtime · Vercel.

Appen er helt selvstændig og deler intet med andre apps: egen kode, egen database, eget
Supabase-projekt, eget Vercel-projekt og egne nøgler.

## Funktioner

**Bødekassen** — Bødekasseformanden opretter et **bødekatalog**: hver bøde koster et antal
bøder, og **1 bøde = 10 kr** (prisen kan ændres under Holdindstillinger; allerede givne
bøder beholder deres pris). Alle på holdet kan give en bøde til én eller flere spillere
på én gang, fra kataloget eller skrevet frit, og knytte den til en kamp. Den der gav bøden
(eller bødekasseformanden/en admin) kan slette den. Saldoen er *bøder − betalinger*;
registrering af betalinger er taget ud for nu og laves om senere (tidligere registrerede
betalinger tæller stadig og vises på spillerens konto). **Bødetavlen** viser hvem der skylder
mest; hver spiller har sin egen konto med historik.

**Udfordringer** — En spiller udfordrer en anden om et antal bøder ("jeg scorer før dig på
lørdag"). Modstanderen accepterer eller afviser. Bagefter melder den ene en vinder og den
anden bekræfter (eller er uenig). Bødekasseformanden eller en admin kan afgøre en uenighed. Når udfordringen er
afgjort, får taberen automatisk en bøde på indsatsen.

**Kampe fra DBU KampKlar** — En admin indsætter holdets kalenderlink fra KampKlar
(*Fodbold-appen / Mit DBU → KampKlar → holdets kalender → "Eksporter kalender"*) under
Holdindstillinger. Kampene hentes hver morgen og med knappen **Hent fra KampKlar**. Flyttede
kampe opdateres, fjernede/aflyste markeres som aflyst, og træninger vises separat. Alle på
holdet kan oprette aktiviteter i hånden (pokal, træningskamp) og hente fra KampKlar.

**Opgaver** — En opgave hører til en kamp (fristen er kampstart) eller står alene med sin
egen frist. Den gives til udvalgte personer, **fordeles retfærdigt** (dem med færrest
opgaver det seneste år først), eller lades åben, så nogen kan tage den. **Standardopgaver**
(tøjvask, frugt, kørsel…) lægges automatisk på hver ny kamp fra KampKlar og fordeles.
Tildelte får en notifikation, og dagen før fristen en påmindelse.

**Chat** — Én holdchat med tekst og billeder. Live via Supabase Realtime, ellers poller den.

**Feed** — Opslag med op til 10 billeder (swipes som karrusel), tekst, likes og
kommentarer. Billeder gøres mindre på telefonen før upload (1280 px, typisk 150–300 KB i
stedet for flere MB) og gemmes i Postgres bag login — der er ingen offentlige billed-URL'er.

**Afstemninger** — Et opslag kan have en afstemning: *Kampens spiller* (alle spillere er
svarmuligheder, evt. knyttet til en kamp), *Hvornår skal vi holde fest?* eller egne svar.
Ét eller flere svar, valgfrit sluttidspunkt, og den der laver den (eller træneren) kan
lukke den. Resultatet vises, når man har stemt, eller når afstemningen er lukket.
**Anonym afstemning:** stemmerne gemmes uden nogen kobling til den, der stemte, så ingen —
heller ikke trænere eller admin — kan se hvem der stemte hvad. Derfor kan en anonym stemme
ikke ændres, og en afstemning kan ikke gøres anonym (eller ikke-anonym) bagefter.

**Roller** styres under Holdindstillinger → *Medlemmer og roller*:
- *Spiller* — alt det daglige: aktiviteter, opgaver og standardopgaver, bøder til andre,
  udfordringer, opslag, kommentarer og afstemninger.
- *Bødekasseformand* — som spiller, og opretter, retter og sletter bødekataloget (sletter
  også andres bøder og afgør uenige udfordringer).
- *Admin* — det hele, også holdindstillinger, medlemmer, roller og invitationslinks, og kan
  rydde op i andres opslag, beskeder og opgaver.
- *Super admin* — én på hele installationen (databasen tillader ikke flere). Opretter hold
  under **Admin** og kan åbne og administrere alle hold.

**Invitationer** laves under Holdindstillinger som et link (`/join/…`), der sendes i
gruppechatten: den der åbner det, opretter sig selv eller logger ind med sin konto, og
kommer med som spiller. Linket har ingen rolle; roller gives bagefter. Det har en
udløbsdato og et maks. antal personer (1–50), og kan trækkes tilbage. Når super admin
opretter et hold, kan de få et engangslink til holdets første person og derefter gøre
vedkommende til admin. Oprettelse er begrænset: højst 15 nye konti i timen fra samme adresse og
30 i timen gennem samme link, ud over linkets eget maks.

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
