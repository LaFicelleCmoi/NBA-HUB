"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

const fmt = new Intl.NumberFormat("fr-FR");

/** Compteur qui « monte » jusqu'à sa valeur à l'entrée dans le viewport. */
export function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || !inView) {
      if (reduce) el.textContent = fmt.format(value);
      return;
    }
    const controls = animate(0, value, {
      duration: Math.min(2.2, 0.8 + Math.log10(value + 1) * 0.35),
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = fmt.format(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, inView, reduce]);

  return (
    <span ref={ref} className={`tabular ${className ?? ""}`} aria-label={fmt.format(value)}>
      0
    </span>
  );
}
