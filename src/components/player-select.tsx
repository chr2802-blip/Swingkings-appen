import { Avatar } from "@/components/photo";
import { MultiSelect } from "@/components/select";

type Member = { userId: string; name: string; photoId: string | null; shirtNumber?: number | null };

/**
 * Choosing players: the app's own drop-down (`MultiSelect`) with each player's picture and
 * shirt number, posted as one `name` field per player. The one way a form picks people —
 * who gets a fine, who is on a job, who a notice goes to, who a poll is about.
 */
export function PlayerSelect({
  id,
  name,
  members,
  defaultSelected = [],
  placeholder = "Vælg spillere…",
}: {
  /** The field's id, for the `<label htmlFor>` that names it and its drawer. */
  id: string;
  name: string;
  members: Member[];
  defaultSelected?: string[];
  placeholder?: string;
}) {
  return (
    <MultiSelect
      id={id}
      name={name}
      placeholder={placeholder}
      defaultValues={defaultSelected}
      choices={members.map((member) => ({
        value: member.userId,
        label: member.name,
        leading: <Avatar name={member.name} photoId={member.photoId} shirtNumber={member.shirtNumber} size="xs" />,
        detail: member.shirtNumber != null ? `#${member.shirtNumber}` : undefined,
      }))}
    />
  );
}
