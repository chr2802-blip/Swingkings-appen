"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { DialogForm, FormDialog } from "@/components/form-dialog";
import { MenuTrigger } from "@/components/action-menu";
import { Field, Input, Textarea } from "@/components/ui";
import { PostFields } from "@/components/post-dialog";
import { createClubPost, saveClubActivity } from "@/app/actions/club";

export type ClubTeam = { id: string; name: string };

/**
 * Which of the club's teams something goes out to: a box per team, all ticked to begin
 * with (or those it is already shared with), posted as one `teamId` field per team.
 */
export function ClubTeamsField({ teams, chosen }: { teams: ClubTeam[]; chosen?: string[] }) {
  const [picked, setPicked] = useState(() => new Set(chosen ?? teams.map((t) => t.id)));
  const all = picked.size === teams.length;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
        <span>Hold</span>
        <button
          type="button"
          className="press-text tap-inline text-xs font-medium text-[var(--accent-text)]"
          onClick={() => setPicked(new Set(all ? [] : teams.map((t) => t.id)))}
        >
          {all ? "Fravælg alle" : "Vælg alle"}
        </button>
      </legend>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {teams.map((team) => (
          <li key={team.id}>
            <label className="press-card flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                name="teamId"
                value={team.id}
                checked={picked.has(team.id)}
                onChange={(e) =>
                  setPicked((now) => {
                    const next = new Set(now);
                    if (e.target.checked) next.add(team.id);
                    else next.delete(team.id);
                    return next;
                  })
                }
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {team.name}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** A club post: what a team's post holds — a poll's answers typed — sent to the teams ticked. */
export function ClubPostDialog({ clubName, teams }: { clubName: string; teams: ClubTeam[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuTrigger onClick={() => setOpen(true)}>Nyt klubopslag</MenuTrigger>
      <Modal open={open} onClose={() => setOpen(false)} title={`Del fra ${clubName}`}>
        {open && (
          <DialogForm action={createClubPost} submitLabel="Del" onDone={() => setOpen(false)} onCancel={() => setOpen(false)}>
            <ClubTeamsField teams={teams} />
            <PostFields members={null} />
          </DialogForm>
        )}
      </Modal>
    </>
  );
}

export type EditableClubActivity = {
  id: string;
  title: string;
  startsAtInput: string;
  location: string | null;
  note: string | null;
  teamIds: string[];
};

/**
 * A club activity — klubdag, generalforsamling — for the teams ticked, made or changed by
 * a club admin. Everybody on them signs up and comments on it; each team puts its own jobs on it.
 */
export function ClubActivityDialog({ teams, activity }: { teams: ClubTeam[]; activity?: EditableClubActivity }) {
  return (
    <FormDialog
      trigger={activity ? "Ret klubaktivitet" : "Ny klubaktivitet"}
      triggerVariant={activity ? "secondary" : "primary"}
      title={activity ? "Ret klubaktivitet" : "Ny klubaktivitet"}
      action={saveClubActivity}
      submitLabel="Gem aktivitet"
    >
      {activity && <input type="hidden" name="id" value={activity.id} />}
      <Field label="Navn" htmlFor="club-title">
        <Input id="club-title" name="title" defaultValue={activity?.title ?? ""} placeholder="Fx klubdag" maxLength={200} required />
      </Field>
      <Field label="Starter" htmlFor="club-startsAt">
        <Input id="club-startsAt" name="startsAt" type="datetime-local" defaultValue={activity?.startsAtInput} required />
      </Field>
      <Field label="Sted (valgfri)" htmlFor="club-location">
        <Input id="club-location" name="location" defaultValue={activity?.location ?? ""} maxLength={2000} />
      </Field>
      <Field label="Note (valgfri)" htmlFor="club-note">
        <Textarea id="club-note" name="note" rows={2} defaultValue={activity?.note ?? ""} maxLength={2000} />
      </Field>
      <ClubTeamsField teams={teams} chosen={activity?.teamIds} />
      {activity && <p className="text-xs text-slate-500">Et hold, der fravælges, mister aktiviteten med dets tilmeldinger, kommentarer og opgaver.</p>}
    </FormDialog>
  );
}
