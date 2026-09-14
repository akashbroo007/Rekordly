import type { ReactNode } from "react";
import { legal } from "../../content/site";

interface LegalPageProps {
  title: string;
  intro: string;
  children: ReactNode;
}

export function LegalPage({ title, intro, children }: LegalPageProps) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
      <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
        {title}
      </h1>
      <p className="mt-3 text-sm text-white/50">
        Last updated: {legal.lastUpdated}
      </p>
      <p className="mt-6 text-lg leading-7 text-white/70">{intro}</p>
      <div className="mt-10">{children}</div>
      <div className="mt-14 rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/60">
        {legal.contactLine}
      </div>
    </article>
  );
}
