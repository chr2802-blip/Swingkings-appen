import type { TemplateOption } from "@/lib/activity-data";

/**
 * The team's standard jobs to tick, posted as repeated `templateId` fields. No hooks,
 * so a server page and a client dialog can both render it.
 */
export function TemplatePicker({ templates, defaultChecked = [] }: { templates: TemplateOption[]; defaultChecked?: string[] }) {
  return (
    <div className="grid max-h-60 grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-1.5 sm:grid-cols-2">
      {templates.map((template) => (
        <label
          key={template.id}
          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 has-[:checked]:bg-[color-mix(in_srgb,var(--accent)_10%,white)]"
        >
          <input
            type="checkbox"
            name="templateId"
            value={template.id}
            defaultChecked={defaultChecked.includes(template.id)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          <span className="min-w-0 flex-1 truncate">{template.title}</span>
          <span className="text-xs text-slate-400">{template.people === 1 ? "1 pers." : `${template.people} pers.`}</span>
        </label>
      ))}
    </div>
  );
}
