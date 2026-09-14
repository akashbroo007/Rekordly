import { ArrowRight, Download, Github, Star } from "lucide-react";
import { BeamsBackground } from "./Beams";
import { ShimmerLinkButton } from "./ShimmerButton";
import { hero } from "../../content/site";

/**
 * Ethereal Beams hero — animated 3D light-beam background with glassmorphic
 * accents, pure black & white, Rekordly content.
 */
export function Hero() {
  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-black pt-16">
      <BeamsBackground className="absolute inset-0 z-0" />

      {/* Gradient overlay for text readability */}
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />

      <div className="relative z-10 flex min-h-[calc(100vh-4rem)] items-center">
        <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge */}
            <div className="mb-8 inline-flex animate-fade-up items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/90 backdrop-blur-xl">
              <Star className="mr-2 h-4 w-4 fill-white text-white" />
              {hero.badge}
            </div>

            {/* Main heading */}
            <h1
              className="mb-6 animate-fade-up text-4xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl"
              style={{ animationDelay: "80ms" }}
            >
              {hero.titleLead}{" "}
              <span className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
                {hero.titleAccent}
              </span>{" "}
              {hero.titleTail}
            </h1>

            {/* Subtitle */}
            <p
              className="mx-auto mb-10 max-w-3xl animate-fade-up text-lg leading-8 text-white/80 sm:text-xl"
              style={{ animationDelay: "160ms" }}
            >
              {hero.subtitle}
            </p>

            {/* CTA buttons */}
            <div
              className="mb-12 flex animate-fade-up flex-col items-center justify-center gap-4 sm:flex-row"
              style={{ animationDelay: "240ms" }}
            >
              <ShimmerLinkButton
                size="lg"
                href={hero.primaryCta.href}
                external
                className="font-semibold shadow-lg shadow-white/10"
              >
                <Download className="mr-2 h-4 w-4" />
                {hero.primaryCta.label}
              </ShimmerLinkButton>
              <ShimmerLinkButton
                size="lg"
                variant="outline"
                href={hero.secondaryCta.href}
                external
                className="bg-transparent font-semibold"
              >
                <Github className="mr-2 h-4 w-4" />
                {hero.secondaryCta.label}
                <ArrowRight className="ml-2 h-4 w-4" />
              </ShimmerLinkButton>
            </div>

            {/* Stats */}
            <div
              className="mx-auto grid max-w-2xl animate-fade-up grid-cols-1 gap-8 sm:grid-cols-3"
              style={{ animationDelay: "320ms" }}
            >
              {hero.stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="mb-2 text-3xl font-bold text-white">
                    {stat.value}
                  </div>
                  <div className="text-sm text-white/60">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
