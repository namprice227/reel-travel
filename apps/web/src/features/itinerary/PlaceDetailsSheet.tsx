"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native modal supplies focus containment, Escape and return focus to the selected stop. */
export function PlaceDetailsSheet({ label, children, onClose }: { label: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current!;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    const main = document.querySelector<HTMLElement>(".app-main");
    const mainOverflow = main?.style.overflow;
    document.body.style.overflow = "hidden";
    if (main) main.style.overflow = "hidden";
    el.showModal();
    return () => {
      el.close();
      document.body.style.overflow = overflow;
      if (main) main.style.overflow = mainOverflow ?? "";
      before?.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="trip-place-sheet" aria-label={label} onKeyDown={(event) => {
    const el = event.currentTarget;
    if (event.key !== "Tab" || (event.target as HTMLElement).closest("dialog") !== el) return;
    const items = [...el.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
      .filter((item) => item.getClientRects().length && item.closest("dialog") === el);
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onCancel={(event) => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    onClose();
  }}>
    <div className="trip-place-sheet-body">{children}</div>
  </dialog>;
}
