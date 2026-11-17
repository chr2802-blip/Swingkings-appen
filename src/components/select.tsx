"use client";

import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/modal";
import { searchChoices } from "@/lib/search";

type Choice = { value: string; label: string; disabled: boolean };

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
        className={`${field} flex items-center gap-2 text-left disabled:opacity-50 ${className}`}
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
        <Picker listId={listId} title={title ?? heading} choices={choices} current={current} onChoose={choose} />
      </Modal>
    </div>
  );
}

function Picker({
  listId,
  title,
  choices,
  current,
  onChoose,
}: {
  listId: string;
  title: string;
  choices: Choice[];
  current: string;
  onChoose: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = searchChoices(choices, query);
  const [active, setActive] = useState(() => Math.max(0, shown.findIndex((c) => c.value === current)));
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
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        {shown.map((choice, index) => {
          const selected = choice.value === current;
          return (
            <button
              key={choice.value}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onChoose(choice.value)}
              onMouseMove={() => setActive(index)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${
                index === active ? "bg-slate-100" : ""
              } ${selected ? "font-semibold text-[var(--accent-text)]" : "text-slate-800"}`}
            >
              <span className="min-w-0 flex-1 break-words">{choice.label}</span>
              {selected && (
                <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="currentColor">
                  <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4l3.3 3.29 7.3-7.3a1 1 0 0 1 1.4 0Z" />
                </svg>
              )}
            </button>
          );
        })}
        {shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">Ingen match</p>}
      </div>
    </div>
  );
}
