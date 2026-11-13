"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { DialogForm } from "@/components/form-dialog";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { MenuTrigger } from "@/components/action-menu";
import { MultiPhotoField } from "@/components/multi-photo-field";
import { PlayerChecklist } from "@/components/player-checklist";
import { createPost } from "@/app/actions/social";
import { MAX_POLL_OPTIONS, MAX_POST_PHOTOS } from "@/lib/polls";

type Member = { userId: string; name: string; photoId: string | null; shirtNumber: number | null };

/**
 * A new feed post: pictures, words and — switched on — a poll. The poll's answers are
 * typed, or ticked on the team's roster. Anonymity is chosen here and cannot be changed
 * afterwards, which the form says.
 */
export function PostDialog({ members }: { members: Member[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuTrigger onClick={() => setOpen(true)}>Nyt opslag</MenuTrigger>
      <Modal open={open} onClose={() => setOpen(false)} title="Del med holdet">
        {open && (
          <DialogForm action={createPost} submitLabel="Del" onDone={() => setOpen(false)} onCancel={() => setOpen(false)}>
            <PostFields members={members} />
          </DialogForm>
        )}
      </Modal>
    </>
  );
}

function PostFields({ members }: { members: Member[] }) {
  const [withPoll, setWithPoll] = useState(false);
  const [kind, setKind] = useState<"custom" | "players">("custom");
  const [options, setOptions] = useState(["", ""]);
  const [anonymous, setAnonymous] = useState(false);

  return (
    <>
      <MultiPhotoField max={MAX_POST_PHOTOS} />
      <Field label="Tekst" htmlFor="body">
        <Textarea id="body" name="body" rows={3} maxLength={4000} placeholder="Hvad skete der?" />
      </Field>
      {withPoll ? (
        <section aria-label="Afstemning" className="space-y-4 rounded-2xl border border-slate-200 p-4">
          <input type="hidden" name="withPoll" value="on" />
          <input type="hidden" name="pollKind" value={kind} />
          <Field label="Spørgsmål" htmlFor="pollQuestion">
            <Input id="pollQuestion" name="pollQuestion" maxLength={200} placeholder="Fx hvem var dagens bedste?" required />
          </Field>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Svarmuligheder</legend>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={kind === "custom" ? "primary" : "secondary"} aria-pressed={kind === "custom"} onClick={() => setKind("custom")}>
                Skriv svar
              </Button>
              <Button type="button" variant={kind === "players" ? "primary" : "secondary"} aria-pressed={kind === "players"} onClick={() => setKind("players")}>
                Vælg fra holdlisten
              </Button>
            </div>
            {kind === "custom" ? (
              <>
                {options.map((value, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      name="pollOption"
                      value={value}
                      onChange={(e) => setOptions((all) => all.map((o, i) => (i === index ? e.target.value : o)))}
                      maxLength={200}
                      aria-label={`Svar ${index + 1}`}
                      placeholder={`Svar ${index + 1}`}
                    />
                    {options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Fjern svar ${index + 1}`}
                        onClick={() => setOptions((all) => all.filter((_, i) => i !== index))}
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                ))}
                {options.length < MAX_POLL_OPTIONS && (
                  <Button type="button" variant="ghost" onClick={() => setOptions((all) => [...all, ""])}>
                    + Tilføj svar
                  </Button>
                )}
              </>
            ) : (
              <>
                <input type="hidden" name="pollPickPlayers" value="on" />
                <PlayerChecklist members={members} name="pollPlayerId" defaultChecked={members.map((m) => m.userId)} />
              </>
            )}
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input type="hidden" name="pollMultiple" value="off" />
            <input type="checkbox" name="pollMultiple" value="on" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
            <span>Flere svar — man må vælge mere end ét</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="hidden" name="pollAnonymous" value="off" />
            <input
              type="checkbox"
              name="pollAnonymous"
              value="on"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              Anonym
              <span className="block text-xs text-slate-500">
                {anonymous
                  ? "Ingen — heller ikke trænere eller admin — kan se, hvem der har stemt hvad. En stemme kan ikke ændres bagefter, og det kan ikke slås fra igen."
                  : "Alle kan se, hvem der har stemt hvad."}
              </span>
            </span>
          </label>
          <Field label="Slutter (valgfri)" htmlFor="pollClosesAt" hint="Uden sluttidspunkt er den åben, til du lukker den.">
            <Input id="pollClosesAt" name="pollClosesAt" type="datetime-local" />
          </Field>
          <Button type="button" variant="ghost" onClick={() => setWithPoll(false)}>
            Fjern afstemning
          </Button>
        </section>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setWithPoll(true)}>
          🗳️ Tilføj afstemning
        </Button>
      )}
    </>
  );
}
