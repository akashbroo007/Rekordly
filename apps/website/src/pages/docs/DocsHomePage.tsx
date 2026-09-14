import { Link } from "react-router-dom";
import { ArrowRight, GitBranch, Search } from "lucide-react";
import { docGroups } from "../../lib/docs";

export default function DocsHomePage() {
  return (
    <div className="pb-16">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Documentation
        </h1>
        <p className="mt-4 text-lg leading-7 text-white/70">
          Everything about Rekordly — from your first install to writing your
          own site plugin. Press{" "}
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs text-white/80">
            ⌘K
          </kbd>{" "}
          to search.
        </p>
        <button
          type="button"
          onClick={() =>
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }))
          }
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/70 transition-colors hover:border-white/20 hover:text-white md:hidden"
        >
          <Search className="h-4 w-4" />
          Search documentation
        </button>
      </div>

      <Link
        to="/roadmap"
        className="group mt-10 flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-all hover:border-white/25 hover:bg-white/[0.05]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white">
          <GitBranch className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center text-base font-semibold text-white">
            Development Roadmap
            <ArrowRight className="ml-2 h-4 w-4 text-white/30 transition-all group-hover:translate-x-0.5 group-hover:text-white" />
          </h2>
          <p className="mt-1 text-sm leading-6 text-white/60">
            What's shipped, what's in progress, and what's planned — synced live
            from GitHub Issues.
          </p>
        </div>
      </Link>

      <div className="mt-14 space-y-14">
        {docGroups.map((group) => (
          <div key={group.group}>
            <h2 className="mb-5 border-b border-white/10 pb-2 text-sm font-semibold tracking-wider text-white/50 uppercase">
              {group.group}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.docs.map((doc) => (
                <Link
                  key={doc.slug}
                  to={`/docs/${doc.slug}`}
                  className="group rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-all hover:border-white/25 hover:bg-white/[0.05]"
                >
                  <h3 className="flex items-center justify-between text-base font-semibold text-white">
                    {doc.title}
                    <ArrowRight className="h-4 w-4 text-white/30 transition-all group-hover:translate-x-0.5 group-hover:text-white" />
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    {doc.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
