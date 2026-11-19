"use client";

import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/modal";
import { searchChoices } from "@/lib/search";

type Choice = { value: string; label: string; disabled: boolean; leading?: ReactNode; detail?: string };

/** The text of an `<option>`'s children: `{type.name} ({fineUnits(type.units)})` is one label. */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** The `<option>`s written as children, fragments and arrays flattened. */
function choicesOf(children: ReactNode): Choice[] {
  const choices: Choice[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: unknown; disabled?: boolean; children?: ReactNode }>(child)) return;
    if (child.type === Fragment) {
      choices.push(...choicesOf(child.props.children));
      return;
    }
    if (child.type !== "option") return;
    const label = textOf(child.props.children);
    choices.push({
      value: child.props.value === undefined ? label : String(child.props.value),
      label,
      disabled: Boolean(child.props.disabled),
    });
  });
  return choices;
}

const field =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

/**
 * The app's own drop-down, in place of the browser's `<select>`: written the same way —
 * `<option>`s as children, `name`, `value`/`defaultValue`, `required` — but it opens a
 * drawer with the choices and a search field. The value reaches the form through an input
 * of its own, which also carries `required` so the browser stops an empty submit. A
 * disabled `<option>` (the "Vælg …" line) is shown as the placeholder and is never a choice.
 */
export function Select({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  required,
  disabled,
  title,
  className = "",
  children,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** The drawer's heading; without it, the text of the field's `<label>`. */
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const all = choicesOf(children);
  const choices = all.filter((choice) => !choice.disabled);
  const initial = defaultValue ?? all[0]?.value ?? "";
  const [own, setOwn] = useState(initial);
  const current = value ?? own;
  const chosen = all.find((choice) => choice.value === current);
  const placeholder = chosen?.disabled || !chosen;

  const [open, setOpen] = useState(false);
  const [heading, setHeading] = useState(title ?? "");
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  // A form reset puts an uncontrolled field back where it started, as a `<select>` would.
  const initialRef = useRef(initial);
  useEffect(() => {
    const form = input.current?.form;
    if (!form || value !== undefined) return;
    const onReset = () => setOwn(initialRef.current);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [value]);

  function choose(next: string) {
    setOpen(false);
    if (next !== current) {
      if (value === undefined) setOwn(next);
      onValueChange?.(next);
    }
    button.current?.focus();
  }

  function openPicker() {
    if (disabled) return;
    if (!title && id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      setHeading(label?.textContent?.trim() || "Vælg");
    }
    setOpen(true);
  }

  return (
    <div className="relative">
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openPicker();
          }
        }}
        className={`${field} press-card flex items-center gap-2 text-left disabled:opacity-50 ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${placeholder ? "text-slate-400" : ""}`}>
          {chosen?.label || "Vælg…"}
        </span>
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-400" fill="currentColor">
          <path d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>
      {/* What the form submits. Not type="hidden", so `required` is checked; focus goes to the button. */}
      <input
        ref={input}
        name={name}
        value={chosen?.disabled ? "" : current}
        onChange={() => {}}
        required={required}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        onFocus={() => button.current?.focus()}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0"
      />
      <Modal open={open} onClose={() => setOpen(false)} title={title ?? heading} size="drawer">
        {/* Mounted with the drawer, so it leaves with it and opens afresh every time. */}
        <Picker listId={listId} title={title ?? heading} choices={choices} isSelected={(v) => v === current} onChoose={choose} />
      </Modal>
    </div>
  );
}

