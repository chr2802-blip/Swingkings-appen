import Link from "next/link";
import { AcceptInviteForm } from "./accept-invite-form";

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-3xl">Kom med på holdet</h1>
        <p className="mt-1 text-sm text-slate-500">
          Skriv den e-mail, du blev inviteret med, og koden du har fået af træneren.
        </p>
      </div>
      <AcceptInviteForm email={email ?? ""} />
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-[var(--accent-text)] underline">
          Tilbage til login
        </Link>
      </p>
    </main>
  );
}
