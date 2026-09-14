import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CircleAlert } from "lucide-react";
import { extractHeadings, getDoc, getNeighbors } from "../../lib/docs";
import { MarkdownRenderer } from "../../components/docs/MarkdownRenderer";
import { Toc } from "../../components/docs/Toc";
import { useSeo } from "../../lib/seo";

export default function DocsArticlePage() {
  const { section } = useParams();
  const doc = getDoc(section ?? "");

  useSeo({
    title: doc ? `${doc.title} — Docs` : "Page not found — Docs",
    description: doc?.description ?? "This documentation page does not exist.",
    path: doc ? `/docs/${doc.slug}` : "/docs",
    noindex: !doc,
  });

  if (!doc) {
    return (
      <div className="mx-auto max-w-2xl py-24 text-center">
        <CircleAlert className="mx-auto mb-4 h-10 w-10 text-white/30" />
        <h1 className="text-2xl font-bold text-white">Page not found</h1>
        <p className="mt-3 text-white/70">
          That documentation page does not exist.
        </p>
        <Link
          to="/docs"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to documentation
        </Link>
      </div>
    );
  }

  const headings = extractHeadings(doc.content);
  const { prev, next } = getNeighbors(doc.slug);

  return (
    <div className="flex gap-10 pb-16">
      <article className="min-w-0 flex-1">
        {/* Breadcrumb */}
        <nav className="mb-8 flex items-center gap-2 text-sm text-white/50">
          <Link to="/docs" className="transition-colors hover:text-white">
            Docs
          </Link>
          <span>/</span>
          <span>{doc.group}</span>
          <span>/</span>
          <span className="text-white/80">{doc.title}</span>
        </nav>

        <MarkdownRenderer source={doc.content} />

        {/* Prev / next */}
        <div className="mt-16 grid grid-cols-1 gap-4 border-t border-white/10 pt-8 sm:grid-cols-2">
          {prev ? (
            <Link
              to={`/docs/${prev.slug}`}
              className="group rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/25"
            >
              <span className="flex items-center gap-2 text-xs text-white/50">
                <ArrowLeft className="h-3.5 w-3.5" />
                Previous
              </span>
              <span className="mt-1 block font-semibold text-white transition-colors group-hover:text-white">
                {prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              to={`/docs/${next.slug}`}
              className="group rounded-xl border border-white/10 bg-white/[0.02] p-4 text-right transition-colors hover:border-white/25 sm:col-start-2"
            >
              <span className="flex items-center justify-end gap-2 text-xs text-white/50">
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
              <span className="mt-1 block font-semibold text-white">
                {next.title}
              </span>
            </Link>
          )}
        </div>
      </article>

      {/* On this page */}
      <aside className="sticky top-24 hidden h-[calc(100vh-8rem)] w-56 shrink-0 overflow-y-auto pb-16 xl:block">
        <Toc entries={headings} />
      </aside>
    </div>
  );
}
