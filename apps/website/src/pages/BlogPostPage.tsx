import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CircleAlert, Clock } from "lucide-react";
import { Section } from "../components/layout/Section";
import { Reveal } from "../components/shared/Reveal";
import { ShimmerLinkButton } from "../components/hero/ShimmerButton";
import { MarkdownRenderer } from "../components/docs/MarkdownRenderer";
import { getPost, blogPosts, formatBlogDate } from "../content/blog";
import { site, siteUrl } from "../content/site";
import { useSeo } from "../lib/seo";

export default function BlogPostPage() {
  const { slug } = useParams();
  const post = getPost(slug ?? "");

  useEffect(() => {
    if (post) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [post?.slug]);

  const related = blogPosts.filter((p) => p.slug !== post?.slug).slice(0, 2);

  if (!post) {
    return (
      <Section className="text-center">
        <div className="mx-auto max-w-md">
          <CircleAlert className="mx-auto mb-4 h-10 w-10 text-white/30" />
          <h1 className="text-2xl font-bold text-white">Post not found</h1>
          <p className="mt-3 text-white/70">
            That blog post does not exist or has moved.
          </p>
          <Link
            to="/blog"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to the blog
          </Link>
        </div>
      </Section>
    );
  }

  return (
    <PostArticle post={post} related={related} />
  );
}

function PostArticle({
  post,
  related,
}: {
  post: NonNullable<ReturnType<typeof getPost>>;
  related: typeof blogPosts;
}) {
  useSeo({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
    type: "article",
    publishedTime: post.date,
    modifiedTime: post.updated,
    schema: [
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        dateModified: post.updated,
        author: { "@type": "Organization", name: site.name, url: siteUrl },
        publisher: {
          "@type": "Organization",
          name: site.name,
          url: siteUrl,
          logo: {
            "@type": "ImageObject",
            url: `${siteUrl}/icon.png`,
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `${siteUrl}/blog/${post.slug}`,
        },
        image: `${siteUrl}/og-image.png`,
      },
    ],
  });

  return (
    <article className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
      <nav
        aria-label="Breadcrumb"
        className="mb-8 flex items-center gap-2 text-sm text-white/50"
      >
        <Link to="/blog" className="transition-colors hover:text-white">
          Blog
        </Link>
        <span>/</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-white/70">
          {post.category}
        </span>
      </nav>

      <header>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          {post.title}
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/50">
          <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {post.readingTime}
          </span>
          <span>Updated {formatBlogDate(post.updated)}</span>
        </div>
        <p className="mt-6 text-lg leading-8 text-white/70">
          {post.description}
        </p>
      </header>

      <div className="markdown mt-12">
        <MarkdownRenderer source={post.body} />
      </div>

      {/* Keep readers in the loop — internal links */}
      <div className="mt-16 rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-xl font-bold text-white">Keep reading</h2>
        <ul className="mt-4 space-y-3">
          {related.map((rel) => (
            <li key={rel.slug}>
              <Link
                to={`/blog/${rel.slug}`}
                className="group flex items-baseline justify-between gap-4 text-sm"
              >
                <span className="font-medium text-white transition-colors group-hover:text-white/80">
                  {rel.emoji} {rel.title}
                </span>
                <span className="shrink-0 text-white/40">{rel.readingTime}</span>
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/docs"
              className="text-sm text-white/70 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white"
            >
              Browse the documentation
            </Link>{" "}
            <span className="text-white/40">— every feature explained.</span>
          </li>
        </ul>
      </div>

      <Reveal className="mt-12 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Put it into practice
        </h2>
        <p className="mx-auto mt-3 max-w-md text-white/70">
          Rekordly is free for personal use and installs in minutes on
          Windows 10 and 11.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          <ShimmerLinkButton
            size="lg"
            href="/download"
            className="font-semibold shadow-lg shadow-white/10"
          >
            Download for Windows
          </ShimmerLinkButton>
          <ShimmerLinkButton
            size="lg"
            variant="outline"
            href="/features"
            className="font-semibold"
          >
            See the features
          </ShimmerLinkButton>
        </div>
      </Reveal>
    </article>
  );
}
