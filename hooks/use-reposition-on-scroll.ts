import { useEffect, useRef } from "react";

// Keeps a `position: fixed` popover glued to its trigger on scroll/resize (capture phase, catches nested
// scroll containers too) — otherwise it freezes at its open-time coordinates while the trigger moves away.
export function useRepositionOnScroll(active: boolean, reposition: () => void) {
  // Callers pass an inline closure, so listing `reposition` as a dependency
  // would tear down and re-add both listeners on every render. Holding it in a
  // ref keeps the effect keyed on `active` alone while the handler still calls
  // the newest closure — the previous [active]-only version captured the
  // callback from the render that opened the popover and went stale.
  const repositionRef = useRef(reposition);
  repositionRef.current = reposition;

  useEffect(() => {
    if (!active) {
      return;
    }
    const handler = () => repositionRef.current();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [active]);
}
