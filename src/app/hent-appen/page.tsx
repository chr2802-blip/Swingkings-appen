import Image from "next/image";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { guideFor } from "@/lib/install";
import { InstallWelcome } from "@/components/install-app";

/**
 * The first thing after logging in on a phone without the app (the login and invite forms
 * send people here). Outside the app's frame on purpose: one thing to do, and a way past it.
 */
export default async function GetTheAppPage() {
  const user = await requireUser();
  const guide = guideFor((await headers()).get("user-agent") ?? "");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-8">
      <div className="mb-5 text-center">
        <Image src="/logo.png" alt="" width={512} height={512} priority className="mx-auto mb-3 h-16 w-16 drop-shadow-md" />
        <h1 className="text-3xl">Velkommen, {user.name.split(" ")[0]}!</h1>
        <p className="mt-1 text-sm text-slate-500">Du er logget ind. Nu mangler bare appen.</p>
      </div>
      <InstallWelcome firstName={user.name.split(" ")[0]} serverGuide={guide} />
    </main>
  );
}
