"use client";

import { createContext, useContext, useState } from "react";
import { Modal, ModalBody, ModalFooter } from "@/components/modal";
import { Avatar } from "@/components/photo";
import { Button, Field, Textarea } from "@/components/ui";
import { DialogForm } from "@/components/form-dialog";
import { MultiPhotoField } from "@/components/multi-photo-field";
import { useFormAction } from "@/components/use-form-action";
import { closePoll, deletePost, editPost, pinPost } from "@/app/actions/social";
import { MAX_POST_PHOTOS } from "@/lib/polls";
import type { PollViewData } from "@/components/poll-view";
import type { FormAction } from "@/lib/action-result";

/** Whether the viewer is choosing again in the post's poll — set from the menu, read by the poll. */
const ChangingVote = createContext<{ changing: boolean; setChanging: (value: boolean) => void }>({
  changing: false,
  setChanging: () => {},
});

export function PostState({ children }: { children: React.ReactNode }) {
  const [changing, setChanging] = useState(false);
  return <ChangingVote.Provider value={{ changing, setChanging }}>{children}</ChangingVote.Provider>;
}

export function useChangingVote() {
  return useContext(ChangingVote);
}

type Step = "menu" | "votes" | "delete" | "close";

/**
 * The ⋯ in a post's corner, with everything one can do to it: pin it to the top, edit it,
 * see who voted for what, vote again, close the poll and delete the post. Only what this
 * viewer may do is listed; pinning is for everybody, so there is always a button.
 */
