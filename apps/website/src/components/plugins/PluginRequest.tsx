import { useMemo, useState } from "react";
import { ClipboardCopy, ExternalLink, Send } from "lucide-react";
import { Reveal } from "../shared/Reveal";
import { site } from "../../content/site";

const REQUEST_ISSUE_URL = `${site.issuesUrl}/new?template=feature_request.md&labels=plugin-request`;

interface PluginRequestState {
  siteName: string;
  siteUrl: string;
  what: string;
  contact: string;
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none";

function buildRequestUrl(state: PluginRequestState): string {
  const title = `[Plugin Request] ${state.siteName.trim()}`;
  const body = [
    "## Plugin request",
    "",
    `- **Site name:** ${state.siteName.trim()}`,
    `- **Site URL:** ${state.siteUrl.trim() || "(not provided)"}`,
    `- **Free / paid account needed:** ${state.what.trim() || "(not provided)"}`,
    "",
    "## What would you want Rekordly to do on this site?",
    "",
    "Live monitoring, auto-recording, downloads…",
    "",
    state.contact.trim()
      ? `---\nSubmitted via rekordly.in/marketplace · Contact: ${state.contact.trim()}`
      : "---\nSubmitted via rekordly.in/marketplace",
  ].join("\n");
  return `${REQUEST_ISSUE_URL}&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/**
 * "Request a plugin" form — composes a pre-filled GitHub issue from the
 * visitor's input. Nothing is sent from the page itself; the submit button
 * opens GitHub with the report pre-filled (same pattern as the contact page).
 */
export function PluginRequest() {
  const [siteName, setSiteName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [what, setWhat] = useState("");
  const [contact, setContact] = useState("");
  const [copied, setCopied] = useState(false);

  const ready = siteName.trim().length > 0;

  const state = useMemo<PluginRequestState>(
    () => ({ siteName, siteUrl, what, contact }),
    [siteName, siteUrl, what, contact],
  );

  const copyReport = async (): Promise<void> => {
    const text = [
      `Title: [Plugin Request] ${siteName.trim()}`,
      "",
      `Site: ${siteUrl.trim() || "(not provided)"}`,
      "",
      what.trim(),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (permissions/insecure context) — ignore
    }
  };

  return (
    <Reveal className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white">
            <Send className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              Request a plugin
            </h3>
            <p className="mt-1 text-sm leading-6 text-white/70">
              Want a site that isn't listed yet? Tell us which one — requests
              with the most demand get built first. You can also write the
              plugin yourself with the public SDK.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="request-site-name"
                className="text-xs font-medium text-white/60"
              >
                Site name <span className="text-white/40">(required)</span>
              </label>
              <input
                id="request-site-name"
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                placeholder="e.g. Xcams"
                maxLength={80}
                className={`mt-1.5 ${inputClass}`}
              />
            </div>
            <div>
              <label
                htmlFor="request-site-url"
                className="text-xs font-medium text-white/60"
              >
                Site URL
              </label>
              <input
                id="request-site-url"
                value={siteUrl}
                onChange={(event) => setSiteUrl(event.target.value)}
                placeholder="https://…"
                type="url"
                maxLength={200}
                className={`mt-1.5 ${inputClass}`}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="request-what"
              className="text-xs font-medium text-white/60"
            >
              What should Rekordly do there?
            </label>
            <textarea
              id="request-what"
              value={what}
              onChange={(event) => setWhat(event.target.value)}
              placeholder="Live monitoring, auto-recording, downloads… anything else we should know (account requirements, VR support, etc.)"
              rows={4}
              maxLength={2000}
              className={`mt-1.5 resize-none ${inputClass}`}
            />
          </div>
          <div>
            <label
              htmlFor="request-contact"
              className="text-xs font-medium text-white/60"
            >
              Email or GitHub handle{" "}
              <span className="text-white/40">(optional, for follow-ups)</span>
            </label>
            <input
              id="request-contact"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="you@example.com or @yourhandle"
              maxLength={120}
              className={`mt-1.5 ${inputClass}`}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href={ready ? buildRequestUrl(state) : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!ready}
            className={`inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-black transition-colors ${
              ready ? "hover:bg-gray-100" : "pointer-events-none opacity-40"
            }`}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Submit on GitHub
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

        <p className="mt-4 text-xs leading-5 text-white/60">
          Nothing is sent from this page — the button opens GitHub with your
          request pre-filled. Prefer email? Write to{" "}
          <a
            href={`mailto:${site.email}?subject=${encodeURIComponent("Rekordly plugin request")}`}
            className="underline decoration-white/30 underline-offset-2 hover:text-white/70"
          >
            {site.email}
          </a>
          .
        </p>
      </div>
    </Reveal>
  );
}
