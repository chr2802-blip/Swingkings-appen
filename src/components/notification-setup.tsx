"use client";

import { useEffect, useState } from "react";
import { readPushState, turnOnPush, type PushState } from "@/lib/push-client";
import { sendTestPush } from "@/app/actions/push";
import { Button } from "@/components/ui";

/** Turning on notifications on this phone: fines, challenges, new jobs, chat. */
export function NotificationSetup({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void readPushState().then(setState);
  }, []);

  if (state === null || state === "unconfigured") return null;
  if (compact && state !== "off") return null;

  async function enable() {
    setBusy(true);
    try {
      setState(await turnOnPush());
    } catch {
      setNote("Notifikationer kunne ikke slås til.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <span aria-hidden className="text-xl">
        🔔
      </span>
      <p className="min-w-0 flex-1 text-slate-600">
        {state === "on" && "Notifikationer er slået til på denne enhed."}
        {state === "off" && "Få besked om bøder, udfordringer, opgaver og chat."}
        {state === "blocked" && "Notifikationer er blokeret i browserens indstillinger."}
        {state === "unsupported" && "Denne browser kan ikke vise notifikationer. Tilføj appen til hjemmeskærmen."}
        {note && <span className="block text-red-600">{note}</span>}
      </p>
      {state === "off" && (
        <Button onClick={enable} disabled={busy}>
          Slå til
        </Button>
      )}
      {state === "on" && !compact && (
        <Button
          variant="secondary"
          onClick={async () => {
            const delivered = await sendTestPush();
            setNote(delivered ? null : "Testen kom ikke frem.");
          }}
        >
          Send test
        </Button>
      )}
    </div>
  );
}
