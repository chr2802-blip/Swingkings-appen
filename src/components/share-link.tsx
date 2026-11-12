"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";

/**
 * A freshly made invitation link, with copy and share. The server only knows the path:
 * the address in front of it is wherever the admin is looking at the app.
 */
export function ShareLink({ path, teamName }: { path: string; teamName?: string }) {
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}${path}`);
    setCanShare(typeof navigator.share === "function");
    setCopied(false);
  }, [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard (an old browser, or no permission): the field is selectable.
    }
  }

  async function share() {
    try {
      await navigator.share({ title: teamName ? `Kom med på ${teamName}` : "Kom med på holdet", url });
    } catch {
      // Cancelled.
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:col-span-2">
      <p className="text-sm font-medium text-emerald-800">Linket er klar. Det vises kun nu — kopiér det og send det.</p>
      <Input readOnly value={url} onFocus={(event) => event.currentTarget.select()} aria-label="Invitationslink" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copy}>
          {copied ? "Kopieret ✓" : "Kopiér link"}
        </Button>
        {canShare && (
          <Button type="button" variant="secondary" onClick={share}>
            Del…
          </Button>
        )}
      </div>
    </div>
  );
}

/** Whether an action's note is a link it made, rather than words. */
export function isJoinPath(note: string | undefined): note is string {
  return typeof note === "string" && note.startsWith("/join/");
}
