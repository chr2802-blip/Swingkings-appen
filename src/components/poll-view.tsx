"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Avatar } from "@/components/photo";
import { Modal, ModalBody } from "@/components/modal";
import { PlayerLink } from "@/components/player-link";
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
 * more than four, so nothing scrolls. With one answer allowed each answer is a button and
 * pressing it is the vote; with several, they are ticked and sent with "Stem". After
 * voting — or once it is closed — the results, most votes first, their bars growing in.
 * Pressing "x har stemt" under the results lists who voted for what — never in an
 * anonymous poll, and not before the results are shown. Voting again and closing the
 * poll are in the post's ⋯ menu (`PostMenu`).
 */
export function PollView({ poll }: { poll: PollViewData }) {
  const { changing, setChanging } = useChangingVote();
  const [showAll, setShowAll] = useState(false);
  const [showVotes, setShowVotes] = useState(false);
  const [state, setState] = useState<ActionResult>(undefined);
  const [pending, startTransition] = useTransition();
  /** The answer just pressed, while its vote is on the way. */
  const [pressed, setPressed] = useState<string | null>(null);

  function send(optionIds: string[]) {
    const data = new FormData();
    data.set("pollId", poll.id);
    for (const id of optionIds) data.append("optionId", id);
    startTransition(async () => {
      const result = await vote(undefined, data);
      setState(result);
      setPressed(null);
      if (result?.ok) setChanging(false);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(new FormData(event.currentTarget).getAll("optionId").map(String));
  }

  const showResults = (poll.hasVoted || !poll.open) && !changing;
  const canSeeVotes = (poll.hasVoted || !poll.open) && !poll.anonymous && poll.ballots > 0;
  const voted = poll.ballots === 1 ? "1 har stemt" : `${poll.ballots} har stemt`;
  const twoColumns = poll.options.length > 4;
  const answer = `press-card flex h-full w-full cursor-pointer items-center rounded-xl border border-slate-200 bg-white text-left text-sm ${
    twoColumns ? "gap-2 px-2.5 py-2" : "gap-2.5 px-3 py-2.5"
  }`;
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
          {shown.map((option, index) => (
            <li key={option.id} className="animate-row-in" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                <span
                  aria-hidden
                  className={`animate-bar-grow absolute inset-y-0 left-0 ${option.leading ? "bg-[color-mix(in_srgb,var(--accent)_22%,white)]" : "bg-slate-100"}`}
                  style={{ width: `${Math.round(option.share * 100)}%`, animationDelay: `${120 + Math.min(index, 8) * 60}ms` }}
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
            {poll.options.map((option) => {
              const inner = (
                <>
                  {option.isPlayer && <Avatar name={option.text} photoId={option.playerPhotoId} size="xs" />}
                  <span className="min-w-0 flex-1 leading-tight break-words">{option.text}</span>
                </>
              );
              const mine = pressed ? pressed === option.id : poll.myChoices.includes(option.id);
              return (
                <li key={option.id} className="min-w-0">
                  {poll.multipleChoice ? (
                    <label className={`${answer} has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[color-mix(in_srgb,var(--accent)_8%,white)]`}>
                      <input
                        type="checkbox"
                        name="optionId"
                        value={option.id}
                        defaultChecked={poll.myChoices.includes(option.id)}
                        className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                      {inner}
                    </label>
                  ) : (
                    // One answer allowed: pressing it is the vote, there is no "Stem".
                    <button
                      type="button"
                      disabled={pending}
                      aria-pressed={mine}
                      aria-busy={pending && pressed === option.id}
                      onClick={() => {
                        setPressed(option.id);
                        send([option.id]);
                      }}
                      className={`${answer} disabled:cursor-default ${
                        mine ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,white)]" : pending ? "opacity-60" : ""
                      }`}
                    >
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {state?.ok === false && (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 empty:hidden">
            {poll.multipleChoice && (
              <Button type="submit" disabled={pending}>
                {pending ? "Stemmer…" : "Stem"}
              </Button>
            )}
            {changing && (
              <Button type="button" variant="ghost" onClick={() => setChanging(false)}>
                Annuller
              </Button>
            )}
            {poll.anonymous && (
              <span className="text-xs text-slate-500">
                {poll.multipleChoice
                  ? "Din stemme er anonym og kan ikke ændres."
                  : "Tryk på et svar for at stemme. Din stemme er anonym og kan ikke ændres."}
              </span>
            )}
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {canSeeVotes ? (
          <button
            type="button"
            onClick={() => setShowVotes(true)}
            className="press-button -mx-1 rounded-md px-1 py-0.5 font-medium text-[var(--accent-text)] underline-offset-2 hover:underline"
          >
            {voted}
          </button>
        ) : (
          <span>
            {voted}
            {poll.hasVoted && poll.anonymous && " · du har stemt"}
          </span>
        )}
      </div>
      {canSeeVotes && (
        <Modal open={showVotes} onClose={() => setShowVotes(false)} title="Stemmer" size="drawer">
          <Votes poll={poll} />
        </Modal>
      )}
    </div>
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
                  <li key={voter.id}>
                    <PlayerLink userId={voter.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pr-3 pl-1 text-sm">
                      <Avatar name={voter.name} photoId={voter.photoId} size="xs" />
                      {voter.name}
                    </PlayerLink>
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ul>
    </ModalBody>
  );
}
