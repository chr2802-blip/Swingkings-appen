"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { DialogForm } from "@/components/form-dialog";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { MultiPhotoField } from "@/components/multi-photo-field";
import { createPost } from "@/app/actions/social";
import { MAX_POLL_OPTIONS, MAX_POST_PHOTOS } from "@/lib/polls";

/**
 * A new feed post: pictures, words, and — switched on — a poll. "Kampens spiller" makes
 * every player an answer; otherwise the answers are typed. Anonymity is chosen here and
 * cannot be changed afterwards, which the form says.
 */
export function PostDialog({ matches }: { matches: { id: string; label: string }[] }) {
  const [open, setOpen] = useState<null | "post" | "poll">(null);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen("poll")}>
        Afstemning
      </Button>
      <Button type="button" onClick={() => setOpen("post")}>
        Nyt opslag
      </Button>
      <Modal open={open !== null} onClose={() => setOpen(null)} title={open === "poll" ? "Ny afstemning" : "Del med holdet"}>
        {open && (
          <DialogForm action={createPost} submitLabel="Del" onDone={() => setOpen(null)} onCancel={() => setOpen(null)}>
            <PostFields startWithPoll={open === "poll"} matches={matches} />
          </DialogForm>
        )}
      </Modal>
    </>
  );
}

function PostFields({ startWithPoll, matches }: { startWithPoll: boolean; matches: { id: string; label: string }[] }) {
  const [withPoll, setWithPoll] = useState(startWithPoll);
  const [kind, setKind] = useState<"custom" | "players">("custom");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [anonymous, setAnonymous] = useState(false);
  const [multiple, setMultiple] = useState(false);

  function preset(which: "player" | "party") {
    if (which === "player") {
      setKind("players");
      setQuestion("Kampens spiller");
      setMultiple(false);
    } else {
      setKind("custom");
      setQuestion("Hvornår skal vi holde fest?");
      setOptions(["", "", ""]);
      setMultiple(true);
    }
  }

  return (
    <>
      {withPoll && (
        <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
          <input type="hidden" name="withPoll" value="on" />
          <input type="hidden" name="pollKind" value={kind} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={kind === "players" ? "primary" : "secondary"} onClick={() => preset("player")}>
              ⭐ Kampens spiller
            </Button>
            <Button
              type="button"
              variant={question === "Hvornår skal vi holde fest?" ? "primary" : "secondary"}
              onClick={() => preset("party")}
            >
              🎉 Hvornår er der fest?
            </Button>
          </div>
          <Field label="Spørgsmål" htmlFor="pollQuestion">
            <Input
              id="pollQuestion"
              name="pollQuestion"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={200}
              placeholder="Fx hvem var dagens bedste?"
              required
            />
          </Field>
          <Field label="Svarmuligheder" htmlFor="pollKindSelect">
            <Select id="pollKindSelect" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="custom">Skriv selv svarene</option>
              <option value="players">Alle spillere på holdet</option>
            </Select>
          </Field>
          {kind === "custom" ? (
            <div className="space-y-2">
              {options.map((value, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    name="pollOption"
                    value={value}
                    onChange={(e) => setOptions((all) => all.map((o, i) => (i === index ? e.target.value : o)))}
                    maxLength={200}
                    aria-label={`Svar ${index + 1}`}
                    placeholder={question.startsWith("Hvornår") ? `Fx fredag d. ${14 + index}. november` : `Svar ${index + 1}`}
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
            </div>
          ) : (
            matches.length > 0 && (
              <Field label="Kamp (valgfri)" htmlFor="pollMatchId">
                <Select id="pollMatchId" name="pollMatchId" defaultValue="">
                  <option value="">Ingen bestemt kamp</option>
                  {matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="hidden" name="pollMultiple" value="off" />
            <input
              type="checkbox"
              name="pollMultiple"
              value="on"
              checked={multiple}
              onChange={(e) => setMultiple(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span>Man må vælge flere svar</span>
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
              Anonym afstemning
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
          {!startWithPoll && (
            <Button type="button" variant="ghost" onClick={() => setWithPoll(false)}>
              Fjern afstemning
            </Button>
          )}
        </section>
      )}
      <MultiPhotoField max={MAX_POST_PHOTOS} />
      <Field label="Tekst" htmlFor="body">
        <Textarea id="body" name="body" rows={3} maxLength={4000} placeholder="Hvad skete der?" />
      </Field>
      {!withPoll && (
        <Button type="button" variant="secondary" onClick={() => setWithPoll(true)}>
          🗳️ Tilføj afstemning
        </Button>
      )}
    </>
  );
}
