"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { MemberRole } from "@prisma/client";
import { setMemberDues, setMemberRole } from "@/app/actions/teams";
import { RIGHT_CELL, rightState, roleAfterToggle, type RightColumn } from "@/lib/role-stack";

function Tick({
  label,
  checked,
  implied = false,
  tone = "accent",
  onToggle,
}: {
  label: string;
  checked: boolean;
  implied?: boolean;
  tone?: "accent" | "green";
  onToggle: () => void;
}) {
  const on = tone === "green" ? "border-emerald-600 bg-emerald-600 text-white" : "border-[var(--accent)] bg-[var(--accent)] text-white";
  const look = !checked
    ? "border-slate-300 bg-white text-transparent"
    : implied
      ? "accent-tint-bg border-transparent text-[var(--accent-text)]"
      : on;
  return (
    <div className={RIGHT_CELL}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-disabled={implied || undefined}
        aria-label={label}
        title={implied ? "Admin har altid bøderettigheder" : undefined}
        onClick={implied ? undefined : onToggle}
        className={`press-icon flex h-8 w-8 items-center justify-center rounded-lg border-2 text-base font-bold transition-colors ${look} ${implied ? "cursor-default" : ""}`}
      >
        <span aria-hidden>✓</span>
      </button>
    </div>
  );
}

/** One member's ticks: Bøder and Admin (the role stack) and kontingent. Saved on the press. */
export function MemberRights({ userId, name, role, duesPaid }: { userId: string; name: string; role: MemberRole; duesPaid: boolean }) {
  const [shownRole, showRole] = useOptimistic(role);
  const [shownPaid, showPaid] = useOptimistic(duesPaid);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggleRole(column: RightColumn) {
    const next = roleAfterToggle(shownRole, column);
    if (next === shownRole) return;
    setError(null);
    startTransition(async () => {
      showRole(next);
      const data = new FormData();
      data.set("userId", userId);
      data.set("role", next);
      const result = await setMemberRole(undefined, data);
      if (result?.ok === false) setError(result.error);
    });
  }

  function togglePaid() {
    const next = !shownPaid;
    setError(null);
    startTransition(async () => {
      showPaid(next);
      const data = new FormData();
      data.set("userId", userId);
      data.set("paid", next ? "on" : "off");
      const result = await setMemberDues(undefined, data);
      if (result?.ok === false) setError(result.error);
    });
  }

  const fines = rightState(shownRole, "fines");
  const admin = rightState(shownRole, "admin");
  return (
    <>
      <Tick label={`Bøder for ${name}`} checked={fines.checked} implied={fines.implied} onToggle={() => toggleRole("fines")} />
      <Tick label={`Admin for ${name}`} checked={admin.checked} onToggle={() => toggleRole("admin")} />
      <Tick label={`Kontingent betalt for ${name}`} checked={shownPaid} tone="green" onToggle={togglePaid} />
      {error && (
        <p role="alert" className="basis-full text-right text-xs text-red-600">
          {error}
        </p>
      )}
    </>
  );
}
