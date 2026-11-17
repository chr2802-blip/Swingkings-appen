"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A text that may run long (an activity's note): it starts folded to a few lines, and
 * "Vis mere" unfolds it. The button is there only when the text is in fact cut off —
 * measured in the browser, and again when the width changes.
 */
export function ClampedText({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const id = useId();

  useEffect(() => {
    const element = ref.current;
    if (!element || open) return;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [open, text]);

  return (
    <div>
      <p ref={ref} id={id} className={`whitespace-pre-line ${open ? "" : "line-clamp-3"} ${className}`}>
        {text}
      </p>
      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={id}
          className="press-button mt-1 text-xs font-semibold text-[var(--accent-text)]"
        >
          {open ? "Vis mindre" : "Vis mere"}
        </button>
      )}
    </div>
  );
}
