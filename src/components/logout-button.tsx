"use client";

import { logout } from "@/app/actions/auth";
import { forgetPushHere } from "@/lib/push-client";

/** Logging out also takes this device off the account's notifications, while there is still a session to say whose. */
export function LogoutButton({ className = "" }: { className?: string }) {
  return (
    <form
      action={async () => {
        await forgetPushHere();
        await logout();
      }}
    >
      <button className={`press-button rounded-lg text-left ${className}`}>Log ud</button>
    </form>
  );
}
