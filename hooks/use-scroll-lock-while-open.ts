import { useEffect, useRef } from "react";

// Blocks page scroll while `active` (except inside `isExempt` elements), so a `position: fixed` popover doesn't
// drift from its trigger — used when the trigger has no stable ref to live-reposition from instead.
export function useScrollLockWhileOpen(
  active: boolean,
  isExempt: (target: HTMLElement) => boolean
) {
  // Callers pass an inline predicate, so depending on it directly would
  // re-register both non-passive listeners on every render. A ref keeps the
  // effect keyed on `active` while the handler reads the latest predicate.
  const isExemptRef = useRef(isExempt);
  isExemptRef.current = isExempt;

  useEffect(() => {
    if (!active) {
      return;
    }
    function preventScroll(e: WheelEvent | TouchEvent) {
      const target = e.target as HTMLElement;
      if (isExemptRef.current(target)) {
        return;
      }
      e.preventDefault();
    }
    document.addEventListener("wheel", preventScroll, { passive: false });
    document.addEventListener("touchmove", preventScroll, { passive: false });
    return () => {
      document.removeEventListener("wheel", preventScroll);
      document.removeEventListener("touchmove", preventScroll);
    };
  }, [active]);
}
