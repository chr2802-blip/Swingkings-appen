import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { INSTALL_LATER_COOKIE, guideFor, isPhone } from "@/lib/install";
import { LoginInstall } from "@/components/install-app";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/oversigt");
  // On a phone the app comes first, unless they have chosen the browser here before.
  const guide = guideFor((await headers()).get("user-agent") ?? "");
  const startWithApp = isPhone(guide) && !(await cookies()).has(INSTALL_LATER_COOKIE);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className={`text-center ${startWithApp ? "mb-6" : "mb-8"}`}>
        <Image src="/logo.png" alt="" width={512} height={512} priority className={`mx-auto mb-4 drop-shadow-md ${startWithApp ? "h-24 w-24" : "h-32 w-32"}`} />
        <h1 className="text-3xl">Swingkings</h1>
        <p className="mt-1 text-sm text-slate-500">Bødekasse, opgaver, chat og feed for holdet.</p>
      </div>
      <LoginInstall serverGuide={guide} startWithApp={startWithApp}>
        <LoginForm />
        <p className="mt-6 text-center text-sm text-slate-500">
          Har du fået en invitation?{" "}
          <Link href="/accept-invite" className="font-medium text-[var(--accent-text)] underline">
            Opret dig her
          </Link>
        </p>
      </LoginInstall>
    </main>
  );
}
