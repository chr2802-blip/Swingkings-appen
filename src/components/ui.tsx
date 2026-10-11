import Link from "next/link";
import type { ComponentProps } from "react";

const base =
  "press-button inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium disabled:opacity-50";

const variants = {
  /** The team's own colour: the button that does the thing. */
  primary: "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
  /** Red however the team is dressed: what it does is the same everywhere. */
  danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
  ghost: "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
} as const;

export type Variant = keyof typeof variants;

export function buttonClass(variant: Variant = "primary", className = "") {
  return `${base} ${variants[variant]} ${className}`;
}

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function Card({ className = "", padded = true, ...props }: ComponentProps<"div"> & { padded?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${padded ? "p-5" : ""} ${className}`}
      {...props}
    />
  );
}

const field =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${field} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea className={`${field} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select className={`${field} ${className}`} {...props} />;
}

export function Label({ className = "", ...props }: ComponentProps<"label">) {
  return <label className={`block text-sm font-medium text-slate-700 ${className}`} {...props} />;
}

/** A label above its control, and an optional hint below. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight break-words">{title}</h1>
        {action && <div className="flex shrink-0 gap-2">{action}</div>}
      </div>
      {description && <p className={`text-sm text-slate-500 ${action ? "mt-3" : "mt-1"}`}>{description}</p>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon, children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
      {icon && (
        <div
          aria-hidden="true"
          className="accent-tint-bg mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl"
        >
          {icon}
        </div>
      )}
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "red" | "amber" | "green" | "accent";
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-600",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-800",
    green: "bg-emerald-100 text-emerald-700",
    accent: "accent-tint-bg text-[var(--accent-text)]",
  } as const;
  return <span className={`inline-block rounded-full whitespace-nowrap px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

/** A row of section links at the top of a tab (Bøder · Udfordringer · Bødekatalog). */
export function Tabs({ items, current }: { items: { href: string; label: string }[]; current: string }) {
  return (
    <nav className="scrollbar-hidden -mx-1 mb-6 flex gap-1 overflow-x-auto px-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === current ? "page" : undefined}
          className={`press-button shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${
            item.href === current ? "bg-[var(--accent)] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
