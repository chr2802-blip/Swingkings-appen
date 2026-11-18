import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ slettet?: string }> }) {
  if (await getCurrentUser()) redirect("/oversigt");
  const deleted = (await searchParams).slettet === "1";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <Image src="/logo.png" alt="" width={512} height={512} priority className="mx-auto mb-4 h-32 w-32 drop-shadow-md" />
        <h1 className="text-3xl">Swingkings</h1>
        <p className="mt-1 text-sm text-slate-500">Bødekasse, opgaver, chat og feed for holdet.</p>
      </div>
      {deleted && (
        <p role="status" className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-center text-sm text-slate-700">
          Din konto er slettet.
        </p>
      )}
      <LoginForm />
      <p className="mt-6 text-center text-sm text-slate-500">
        Ny på holdet? Bed træneren om et invitationslink — det er der, du opretter dig.
      </p>
      <p className="mt-2 text-center text-sm text-slate-500">
        Glemt adgangskoden? Bed holdets admin om en midlertidig.
      </p>
      <p className="mt-6 text-center text-xs">
        <Link href="/privatliv" className="text-slate-500 underline">
          Privatliv
        </Link>
      </p>
    </main>
  );
}
