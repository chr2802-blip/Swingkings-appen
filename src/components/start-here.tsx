"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Where a page opens when there is something above it: the activity list starts at today,
 * with the earlier activities over the top of the screen, a swipe away.
 *
 * It is put there when the page arrives and not again, so a list that is read again after
 * an action stays where the reader had it. Twice, because the router may put a new page at
 * its top after the first: before the paint, so the page is never seen anywhere else, and
 * after it, which is what stands. `active` false is a page with nothing above it.
 */
export function StartHere({ active, className, children }: { active: boolean; className?: string; children: React.ReactNode }) {
  const here = useRef<HTMLDivElement>(null);
  const arrived = useRef(false);

  const go = () => {
    if (active) here.current?.scrollIntoView({ block: "start" });
  };
  useLayoutEffect(() => {
    if (!arrived.current) go();
  });
  useEffect(() => {
    if (!arrived.current) go();
    arrived.current = true;
  });

  return (
    <div ref={here} data-testid="start-here" className={className}>
      {children}
    </div>
  );
}
