"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  delay?: number;
  style?: CSSProperties;
}

export function ScrollReveal({
  children,
  className = "",
  delay = 0,
  style,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }
        el.style.transitionDelay = delay ? `${delay}ms` : "";
        el.classList.add("sr-visible");
        observer.unobserve(el);
      },
      { threshold: 0.08, rootMargin: "0px 0px -48px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div className={`sr ${className}`} ref={ref} style={style}>
      {children}
    </div>
  );
}
