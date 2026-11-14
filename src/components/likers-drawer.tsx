"use client";

import { useState } from "react";
import { Modal, ModalBody } from "@/components/modal";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";

export type LikerView = { id: string; name: string; photoId: string | null };

/**
 * Who liked a post: on the card the first few as overlapping faces and the rest as a
 * number, and pressing them opens everybody in a drawer, first to like first.
 */
export function LikersDrawer({ likers, shown, label }: { likers: LikerView[]; shown: number; label: string }) {
  const [open, setOpen] = useState(false);
  const faces = likers.slice(0, shown);
  const more = likers.length - faces.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className="press-button ml-auto flex shrink-0 items-center rounded-full py-1 pr-1 pl-2"
      >
        {faces.map((liker) => (
          <Avatar key={liker.id} name={liker.name} photoId={liker.photoId} size="xs" className="-ml-1.5 ring-2 ring-white first:ml-0" />
        ))}
        {more > 0 && <span className="ml-1.5 text-xs text-slate-500">+{more}</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Synes godt om" size="drawer">
        <ModalBody>
          <ul aria-label="Synes godt om" className="space-y-3">
            {likers.map((liker) => (
              <li key={liker.id}>
                <PlayerLink userId={liker.id} className="flex items-center gap-3 text-sm font-medium">
                  <Avatar name={liker.name} photoId={liker.photoId} size="sm" />
                  {liker.name}
                </PlayerLink>
              </li>
            ))}
          </ul>
        </ModalBody>
      </Modal>
    </>
  );
}
