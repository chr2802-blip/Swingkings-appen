"use client";

import { useState } from "react";
import { Modal, ModalBody } from "@/components/modal";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { ReactionGlyph } from "@/components/reactions";
import type { ReactionKind } from "@prisma/client";
import { REACTIONS } from "@/lib/reactions";

export type ReactorView = { id: string; name: string; photoId: string | null; kind: ReactionKind };

/**
 * Who reacted to a post: on the card the first few as overlapping faces and the rest as a
 * number, and pressing them opens everybody in a drawer, first to react first, each with
 * the reaction they gave.
 */
export function ReactorsDrawer({ reactors, shown, label }: { reactors: ReactorView[]; shown: number; label: string }) {
  const [open, setOpen] = useState(false);
  const faces = reactors.slice(0, shown);
  const more = reactors.length - faces.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className="press-button ml-auto flex shrink-0 items-center rounded-full py-1 pr-1 pl-2"
      >
        {faces.map((person) => (
          <Avatar key={person.id} name={person.name} photoId={person.photoId} size="xs" className="-ml-1.5 ring-2 ring-white first:ml-0" />
        ))}
        {more > 0 && <span className="ml-1.5 text-xs text-slate-500">+{more}</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Reaktioner" size="drawer">
        <ModalBody>
          <ul aria-label="Reaktioner" className="space-y-3">
            {reactors.map((person) => (
              <li key={person.id} className="flex items-center gap-3">
                <PlayerLink userId={person.id} className="flex min-w-0 flex-1 items-center gap-3 text-sm font-medium">
                  <Avatar name={person.name} photoId={person.photoId} size="sm" />
                  <span className="truncate">{person.name}</span>
                </PlayerLink>
                <span className="shrink-0">
                  <ReactionGlyph kind={person.kind} size="md" />
                  <span className="sr-only">{REACTIONS.find((r) => r.kind === person.kind)!.label}</span>
                </span>
              </li>
            ))}
          </ul>
        </ModalBody>
      </Modal>
    </>
  );
}
