import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/oversigt");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div aria-hidden className="accent-tint-bg mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl">
          ⚽
        </div>
        <h1 className="text-3xl">Swingkings</h1>
        <p className="mt-1 text-sm text-slate-500">Bødekasse, opgaver, chat og feed for holdet.</p>
      </div>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-slate-500">
        Har du fået en invitation?{" "}
        <Link href="/accept-invite" className="font-medium text-[var(--accent-text)] underline">
          Opret dig her
        </Link>
      </p>
    </main>
  );
}
