import { ArrowRight, BadgeCheck, Building2, Check, Sparkles } from "lucide-react";
import { Section, SectionHeading } from "../components/layout/Section";
import { ShimmerLinkButton } from "../components/hero/ShimmerButton";
import { Reveal } from "../components/shared/Reveal";
import { useCurrency } from "../lib/CurrencyContext";
import { site } from "../content/site";
import { useSeo } from "../lib/seo";

const BUY_URL = "https://buy.polar.sh/rekordly-pro";
const TRIAL_URL = `mailto:${site.email}?subject=Rekordly%20Pro%20trial%20key`;
const COMMERCIAL_URL = `mailto:${site.email}?subject=Rekordly%20commercial%20license`;

const freeFeatures = [
  "Unlimited creator monitoring",
  "Unlimited creators",
  "Auto-record up to 2 creators",
  "Up to 5 simultaneous live recordings",
  "Live recordings up to 15 minutes each",
  "Unlimited manual downloads — no duration limit on normal VOD downloads",
  "Local library, cloud uploads, Secure Proxy",
  "Community plugins",
  "No account, no telemetry, local-first",
];

const proFeatures = [
  "Unlimited auto-record creators",
  "Unlimited simultaneous recordings",
  "Unlimited recording length",
  "Everything in Free — no features removed",
  "One payment — lifetime license",
  "7-day free trial, no account needed",
];

const commercialFeatures = [
  "Commercial licensing for businesses",
  "For commercial services, internal business use, or redistribution",
  "Custom terms for your organization",
  "Contact Rekordly for licensing",
];

export default function PricingPage() {
  const { format, currency } = useCurrency();
  const proPrice = format(29);

  useSeo({
    title: "Pricing — free for personal use, Pro for power users",
    description:
      "Rekordly pricing: a permanent free tier with unlimited monitoring and downloads, Pro at $29 one-time removing live-recording limits, and commercial licenses.",
    path: "/pricing",
  });

  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Pricing"
          as="h1"
          title="Free for personal use. Pro for power users."
          description="Rekordly is source-available and free for personal, educational, and other noncommercial use. The free tier is permanent — not a trial — and Pro removes the live-recording limits for people who record everything."
        />

        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Reveal>
            <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-8">
              <h3 className="text-lg font-semibold text-white">Free</h3>
              <p className="mt-2 text-4xl font-bold text-white">$0</p>
              <p className="mt-1 text-sm text-white/50">
                Forever. Personal and noncommercial use.
              </p>
              <ul className="mt-8 flex-1 space-y-3">
                {freeFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-white/60"
                      aria-hidden="true"
                    />
                    <span className="leading-6 text-white/80">{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <ShimmerLinkButton
                  variant="outline"
                  href="/download"
                  className="w-full font-medium"
                >
                  Download free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </ShimmerLinkButton>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="relative flex h-full flex-col rounded-xl border border-primary/40 bg-white/[0.04] p-8">
              <span className="absolute -top-3.5 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black shadow-lg shadow-black/40">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Most popular
              </span>
              <h3 className="text-lg font-semibold text-white">Pro</h3>
              <p className="mt-2 text-4xl font-bold text-white">
                {proPrice}
                <span className="ml-2 text-base font-normal text-white/50">
                  one-time
                </span>
              </p>
              <p className="mt-1 text-sm text-white/50">
                {currency !== "USD" ? "Charged as $29 USD. " : ""}Lifetime
                license for personal use. Undercuts subscriptions that charge
                $10.99/mo.
              </p>
              <ul className="mt-8 flex-1 space-y-3">
                {proFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <BadgeCheck
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="leading-6 text-white/90">{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 space-y-3">
                <ShimmerLinkButton
                  href={BUY_URL}
                  external
                  className="w-full font-semibold"
                >
                  Get Pro — {proPrice} lifetime
                </ShimmerLinkButton>
                <a
                  href={TRIAL_URL}
                  className="block text-center text-xs text-white/50 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white/80"
                >
                  Or email us for a free 7-day trial key
                </a>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-8">
              <h3 className="text-lg font-semibold text-white">Commercial</h3>
              <p className="mt-2 text-4xl font-bold text-white">
                Custom
              </p>
              <p className="mt-1 text-sm text-white/50">
                Priced per organization and use case.
              </p>
              <ul className="mt-8 flex-1 space-y-3">
                {commercialFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Building2
                      className="mt-0.5 h-4 w-4 shrink-0 text-white/60"
                      aria-hidden="true"
                    />
                    <span className="leading-6 text-white/80">{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <ShimmerLinkButton
                  variant="outline"
                  href={COMMERCIAL_URL}
                  external
                  className="w-full font-medium"
                >
                  Contact us for licensing
                </ShimmerLinkButton>
              </div>
            </div>
          </Reveal>
        </div>
        <p className="mx-auto mt-6 max-w-xl text-center text-xs text-white/40">
          Checkout is charged in USD. Converted amounts are approximate and
          shown for reference only — your bank or payment provider may apply
          its own exchange rate.
        </p>
      </Section>

      <Section className="border-t border-white/10">
        <Reveal className="mx-auto max-w-2xl">
          <h2 className="mb-6 text-2xl font-bold text-white">
            How licensing works
          </h2>
          <div className="space-y-4 text-sm leading-6 text-white/70">
            <p>
              <strong className="text-white">No account, ever.</strong> After
              purchase you receive a license key by email. Paste it into
              Settings → License — verification happens fully offline on your
              machine.
            </p>
            <p>
              <strong className="text-white">Downloads are never limited.</strong>{" "}
              The Download Manager handles supported non-live videos, VODs, and
              clips and has no duration limit on normal downloads — on every
              tier. The Free/Pro distinction applies to live recording only.
            </p>
            <p>
              <strong className="text-white">Free stays free.</strong> The free
              tier is not a trial that expires — it is a permanent tier with
              unlimited monitoring and downloads.
            </p>
            <p>
              <strong className="text-white">Businesses need a license.</strong>{" "}
              Rekordly is free for personal, educational, and noncommercial use
              under the PolyForm Noncommercial license. Companies and other
              commercial users need a paid license — contact{" "}
              <a
                href={`mailto:${site.email}`}
                className="text-white underline decoration-white/30 underline-offset-2"
              >
                {site.email}
              </a>
              .
            </p>
          </div>
          <div className="mt-8">
            <ShimmerLinkButton
              variant="outline"
              href="/docs/license"
              className="font-medium"
            >
              Read the full license terms
              <ArrowRight className="ml-2 h-4 w-4" />
            </ShimmerLinkButton>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
