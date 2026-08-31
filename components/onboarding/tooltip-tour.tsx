"use client";

import type React from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

/* ─── SVG icons (no emojis) ─────────────────────────────────────── */

function IconPages() {
  return (
    <svg
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 16 16"
    >
      <rect height="12" rx="1.5" width="9" x="2" y="1" />
      <path d="M5 14h7a1.5 1.5 0 001.5-1.5V4" />
      <path d="M5 4.5h5M5 7h5M5 9.5h3" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 16 16"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 16 16"
    >
      <circle cx="6.5" cy="6.5" r="4" />
      <path d="M13 13l-3.5-3.5" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 16 16"
    >
      <path d="M8 1.5A4 4 0 004 5.5v2L2.5 10h11L12 7.5v-2A4 4 0 008 1.5z" />
      <path d="M6.5 10.5a1.5 1.5 0 003 0" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 16 16"
    >
      <path d="M2.5 8.5l3.5 3.5 7.5-7.5" />
    </svg>
  );
}

/* ─── Tour steps ─────────────────────────────────────────────────── */

interface TourStep {
  body: string;
  Icon: () => React.ReactElement;
  placement: "right" | "bottom" | "left" | "top" | "center";
  target: string;
  title: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "[data-tour='sidebar']",
    placement: "right",
    Icon: IconPages,
    title: "Your pages live here",
    body: "All your pages and notes live in the sidebar. Click any page to open it, or drag to reorder.",
  },
  {
    target: "[data-tour='new-page']",
    placement: "bottom",
    Icon: IconPlus,
    title: "Create pages instantly",
    body: "Click New to create a page, database, or note. Every page starts blank and grows with you.",
  },
  {
    target: "[data-tour='search']",
    placement: "right",
    Icon: IconSearch,
    title: "Search in seconds",
    body: "Press ⌘K (Ctrl+K on Windows) to instantly search across all your pages and jump anywhere.",
  },
  {
    target: "[data-tour='notifications']",
    placement: "right",
    Icon: IconBell,
    title: "Stay in the loop",
    body: "Get notified when someone mentions you, leaves a comment, or shares a page with you.",
  },
  {
    target: "[data-tour='sidebar']",
    placement: "right",
    Icon: IconCheck,
    title: "You're all set",
    body: "Start by creating your first page. Type / in the editor to insert headings, images, and more.",
  },
];

const TOOLTIP_W = 272;
const TOOLTIP_H = 190;
const GAP = 14;

