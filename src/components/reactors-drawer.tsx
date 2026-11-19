"use client";

import { useState } from "react";
import type { ReactionKind } from "@prisma/client";
import { Modal, ModalBody } from "@/components/modal";
import { Avatar } from "@/components/photo";
import { PlayerLink } from "@/components/player-link";
import { ReactionGlyph } from "@/components/reaction-glyph";
import { REACTIONS, tallyReactions, type Reactor } from "@/lib/reactions";

/**
 * Who reacted to a thing, the Facebook way: tabs along the top — everybody, then each
 * kind with its count, most given first — and the people below, first to react first,
 * each with what they gave as a badge on their picture.
 */
export function ReactorsDrawer({ open, onClose, reactors }: { open: boolean; onClose: () => void; reactors: Reactor[] }) {
  const [tab, setTab] = useState<ReactionKind | "ALL">("ALL");
  const tally = tallyReactions(reactors, "");
  const shown = tab === "ALL" ? reactors : reactors.filter((r) => r.kind === tab);

  return (
    <Modal
      open={open}
      onClose={() => {
        setTab("ALL");
        onClose();
      }}
      title="Reaktioner"
      size="drawer"
    >
      <div role="tablist" aria-label="Vis reaktioner" className="scrollbar-hidden flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 px-4 py-2">
        <Tab selected={tab === "ALL"} onSelect={() => setTab("ALL")} label={`Alle ${tally.total}`}>
          Alle {tally.total}
        </Tab>
        {tally.kinds.map(({ kind, count }) => (
          <Tab key={kind} selected={tab === kind} onSelect={() => setTab(kind)} label={`${REACTIONS.find((r) => r.kind === kind)!.label} ${count}`}>
            <ReactionGlyph kind={kind} size="md" />
            {count}
          </Tab>
        ))}
      </div>
      <ModalBody>
        <ul aria-label="Reaktioner" className="space-y-3">
          {shown.map((person) => (
            <li key={person.id}>
              <PlayerLink userId={person.id} press="button" className="flex items-center gap-3 text-sm font-medium">
                <span className="relative shrink-0">
                  <Avatar name={person.name} photoId={person.photoId} size="sm" />
                  <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow ring-1 ring-slate-200">
                    <ReactionGlyph kind={person.kind} />
                  </span>
                </span>
                <span className="min-w-0 truncate">{person.name}</span>
                <span className="sr-only">{REACTIONS.find((r) => r.kind === person.kind)!.label}</span>
              </PlayerLink>
            </li>
          ))}
        </ul>
      </ModalBody>
    </Modal>
  );
}

function Tab({ selected, onSelect, label, children }: { selected: boolean; onSelect: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-label={label}
      onClick={onSelect}
      className={`press-button flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold tabular-nums ${
        selected ? "bg-[color-mix(in_srgb,var(--accent)_14%,white)] text-[var(--accent-text)]" : "text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}
