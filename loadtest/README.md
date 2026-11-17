# Load-test

Belaster appen som rigtige spillere: logget ind, åbner forsiden (og markerer feedet set),
aktiviteter, bødekassen og chatten med ulæste og et billede, med 1–4 sekunders pause
imellem. Skrevet til [k6](https://grafana.com/docs/k6/).

| Scenarie   | Belastning                                       |
| ---------- | ------------------------------------------------ |
| `baseline` | 1 bruger i 2 min                                 |
| `load`     | op til 50 brugere, 5 min ved 50 (8 min i alt)    |
| `stress`   | 50 → 100 → 150 → 200 brugere, 2 min på hvert trin |
| `spike`    | 5 brugere, så 250 på 10 sekunder i 2 min          |

En kørsel stopper af sig selv, hvis mere end en fjerdedel af sidevisningerne fejler, så den
ikke bruger gratis-planerne op på en app, der allerede er gået i stå.

## Kør den

1. Opret et testhold ("Opret testhold" på `/admin`) og et invitationslink til det.
2. Lav testkonti (`loadtest01@example.com` …), højst 15 i timen fra samme adresse:

   ```bash
   node loadtest/signup.mjs <token fra linket> 1 12
   ```

   Konti, adgangskoder og session-cookies gemmes i `loadtest/accounts.json`, som git ignorerer.
3. Kør et scenarie og læs resultatet pr. side og pr. minut:

   ```bash
   cd loadtest
   SCENARIO=load k6 run --out csv=results/load.csv.gz swingkings.js
   node analyze.mjs results/load.csv.gz
   ```

   `BASE_URL` peger den et andet sted hen (standard: produktionen).

Bagefter: slet testkontiene, eller hele testholdet, og tilbagekald linket. "Slet testhold"
fjerner kun det, der er mærket som demo, og kontiene fra linket er det ikke.

## Resultater, 17. november 2026

Mod produktionen (Vercel Hobby, `cdg1`; Supabase Free) fra én maskine i USA, så hvert kald
har en tur over Atlanten med i tallene. Tiderne er hele svaret i millisekunder.

| Scenarie | Kald   | Fejl | Median | p95   |
| -------- | ------ | ---- | ------ | ----- |
| baseline | 78     | 0    | 380    | 970   |
| load     | 11.208 | 0    | 345    | 530   |
| stress   | 50.856 | 3\*  | 357    | 630   |
| spike    | 18.208 | 3\*  | 427    | 1.000 |

\* Forbindelser afbrudt i maskinens egen proxy, ikke af appen. Vercel registrerede ingen
fejl i perioden.

Appen holdt hele vejen op til 250 samtidige brugere (131 kald i sekundet) uden at knække.
Svartiden steg jævnt, og kun spiket fordoblede p95, mens nye serverinstanser startede.
Grænsen blev ikke fundet: én maskines proxy gav op før appen.

Ikke målt: Supabase Realtime (en forbindelse pr. åben app; gratis-planen har et loft over
samtidige forbindelser), push og upload af billeder.