function computeStyle(
  rect: DOMRect | null,
  placement: TourStep["placement"]
): React.CSSProperties {
  if (!rect || placement === "center") {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

  switch (placement) {
    case "right":
      return {
        top: clamp(
          rect.top + rect.height / 2 - TOOLTIP_H / 2,
          16,
          vh - TOOLTIP_H - 16
        ),
        left: Math.min(rect.right + GAP, vw - TOOLTIP_W - 16),
      };
    case "bottom":
      return {
        top: Math.min(rect.bottom + GAP, vh - TOOLTIP_H - 16),
        left: clamp(
          rect.left + rect.width / 2 - TOOLTIP_W / 2,
          16,
          vw - TOOLTIP_W - 16
        ),
      };
    case "top":
      return {
        top: Math.max(16, rect.top - TOOLTIP_H - GAP),
        left: clamp(
          rect.left + rect.width / 2 - TOOLTIP_W / 2,
          16,
          vw - TOOLTIP_W - 16
        ),
      };
    case "left":
      return {
        top: clamp(
          rect.top + rect.height / 2 - TOOLTIP_H / 2,
          16,
          vh - TOOLTIP_H - 16
        ),
        left: Math.max(16, rect.left - TOOLTIP_W - GAP),
      };
  }
}

interface Props {
  tourCompleted: boolean;
}

export function TooltipTour({ tourCompleted }: Props) {
  const [step, setStep] = useState(0);
  const [active, setActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [animIn, setAnimIn] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
    if (!tourCompleted) {
      timerRef.current = setTimeout(() => {
        setActive(true);
        setAnimIn(true);
      }, 900);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [tourCompleted]);

  const measureTarget = useCallback((stepIndex: number) => {
    const el = document.querySelector(TOUR_STEPS[stepIndex].target);
    setTargetRect(el ? el.getBoundingClientRect() : null);
  }, []);

  // Lets the sidebar know a tour is in progress so it can suppress its own
  // "current page" highlight — otherwise Home's active-route pill (lit up
  // because onboarding lands users on the workspace root) reads as if it
  // were part of the guided spotlight on Search/Notifications.
  useEffect(() => {
    document.dispatchEvent(
      new CustomEvent(active ? "pagevo:tour-active" : "pagevo:tour-inactive")
    );
  }, [active]);

  useEffect(() => {
    if (!active || !mounted) {
      return;
    }
    measureTarget(step);
    function onResize() {
      measureTarget(step);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, mounted, step, measureTarget]);

  const completeTour = useCallback(() => {
    setAnimIn(false);
    setTimeout(() => setActive(false), 160);
    fetch("/api/onboarding/tour-complete", { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        completeTour();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, completeTour]);

  function handleNext() {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      completeTour();
    }
  }

  function handleBack() {
    if (step > 0) {
      setStep((s) => s - 1);
    }
  }

  if (!mounted || !active) {
    return null;
  }

  const current = TOUR_STEPS[step];
  const tooltipStyle = computeStyle(targetRect, current.placement);
  const isLast = step === TOUR_STEPS.length - 1;

  return createPortal(
    <>
      {/* Spotlight overlay */}
      {targetRect && (
        <div
          className="pointer-events-none"
          style={{
            position: "fixed",
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            borderRadius: 6,
            border: "1.5px solid var(--color-primary)",
            boxShadow: "0 0 0 3999px rgba(0,0,0,0.22)",
            zIndex: 9997,
            transition:
              "top 220ms ease, left 220ms ease, width 220ms ease, height 220ms ease",
          }}
        />
      )}
      {!targetRect && (
        <div
          className="pointer-events-none"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.22)",
            zIndex: 9997,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        aria-labelledby={titleId}
        aria-modal="false"
        className="rounded-lg border border-base-300 bg-neutral p-5"
        role="dialog"
        style={{
          position: "fixed",
          zIndex: 9999,
          width: TOOLTIP_W,
          transition: "opacity 160ms ease, transform 160ms ease",
          opacity: animIn ? 1 : 0,
          ...tooltipStyle,
          transform:
            `${tooltipStyle.transform ?? ""} scale(${animIn ? 1 : 0.96})`.trim(),
        }}
      >
        {/* Close */}
        <Button
          aria-label="Close tour"
          className="absolute right-3 top-3 text-base-content/70 hover:text-base-content"
          onClick={completeTour}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <svg
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
            viewBox="0 0 14 14"
          >
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </Button>

        {/* Icon */}
        <div className="mb-4 flex size-8 items-center justify-center rounded-sm bg-primary/10 text-primary">
          <current.Icon />
        </div>

        {/* Text */}
        <h3
          className="mb-1.5 text-sm font-semibold leading-snug text-base-content"
          id={titleId}
        >
          {current.title}
        </h3>
        <p className="mb-5 text-xs leading-relaxed text-base-content/70">
          {current.body}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-base-content/70">
            {step + 1} of {TOUR_STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                onClick={handleBack}
                size="xs"
                type="button"
                variant="outline"
              >
                <svg
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  viewBox="0 0 14 14"
                >
                  <path d="M12 7H2M6 3L2 7l4 4" />
                </svg>
                Back
              </Button>
            )}
            <Button
              onClick={completeTour}
              size="xs"
              type="button"
              variant="ghost"
            >
              Skip
            </Button>
            <Button onClick={handleNext} size="xs" type="button">
              {isLast ? "Done" : "Next"}
              {!isLast && (
                <svg
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  viewBox="0 0 14 14"
                >
                  <path d="M2 7h10M8 3l4 4-4 4" />
                </svg>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
