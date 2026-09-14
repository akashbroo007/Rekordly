import type { ReactNode } from "react";
import { Reveal } from "../shared/Reveal";

interface SectionProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export function Section({ children, className = "", id }: SectionProps) {
  return (
    <section id={id} className={`py-20 sm:py-24 ${className}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">{children}</div>
    </section>
  );
}

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  /** Render as h1 when this is the page's primary heading (one per page). */
  as?: "h1" | "h2";
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  as = "h2",
}: SectionHeadingProps) {
  const alignClass = align === "center" ? "mx-auto text-center" : "text-left";
  const Tag = as;
  return (
    <Reveal className={`max-w-2xl ${alignClass}`}>
      {eyebrow && (
        <p className="mb-3 text-sm font-semibold tracking-wide text-white/60 uppercase">
          {eyebrow}
        </p>
      )}
      <Tag className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {title}
      </Tag>
      {description && (
        <p className="mt-4 text-lg leading-7 text-white/70">{description}</p>
      )}
    </Reveal>
  );
}
