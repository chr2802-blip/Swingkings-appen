import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { Bolt } from "@/components/crest";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { ProfileForm, PasswordForm } from "@/components/profile-forms";
import { NotificationSetup } from "@/components/notification-setup";
import { LogoutButton } from "@/components/logout-button";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageHeader title="Min profil" description={user.email} />
      <Card>
        <ProfileForm name={user.name} photoId={user.photoId} canUpload={user.teamId !== null} />
      </Card>
      <section>
        <SectionTitle>Notifikationer</SectionTitle>
        <NotificationSetup />
      </section>
      <section>
        <SectionTitle>Adgangskode</SectionTitle>
        <Card>
          <PasswordForm />
        </Card>
      </section>
      <LogoutButton className="text-sm text-slate-500 underline" />
      <footer className="flex flex-col items-center gap-2 pt-4 pb-2 text-center">
        <Image src="/logo.png" alt="" width={512} height={512} className="h-14 w-14 opacity-90" />
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
          <Bolt className="h-3.5 w-3.5" />
          Frederiksbjerg Swingkings
          <Bolt className="h-3.5 w-3.5 -scale-x-100" />
        </p>
        <p className="text-xs font-bold tracking-[0.3em] text-[var(--star)]">SIDEN 2022</p>
      </footer>
    </div>
  );
}
