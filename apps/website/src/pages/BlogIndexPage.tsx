import { Link } from "react-router-dom";
import { ArrowRight, BookOpen } from "lucide-react";
import { Section, SectionHeading } from "../components/layout/Section";
import { ShimmerLinkButton } from "../components/hero/ShimmerButton";
import { Reveal } from "../components/shared/Reveal";
import { blogPosts, formatBlogDate } from "../content/blog";
import { siteUrl } from "../content/site";
import { useSeo } from "../lib/seo";

export default function BlogIndexPage() {
  useSeo({
    title: "Blog — stream recording guides & product updates",
    description:
      "Guides and product notes from the Rekordly team: how to record live streams on Windows, never miss a stream, and organize your recordings into a searchable library.",
    path: "/blog",
    schema: [
      {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "Rekordly Blog",
        url: `${siteUrl}/blog`,
        blogPost: blogPosts.map((post) => ({
          "@type": "BlogPosting",
          headline: post.title,
          description: post.description,
          url: `${siteUrl}/blog/${post.slug}`,
          datePublished: post.date,
          dateModified: post.updated,
        })),
      },
    ],
  });

  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Blog"
          as="h1"
          title="Notes from the Rekordly team"
          description="Guides on recording live streams, archiving VODs, and getting the most out of your recording library."
        />
        <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {blogPosts.map((post, index) => (
            <Reveal key={post.slug} delay={index * 0.08} className="h-full">
              <article className="flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-white/25 hover:bg-white/[0.04]">
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-medium text-white/70">
                    {post.category}
                  </span>
                  <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
                </div>
                <h2 className="mt-4 text-lg font-semibold leading-6 text-white">
                  <Link to={`/blog/${post.slug}`} className="hover:underline">
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-3 flex-1 text-sm leading-6 text-white/70">
                  {post.description}
                </p>
                <div className="mt-5 flex items-center justify-between text-sm">
                  <span className="text-white/40">{post.readingTime}</span>
                  <Link
                    to={`/blog/${post.slug}`}
                    className="inline-flex items-center gap-1.5 font-medium text-white transition-colors hover:text-white/80"
                  >
                    Read post
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="border-t border-white/10 text-center">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Ready to try it yourself?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-white/70">
            Rekordly is free for personal use — yt-dlp and ffmpeg are bundled,
            so install is one step.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <ShimmerLinkButton href="/download" className="font-semibold">
              <BookOpen className="mr-2 h-4 w-4" />
              Download for Windows
            </ShimmerLinkButton>
            <ShimmerLinkButton
              variant="outline"
              href="/docs"
              className="font-medium"
            >
              Read the docs
            </ShimmerLinkButton>
          </div>
        </Reveal>
        <p className="mt-10 text-sm text-white/40">
          Looking for something specific? The{" "}
          <Link
            to="/docs"
            className="underline decoration-white/30 underline-offset-4 transition-colors hover:text-white/70"
          >
            documentation
          </Link>{" "}
          covers every feature, and the{" "}
          <Link
            to="/roadmap"
            className="underline decoration-white/30 underline-offset-4 transition-colors hover:text-white/70"
          >
            roadmap
          </Link>{" "}
          shows what's shipping next.
        </p>
      </Section>
    </>
  );
}
