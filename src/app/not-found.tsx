import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <div aria-hidden className="text-5xl">
        🥅
      </div>
      <h1 className="text-2xl">Forbi målet</h1>
      <p className="text-sm text-slate-500">Siden findes ikke, eller den hører til et andet hold.</p>
      <Link href="/oversigt" className="font-medium text-[var(--accent-text)] underline">
        Til oversigten
      </Link>
    </main>
  );
}
