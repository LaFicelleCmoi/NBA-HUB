"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Révélation au scroll. `from` permet l'alternance gauche/droite des blocs.
 */
export function Reveal({
  children,
  from = "bottom",
  delay = 0,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  from?: "left" | "right" | "bottom";
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const reduce = useReducedMotion();
  const offset = reduce ? {} : from === "left" ? { x: -48 } : from === "right" ? { x: 48 } : { y: 32 };
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Comp>
  );
}
