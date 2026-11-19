import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "Privatliv · Swingkings" };

/**
 * What the app keeps about people, where and for how long. Open to everybody, signed in
 * or not: the login and invitation pages link here, before anybody has an account.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10 text-sm leading-relaxed text-slate-700">
      <div className="mb-6 text-center">
        <Image src="/logo.png" alt="" width={512} height={512} className="mx-auto mb-3 h-16 w-16 drop-shadow-md" />
        <h1 className="text-3xl text-slate-900">Privatliv</h1>
        <p className="mt-1 text-slate-500">Hvad Swingkings gemmer om dig, og hvad du selv kan gøre.</p>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="mb-1 text-base font-semibold text-slate-900">Hvem står bag</h2>
          <p>
            Appen drives af holdet selv, til holdets egen brug. Den sælger ingenting, viser ingen reklamer og deler intet
            med andre. Har du spørgsmål, så spørg holdets admin.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-slate-900">Hvad der gemmes</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Din e-mail, dit navn og evt. profilbillede og trøjenummer.</li>
            <li>Din adgangskode — kun som en krypteret hash, som ingen kan læse.</li>
            <li>Det du laver i appen: bøder, udfordringer, opgaver, tilmeldinger, beskeder, opslag, billeder, kommentarer og stemmer.</li>
            <li>Om du har betalt bøder og kontingent i denne sæson.</li>
            <li>Notifikationer til dig, og — hvis du slår dem til — din telefons adresse til push-beskeder.</li>
          </ul>
          <p className="mt-2">
            Kun folk på dit hold kan se holdets indhold. Ved en <strong>anonym afstemning</strong> gemmes din stemme uden
            nogen kobling til dig, så heller ikke admin kan se, hvad du stemte.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-slate-900">Hvor det ligger</h2>
          <p>
            Data ligger i en database hos Supabase og appen kører hos Vercel, begge i EU. Billeder ligger bag login og har
            ingen offentlige adresser. Appen bruger én cookie, som holder dig logget ind, og anonym besøgsstatistik uden
            cookies.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-slate-900">Hvor længe</h2>
          <p>
            Bøder, udfordringer og afsluttede aktiviteter slettes, når admin starter en ny sæson — kun samlede tal for
            sæsonen gemmes, aldrig hvem der betalte hvad. Notifikationer slettes efter to måneder. Resten ligger, til det
            slettes, eller til du sletter din konto.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-slate-900">Dine rettigheder</h2>
          <p>
            Du kan rette dit navn og billede under Profil, og du kan <strong>slette din konto</strong> samme sted. Så
            slettes din profil, dine beskeder, opslag, kommentarer, billeder, stemmer og de bøder, du har fået. Bøder, du
            har givet andre, bliver stående uden dit navn. Skylder du bøder, skal de betales først.
          </p>
          <p className="mt-2">
            Vil du have indsigt i, hvad der er gemt om dig, så kontakt holdets admin. Du kan også klage til Datatilsynet.
          </p>
        </section>
      </div>

      <p className="mt-8 text-center">
        <Link href="/login" className="press-text tap-inline text-slate-500 underline">
          Tilbage
        </Link>
      </p>
    </main>
  );
}
