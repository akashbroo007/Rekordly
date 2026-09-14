import { useState } from "react";
import { Bug, Lightbulb, Mail, MessageSquare, ClipboardCopy, ExternalLink } from "lucide-react";
import { Section, SectionHeading } from "../components/layout/Section";
import { Reveal } from "../components/shared/Reveal";
import { contactChannels, site } from "../content/site";
import { useSeo } from "../lib/seo";

const icons = [Bug, MessageSquare, Mail] as const;

const BUG_TEMPLATE_URL = `${site.issuesUrl}/new?template=bug_report.md`;
const FEATURE_TEMPLATE_URL = `${site.issuesUrl}/new?template=feature_request.md`;

type ReportKind = "bug" | "feature";

function buildIssueUrl(kind: ReportKind, title: string, details: string): string {
  const base = kind === "bug" ? BUG_TEMPLATE_URL : FEATURE_TEMPLATE_URL;
  const prefixedTitle = kind === "bug" ? `[Bug] ${title}` : `[Feature] ${title}`;
  const body =
    kind === "bug"
      ? [
          "## Description",
          "",
          details.trim(),
          "",
          "## Steps to Reproduce",
          "",
          "1. ",
          "2. ",
          "",
          "## Expected Behavior",
          "",
          "",
          "",
          "## Environment",
          "",
          "- OS: Windows 10/11",
          "- Rekordly Version:",
        ].join("\n")
      : [
          "## Description",
          "",
          details.trim(),
          "",
          "## Use Case",
          "",
          "",
        ].join("\n");
  return `${base}&title=${encodeURIComponent(prefixedTitle)}&body=${encodeURIComponent(body)}`;
}

function QuickBugReport() {
  const [kind, setKind] = useState<ReportKind>("bug");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [copied, setCopied] = useState(false);

  const ready = title.trim().length > 0 && details.trim().length > 0;

  const copyReport = async (): Promise<void> => {
    const text = `Title: ${kind === "bug" ? "[Bug] " : "[Feature] "}${title.trim()}\n\n${details.trim()}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (permissions/insecure context) — ignore
    }
  };

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none";

  return (
    <Section className="border-t border-white/10">
      <SectionHeading
        eyebrow="Report a bug"
        title="Something broken?"
        description="Describe the problem and GitHub opens with your report pre-filled — the maintainer sees exactly what you wrote."
      />

      <Reveal className="mx-auto mt-12 max-w-2xl">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "bug", label: "Bug report", icon: Bug },
                { id: "feature", label: "Feature request", icon: Lightbulb },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setKind(option.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  kind === option.id
                    ? "border-white/30 bg-white/10 text-white"
                    : "border-white/10 bg-transparent text-white/60 hover:border-white/20 hover:text-white"
                }`}
                aria-pressed={kind === option.id}
              >
                <option.icon className="h-4 w-4" />
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="bug-title" className="text-xs font-medium text-white/60">
                {kind === "bug" ? "What broke?" : "Short summary"}
              </label>
              <input
                id="bug-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  kind === "bug"
                    ? "Recording stops after ~2 minutes on Stripchat"
                    : "Add download scheduling"
                }
                className={`mt-1.5 ${inputClass}`}
                maxLength={120}
              />
            </div>
            <div>
              <label htmlFor="bug-details" className="text-xs font-medium text-white/60">
                {kind === "bug" ? "What happened, and what did you expect?" : "Describe the idea"}
              </label>
              <textarea
                id="bug-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder={
                  kind === "bug"
                    ? "Steps to reproduce, expected behavior, and your Rekordly version…"
                    : "What would it do, and why would it help?"
                }
                rows={5}
                className={`mt-1.5 resize-none ${inputClass}`}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href={ready ? buildIssueUrl(kind, title, details) : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!ready}
              className={`inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-black transition-colors ${
                ready ? "hover:bg-gray-100" : "pointer-events-none opacity-40"
              }`}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Continue on GitHub
            </a>
            <button
              type="button"
              onClick={() => void copyReport()}
              disabled={!ready}
              className="inline-flex h-10 items-center justify-center rounded-full border border-white/20 px-5 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
            >
              <ClipboardCopy className="mr-2 h-4 w-4" />
              {copied ? "Copied!" : "Copy instead"}
            </button>
          </div>
          <p className="mt-4 text-xs leading-5 text-white/40">
            Nothing is sent from this page — the button only opens GitHub with
            the text filled in. Prefer email? Write to{" "}
            <a
              href={`mailto:${site.email}`}
              className="underline decoration-white/30 underline-offset-2 hover:text-white/70"
            >
              {site.email}
            </a>
            .
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

export default function ContactPage() {
  useSeo({
    title: "Contact — bug reports, feature ideas & press",
    description:
      "Get in touch with the Rekordly team: report bugs on GitHub, request features, ask about commercial licensing, or email us for anything else.",
    path: "/contact",
  });

  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Contact"
          as="h1"
          title="Get in touch"
          description="Rekordly is developed in the open — most conversations happen on GitHub where they benefit everyone."
        />
        <div className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
          {contactChannels.map((channel, index) => {
            const Icon = icons[index] ?? Mail;
            return (
              <Reveal key={channel.title} delay={index * 0.08} className="h-full">
                <a
                  href={channel.href}
                  target={channel.href.startsWith("mailto") ? undefined : "_blank"}
                  rel="noreferrer"
                  className="group flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-6 transition-all hover:border-white/25 hover:bg-white/[0.04]"
                >
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    {channel.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-white/70">
                    {channel.description}
                  </p>
                  <span className="mt-4 text-sm font-medium text-white underline decoration-white/30 underline-offset-4 transition-colors group-hover:decoration-white">
                    {channel.label}
                  </span>
                </a>
              </Reveal>
            );
          })}
        </div>
      </Section>

      <QuickBugReport />

      <Section className="border-t border-white/10">
        <Reveal className="mx-auto max-w-2xl">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-white" />
            <div>
              <h3 className="font-semibold text-white">
                Want a new streaming site supported?
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/70">
                The fastest path is writing a site plugin — site support ships
                as plugins with a public SDK, so a new site never requires core
                changes. See the{" "}
                <a
                  href="/docs/plugins"
                  className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white"
                >
                  plugin docs
                </a>{" "}
                or start a discussion with the site you'd like supported.
              </p>
            </div>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
