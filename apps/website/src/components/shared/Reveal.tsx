import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay in seconds */
  delay?: number;
  /** Initial vertical offset in px */
  y?: number;
}

const EASE = [0.21, 1.02, 0.73, 1] as const;

/**
 * Fade-up-once scroll reveal. Elements rise ~16px and fade in the first time
 * they enter the viewport; no replay on scroll-back. Renders without
 * animation when the user prefers reduced motion.
 */
export function Reveal({ children, className = "", delay = 0, y = 16 }: RevealProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [...EASE] }}
    >
      {children}
    </motion.div>
  );
}