function Picker({
  listId,
  title,
  choices,
  isSelected,
  onChoose,
  multiple = false,
  onDone,
  doneLabel,
  onAll,
}: {
  listId: string;
  title: string;
  choices: Choice[];
  isSelected: (value: string) => boolean;
  /** One choice pressed: the single drop-down closes on it, the multiple one ticks it on or off. */
  onChoose: (value: string) => void;
  multiple?: boolean;
  onDone?: () => void;
  doneLabel?: string;
  /** The multiple drop-down's "Vælg alle"/"Fjern alle": everything ticked, or nothing. */
  onAll?: (all: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = searchChoices(choices, query);
  const [active, setActive] = useState(() => Math.max(0, shown.findIndex((c) => isSelected(c.value))));
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // A keyboard and mouse get the search field straight away; a phone is not handed a keyboard it did not ask for.
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) search.current?.focus();
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-slate-100 px-5 py-3">
        <input
          ref={search}
          type="search"
          role="searchbox"
          aria-label="Søg"
          aria-controls={listId}
          placeholder="Søg…"
          autoComplete="off"
          enterKeyHint="done"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((i) => Math.min(i + 1, shown.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const pick = shown[active];
              if (pick) onChoose(pick.value);
            }
          }}
          className={field}
        />
      </div>
      <div
        ref={list}
        id={listId}
        role="listbox"
        aria-label={title}
        aria-multiselectable={multiple || undefined}
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2 ${
          multiple ? "pb-2" : "pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        }`}
      >
        {shown.map((choice, index) => {
          const selected = isSelected(choice.value);
          return (
            <button
              key={choice.value}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onChoose(choice.value)}
              onMouseMove={() => setActive(index)}
              className={`press-card flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${
                index === active ? "bg-slate-100" : ""
              } ${selected ? "font-semibold text-[var(--accent-text)]" : "text-slate-800"}`}
            >
              {multiple && (
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    selected ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-slate-300 bg-white"
                  }`}
                >
                  {selected && <Tick className="h-3.5 w-3.5" />}
                </span>
              )}
              {choice.leading}
              <span className="min-w-0 flex-1 break-words">{choice.label}</span>
              {choice.detail && <span className="shrink-0 text-xs font-normal text-slate-400">{choice.detail}</span>}
              {!multiple && selected && <Tick className="h-4 w-4 shrink-0" />}
            </button>
          );
        })}
        {shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">Ingen match</p>}
      </div>
      {multiple && (
        <div className="flex shrink-0 gap-2 border-t border-slate-100 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {onAll && (
            <button
              type="button"
              onClick={() => onAll(!choices.every((choice) => isSelected(choice.value)))}
              className="press-button shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              {choices.every((choice) => isSelected(choice.value)) ? "Fjern alle" : "Vælg alle"}
            </button>
          )}
          <button
            type="button"
            onClick={onDone}
            className="press-button min-w-0 flex-1 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            {doneLabel ?? "Færdig"}
          </button>
        </div>
      )}
    </div>
  );
}

function Tick({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={className} fill="currentColor">
      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4l3.3 3.29 7.3-7.3a1 1 0 0 1 1.4 0Z" />
    </svg>
  );
}

export type MultiChoice = { value: string; label: string; leading?: ReactNode; detail?: string };

/**
 * The same drop-down for more than one choice — who gets the fine. The field shows what is
 * chosen; the drawer is the same list with the same search, where a press ticks a choice
 * on or off and "Færdig" closes it. Posted as one `name` field per choice, like a row of
 * checkboxes would be.
 */
export function MultiSelect({
  id,
  name,
  choices,
  defaultValues = [],
  placeholder = "Vælg…",
  title,
  onValuesChange,
}: {
  id?: string;
  name: string;
  choices: MultiChoice[];
  defaultValues?: string[];
  placeholder?: string;
  title?: string;
  /** Told every change, for a form that shows something about what is chosen. */
  onValuesChange?: (values: string[]) => void;
}) {
  const [values, setOwn] = useState<string[]>(defaultValues);
  const setValues = (next: string[]) => {
    setOwn(next);
    onValuesChange?.(next);
  };
  const [open, setOpen] = useState(false);
  const [heading, setHeading] = useState(title ?? "");
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const chosen = choices.filter((choice) => values.includes(choice.value));
  const summary = chosen.map((choice) => choice.label).join(", ");

  function toggle(value: string) {
    setValues(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  function openPicker() {
    if (!title && id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      setHeading(label?.textContent?.trim() || "Vælg");
    }
    setOpen(true);
  }

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  return (
    <div className="relative">
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openPicker();
          }
        }}
        className={`${field} press-card flex items-center gap-2 text-left`}
      >
        <span className={`min-w-0 flex-1 truncate ${chosen.length === 0 ? "text-slate-400" : ""}`}>
          {summary || placeholder}
        </span>
        {chosen.length > 1 && (
          <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,white)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-text)]">
            {chosen.length}
          </span>
        )}
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-400" fill="currentColor">
          <path d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>
      {values.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <Modal open={open} onClose={close} title={title ?? heading} size="drawer">
        <Picker
          listId={listId}
          title={title ?? heading}
          choices={choices.map((choice) => ({ ...choice, disabled: false }))}
          isSelected={(value) => values.includes(value)}
          onChoose={toggle}
          multiple
          onDone={close}
          onAll={(all) => setValues(all ? choices.map((choice) => choice.value) : [])}
          doneLabel={chosen.length > 0 ? `Færdig (${chosen.length} valgt)` : "Færdig"}
        />
      </Modal>
    </div>
  );
}
