import { requireUser } from "@/lib/auth";
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
    </div>
  );
}
