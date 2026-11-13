import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { Bolt } from "@/components/crest";
import { ButtonLink, Card, PageHeader, SectionTitle } from "@/components/ui";
import { playerHref } from "@/components/player-link";
import { ProfileForm, PasswordForm } from "@/components/profile-forms";
import { NotificationSetup } from "@/components/notification-setup";
import { InstallSection } from "@/components/install-app";
import { LogoutButton } from "@/components/logout-button";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-xl space-y-8">
      {/* Your own page (fines, challenges, jobs) is the profile; this is where it is changed. */}
      <PageHeader
        title="Rediger profil"
        description={user.email}
        action={
          user.teamId && (
            <ButtonLink href={playerHref(user.id)} variant="secondary">
              Se min side
            </ButtonLink>
          )
        }
      />
      <Card>
        <ProfileForm name={user.name} photoId={user.photoId} canUpload={user.teamId !== null} />
      </Card>
      <section>
        <SectionTitle>App</SectionTitle>
        <InstallSection />
      </section>
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
