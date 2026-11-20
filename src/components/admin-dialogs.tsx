"use client";

import { useState } from "react";
import { Modal, ModalBody, ModalFooter } from "@/components/modal";
import { FormDialog } from "@/components/form-dialog";
import { MenuTrigger } from "@/components/action-menu";
import { Button, Field, Input, Select } from "@/components/ui";
import { ShareLink, isJoinPath } from "@/components/share-link";
import { useFormAction } from "@/components/use-form-action";
import { createClub } from "@/app/actions/club";
import { createTeam } from "@/app/actions/teams";

/** "Ny klub" in the super admin's "+": a name, and the new club's page opens. */
export function NewClubDialog() {
  return (
    <FormDialog trigger="Ny klub" triggerIcon="🏟️" title="Ny klub" action={createClub} submitLabel="Opret klub">
      <p className="text-sm text-slate-600">
        En klub samler flere hold. Klubbens admins laver klubopslag og klubaktiviteter til de hold, de vælger. Holdene
        opretter du på klubbens side.
      </p>
      <Field label="Klubbens navn" htmlFor="club-name">
        <Input id="club-name" name="name" required maxLength={80} placeholder="Fx Swingkings FC" />
      </Field>
    </FormDialog>
  );
}

/**
 * "Nyt hold": a team always has a club — the one whose page it is made on (`clubId`), or one
 * chosen from `clubs`. Made, the sheet stays open with the link for the team's first person,
 * which is shown this once.
 */
export function NewTeamDialog({ clubId, clubs }: { clubId?: string; clubs?: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuTrigger icon="⚽" onClick={() => setOpen(true)}>
        Nyt hold
      </MenuTrigger>
      <Modal open={open} onClose={() => setOpen(false)} title="Nyt hold">
        {open && <NewTeamForm clubId={clubId} clubs={clubs ?? []} onClose={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function NewTeamForm({ clubId, clubs, onClose }: { clubId?: string; clubs: { id: string; name: string }[]; onClose: () => void }) {
  const { state, pending, handleSubmit } = useFormAction(createTeam);
  const link = state?.ok && isJoinPath(state.note) ? state.note : null;

  if (link) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ModalBody className="space-y-3">
          <ShareLink path={link} />
          <p className="text-sm text-slate-600">
            Send linket til holdets første person. Når personen har oprettet sig, så åbn holdet her under Admin og gør
            dem til admin under Holdindstillinger.
          </p>
        </ModalBody>
        <ModalFooter>
          <div className="flex sm:justify-end">
            <Button type="button" onClick={onClose} className="flex-1 sm:flex-none">
              Færdig
            </Button>
          </div>
        </ModalFooter>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <ModalBody className="space-y-4">
        <Field label="Holdets navn" htmlFor="team-name">
          <Input id="team-name" name="name" required maxLength={200} placeholder="Fx Herrer 1" />
        </Field>
        {clubId ? (
          <input type="hidden" name="clubId" value={clubId} />
        ) : (
          <Field label="Klub" htmlFor="team-club">
            <Select id="team-club" name="clubId" defaultValue={clubs[0]?.id} required>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <p className="text-sm text-slate-600">Du får et link til holdets første person. Du bliver ikke selv medlem af holdet.</p>
      </ModalBody>
      <ModalFooter>
        {state?.ok === false && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {state.error}
          </p>
        )}
        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1 sm:flex-none">
            Annuller
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending} className="flex-1 sm:flex-none">
            {pending ? "Gemmer…" : "Opret hold"}
          </Button>
        </div>
      </ModalFooter>
    </form>
  );
}
