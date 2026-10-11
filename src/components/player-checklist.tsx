import { Avatar } from "@/components/photo";

/**
 * A list of players to tick, posted as repeated `name` fields. No hooks, so a server
 * page and a client dialog can both render it.
 */
export function PlayerChecklist({
  members,
  name,
  defaultChecked = [],
}: {
  members: { userId: string; name: string; photoId: string | null; shirtNumber?: number | null }[];
  name: string;
  defaultChecked?: string[];
}) {
  return (
    <div className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-1.5 sm:grid-cols-2">
      {members.map((member) => (
        <label
          key={member.userId}
          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 has-[:checked]:bg-[color-mix(in_srgb,var(--accent)_10%,white)]"
        >
          <input
            type="checkbox"
            name={name}
            value={member.userId}
            defaultChecked={defaultChecked.includes(member.userId)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          <Avatar name={member.name} photoId={member.photoId} size="xs" />
          <span className="min-w-0 flex-1 truncate">{member.name}</span>
          {member.shirtNumber != null && <span className="text-xs text-slate-400">#{member.shirtNumber}</span>}
        </label>
      ))}
    </div>
  );
}
