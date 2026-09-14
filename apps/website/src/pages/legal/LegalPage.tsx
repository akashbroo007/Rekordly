import type { ReactNode } from "react";
import { legal } from "../../content/site";
import { useSeo } from "../../lib/seo";

interface LegalPageProps {
  title: string;
  intro: string;
  /** Canonical path for this legal page, e.g. "/terms". */
  path: string;
  children: ReactNode;
}

export function LegalPage({ title, intro, path, children }: LegalPageProps) {
  useSeo({
    title,
    description:
      path === "/terms"
        ? "The terms of service for using Rekordly: license scope, acceptable use, third-party services, and warranty disclaimers."
        : "How Rekordly handles data: the website stores nothing, the desktop app stores everything locally, and no accounts exist.",
    path,
  });

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
