"use client";

import { useState } from "react";
import { useFormAction } from "@/components/use-form-action";
import { Avatar } from "@/components/photo";
import { Badge, Button } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { closePoll, vote } from "@/app/actions/social";

export type PollOptionView = {
  id: string;
  text: string;
  playerPhotoId: string | null;
  isPlayer: boolean;
  votes: number;
  share: number;
  leading: boolean;
  /** Who voted for it — always empty in an anonymous poll, where nobody is told. */
  voters: { id: string; name: string; photoId: string | null }[];
};

export type PollViewData = {
  id: string;
  question: string;
  anonymous: boolean;
  multipleChoice: boolean;
  open: boolean;
  closesLabel: string | null;
  matchLabel: string | null;
  ballots: number;
  hasVoted: boolean;
  /** What the viewer chose, in an open (non-anonymous) poll. */
  myChoices: string[];
  canClose: boolean;
  options: PollOptionView[];
};

/**
 * A poll on a post. Before voting: the answers to pick. After voting — or once it is
 * closed — the results, with names beside each answer unless the poll is anonymous.
 * An open poll can be voted again ("Skift stemme") until it closes.
 */
export function PollView({ poll }: { poll: PollViewData }) {
  const [changing, setChanging] = useState(false);
  const { state, pending, handleSubmit } = useFormAction(vote, { onSuccess: () => setChanging(false) });
  const showResults = (poll.hasVoted || !poll.open) && !changing;

  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
      <div className="space-y-1">
        <p className="font-display text-lg leading-snug">{poll.question}</p>
        <div className="flex flex-wrap gap-1.5">
          {poll.anonymous && <Badge tone="accent">🔒 Anonym</Badge>}
          {poll.multipleChoice && <Badge>Flere svar</Badge>}
          {poll.open ? poll.closesLabel && <Badge>{poll.closesLabel}</Badge> : <Badge tone="neutral">Lukket</Badge>}
          {poll.matchLabel && <Badge>⚽ {poll.matchLabel}</Badge>}
        </div>
      </div>

      {showResults ? (
        <ul className="space-y-2">
          {poll.options.map((option) => (
            <li key={option.id}>
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 ${option.leading ? "bg-[color-mix(in_srgb,var(--accent)_22%,white)]" : "bg-slate-100"}`}
                  style={{ width: `${Math.round(option.share * 100)}%` }}
                />
                <div className="relative flex items-center gap-2 px-3 py-2 text-sm">
                  {option.isPlayer && <Avatar name={option.text} photoId={option.playerPhotoId} size="xs" />}
                  <span className={`min-w-0 flex-1 truncate ${option.leading ? "font-semibold" : ""}`}>
                    {option.leading && !poll.open && "🏆 "}
                    {option.text}
                    {poll.myChoices.includes(option.id) && <span className="ml-1 text-xs text-slate-500">(din stemme)</span>}
                  </span>
                  <span className="shrink-0 text-slate-600">
                    {option.votes} · {Math.round(option.share * 100)}%
                  </span>
                </div>
              </div>
              {option.voters.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-x-2 px-1 text-xs text-slate-500">
                  {option.voters.map((v) => v.name.split(" ")[0]).join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-2">
          <input type="hidden" name="pollId" value={poll.id} />
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">
            {poll.options.map((option) => (
              <li key={option.id}>
                <label className="press-card flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[color-mix(in_srgb,var(--accent)_8%,white)]">
                  <input
                    type={poll.multipleChoice ? "checkbox" : "radio"}
                    name="optionId"
                    value={option.id}
                    defaultChecked={poll.myChoices.includes(option.id)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {option.isPlayer && <Avatar name={option.text} photoId={option.playerPhotoId} size="xs" />}
                  <span className="min-w-0 flex-1">{option.text}</span>
                </label>
              </li>
            ))}
          </ul>
          {state?.ok === false && (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Stemmer…" : "Stem"}
            </Button>
            {changing && (
              <Button type="button" variant="ghost" onClick={() => setChanging(false)}>
                Annuller
              </Button>
            )}
            {poll.anonymous && <span className="text-xs text-slate-500">Din stemme er anonym og kan ikke ændres.</span>}
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          {poll.ballots === 1 ? "1 har stemt" : `${poll.ballots} har stemt`}
          {poll.hasVoted && poll.anonymous && " · du har stemt"}
        </span>
        {showResults && poll.open && poll.hasVoted && !poll.anonymous && (
          <Button type="button" variant="ghost" className="px-2! py-1! text-xs" onClick={() => setChanging(true)}>
            Skift stemme
          </Button>
        )}
        {poll.open && poll.canClose && (
          <ActionButton
            action={closePoll}
            fields={{ pollId: poll.id }}
            label="Luk afstemning"
            variant="ghost"
            className="px-2! py-1! text-xs"
            confirm="Luk afstemningen?"
            confirmLabel="Luk den"
          />
        )}
      </div>
    </div>
  );
}
