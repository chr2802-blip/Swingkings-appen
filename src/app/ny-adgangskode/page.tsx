import Image from "next/image";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card } from "@/components/ui";
import { NewPasswordForm } from "@/components/profile-forms";

/**
 * Where a login with a temporary password from an admin lands, and where the app sends
 * them until they have chosen their own. Outside the app's frame: one thing to do.
 */
export default async function NewPasswordPage() {
  const user = await requireUser();
  if (!user.mustChangePassword) redirect("/oversigt");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <Image src="/logo.png" alt="" width={512} height={512} priority className="mx-auto mb-3 h-16 w-16 drop-shadow-md" />
        <h1 className="text-3xl">Vælg en ny adgangskode</h1>
        <p className="mt-1 text-sm text-slate-500">
          Du er logget ind med en midlertidig adgangskode. Vælg din egen, så kun du kender den.
        </p>
      </div>
      <Card>
        <NewPasswordForm />
      </Card>
    </main>
  );
}