export function PostMenu({
  postId,
  body,
  photoIds,
  pinned,
  canChange,
  poll,
}: {
  postId: string;
  body: string | null;
  photoIds: string[];
  pinned: boolean;
  /** The author and the team's admins: edit and delete. */
  canChange: boolean;
  poll: PollViewData | null;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState<Step>("menu");
  const { setChanging } = useChangingVote();
  const pin = useFormAction(pinPost, { onSuccess: () => setOpen(false) });

  const revealed = poll !== null && (poll.hasVoted || !poll.open);
  const canSeeVotes = revealed && !poll.anonymous && poll.ballots > 0;
  const canChangeVote = poll !== null && poll.open && poll.hasVoted && !poll.anonymous;
  const canClose = poll !== null && poll.open && poll.canClose;

  const close = () => setOpen(false);
  const show = (next: Step) => {
    setStep(next);
    setOpen(true);
  };
  const titles: Record<Step, string> = {
    menu: "Opslag",
    votes: "Stemmer",
    delete: "Slet opslaget?",
    close: "Luk afstemningen?",
  };
  const item = "press-card flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-slate-100";

  return (
    <>
      <button
        type="button"
        onClick={() => show("menu")}
        aria-label="Handlinger"
        className="press-button -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      <Modal open={open} onClose={close} title={titles[step]} size="drawer">
        {step === "menu" && (
          <ModalBody>
            <ul className="-mx-2 space-y-0.5">
              <li>
                <form onSubmit={pin.handleSubmit}>
                  <input type="hidden" name="id" value={postId} />
                  <input type="hidden" name="pinned" value={pinned ? "off" : "on"} />
                  <button type="submit" className={item} disabled={pin.pending} aria-busy={pin.pending}>
                    <span aria-hidden>📌</span> {pinned ? "Frigør fra toppen" : "Fastgør øverst"}
                  </button>
                  {pin.state?.ok === false && (
                    <p role="alert" className="px-3 text-sm text-red-600">
                      {pin.state.error}
                    </p>
                  )}
                </form>
              </li>
              {canChange && (
                <li>
                  <button
                    type="button"
                    className={item}
                    onClick={() => {
                      close();
                      setEditing(true);
                    }}
                  >
                    <span aria-hidden>✏️</span> Rediger opslag
                  </button>
                </li>
              )}
              {canSeeVotes && (
                <li>
                  <button type="button" className={item} onClick={() => setStep("votes")}>
                    <span aria-hidden>📊</span> Se stemmer
                  </button>
                </li>
              )}
              {canChangeVote && (
                <li>
                  <button
                    type="button"
                    className={item}
                    onClick={() => {
                      setChanging(true);
                      close();
                    }}
                  >
                    <span aria-hidden>🔄</span> Skift stemme
                  </button>
                </li>
              )}
              {canClose && (
                <li>
                  <button type="button" className={item} onClick={() => setStep("close")}>
                    <span aria-hidden>🔒</span> Luk afstemning
                  </button>
                </li>
              )}
              {canChange && (
                <li>
                  <button type="button" className={`${item} text-red-600`} onClick={() => setStep("delete")}>
                    <span aria-hidden>🗑️</span> Slet opslag
                  </button>
                </li>
              )}
            </ul>
          </ModalBody>
        )}
        {step === "votes" && poll && <Votes poll={poll} />}
        {step === "delete" && (
          <Confirm action={deletePost} fields={{ id: postId }} label="Slet" onBack={() => setStep("menu")} onDone={close} />
        )}
        {step === "close" && poll && (
          <Confirm
            action={closePoll}
            fields={{ pollId: poll.id }}
            label="Luk den"
            note="Resultatet bliver vist for alle, og der kan ikke stemmes mere."
            onBack={() => setStep("menu")}
            onDone={close}
          />
        )}
      </Modal>
      {canChange && (
        <Modal open={editing} onClose={() => setEditing(false)} title="Rediger opslag">
          {editing && (
            <DialogForm action={editPost} submitLabel="Gem" onDone={() => setEditing(false)} onCancel={() => setEditing(false)}>
              <input type="hidden" name="id" value={postId} />
              <MultiPhotoField max={MAX_POST_PHOTOS} initial={photoIds} />
              <Field label="Tekst" htmlFor={`body-${postId}`}>
                <Textarea id={`body-${postId}`} name="body" rows={4} maxLength={4000} defaultValue={body ?? ""} />
              </Field>
              {poll && <p className="text-xs text-slate-500">Afstemningen kan ikke ændres, når den først er delt.</p>}
            </DialogForm>
          )}
        </Modal>
      )}
    </>
  );
}

/** Who voted for each answer, most votes first. Never offered for an anonymous poll. */
function Votes({ poll }: { poll: PollViewData }) {
  return (
    <ModalBody>
      <ul className="space-y-4">
        {poll.options
          .filter((option) => option.votes > 0)
          .map((option, index) => (
            <li key={option.id} className="animate-row-in" style={{ animationDelay: `${index * 60}ms` }}>
              <p className="flex items-baseline justify-between gap-3 text-sm font-semibold">
                <span className="min-w-0 break-words">{option.text}</span>
                <span className="shrink-0 font-normal text-slate-500">
                  {option.votes === 1 ? "1 stemme" : `${option.votes} stemmer`}
                </span>
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {option.voters.map((voter) => (
                  <li key={voter.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pr-3 pl-1 text-sm">
                    <Avatar name={voter.name} photoId={voter.photoId} size="xs" />
                    {voter.name}
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ul>
    </ModalBody>
  );
}

function Confirm({
  action,
  fields,
  label,
  note = "Det kan ikke fortrydes.",
  onBack,
  onDone,
}: {
  action: FormAction;
  fields: Record<string, string>;
  label: string;
  note?: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const { state, pending, handleSubmit } = useFormAction(action, { onSuccess: onDone });
  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <ModalBody>
        <p className="text-sm text-slate-600">{note}</p>
      </ModalBody>
      <ModalFooter>
        {state?.ok === false && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {state.error}
          </p>
        )}
        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="secondary" onClick={onBack} className="flex-1 sm:flex-none">
            Tilbage
          </Button>
          <Button type="submit" variant="danger" disabled={pending} className="flex-1 sm:flex-none">
            {label}
          </Button>
        </div>
      </ModalFooter>
    </form>
  );
}
