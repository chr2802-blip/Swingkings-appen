"use client";

import { useState } from "react";
import { useFormAction } from "@/components/use-form-action";
import { Avatar } from "@/components/photo";
import { Badge, Button } from "@/components/ui";
import { useChangingVote } from "@/components/post-menu";
import { vote } from "@/app/actions/social";

/** Results show this many answers until "Vis alle" is pressed. */
const RESULTS_SHOWN = 5;

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
 * A poll on a post. Before voting: the answers to pick, in two columns once there are
 * more than four, so nothing scrolls. After voting — or once it is closed — the
 * results, most votes first. Who voted for what, voting again and closing the poll are
 * in the post's ⋯ menu (`PostMenu`).
 */
export function PollView({ poll }: { poll: PollViewData }) {
  const { changing, setChanging } = useChangingVote();
  const [showAll, setShowAll] = useState(false);
  const { state, pending, handleSubmit } = useFormAction(vote, { onSuccess: () => setChanging(false) });
  const showResults = (poll.hasVoted || !poll.open) && !changing;
  const twoColumns = poll.options.length > 4;
  const shown = showAll ? poll.options : poll.options.slice(0, RESULTS_SHOWN);

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
          {shown.map((option) => (
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
            </li>
          ))}
          {poll.options.length > RESULTS_SHOWN && (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="press-button px-1 text-sm font-medium text-[var(--accent-text)]"
              >
                {showAll ? "Vis færre" : `Vis alle ${poll.options.length} svar`}
              </button>
            </li>
          )}
        </ul>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-2">
          <input type="hidden" name="pollId" value={poll.id} />
          <ul className={twoColumns ? "grid grid-cols-2 gap-1.5" : "space-y-1.5"}>
            {poll.options.map((option) => (
              <li key={option.id} className="min-w-0">
                <label
                  className={`press-card flex h-full cursor-pointer items-center rounded-xl border border-slate-200 bg-white text-sm has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[color-mix(in_srgb,var(--accent)_8%,white)] ${
                    twoColumns ? "gap-2 px-2.5 py-2" : "gap-2.5 px-3 py-2.5"
                  }`}
                >
                  <input
                    type={poll.multipleChoice ? "checkbox" : "radio"}
                    name="optionId"
                    value={option.id}
                    defaultChecked={poll.myChoices.includes(option.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                  />
                  {option.isPlayer && <Avatar name={option.text} photoId={option.playerPhotoId} size="xs" />}
                  <span className="min-w-0 flex-1 leading-tight break-words">{option.text}</span>
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
      </div>
    </div>
  );
}
