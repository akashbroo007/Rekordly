import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { GitBranch, Search } from "lucide-react";
import { docGroups, preloadSearch } from "../../lib/docs";
import { DocsSearch } from "../../components/docs/DocsSearch";

export default function DocsLayout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    void preloadSearch();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setSearchOpen(false);
  }, [location.pathname]);

  return (
    <div className="relative">
      <div className="mx-auto flex max-w-7xl gap-10 px-6 py-10 lg:px-8">
        {/* Sidebar */}
        <aside className="sticky top-24 hidden h-[calc(100vh-8rem)] w-60 shrink-0 overflow-y-auto pb-16 md:block">
          <Link
            to="/docs"
            className="mb-6 block text-lg font-bold text-white"
          >
            Documentation
          </Link>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="mb-8 flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/60 transition-colors hover:border-white/20 hover:text-white"
          >
            <Search className="h-3.5 w-3.5" />
            Search docs...
            <kbd className="ml-auto rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px]">
              ⌘K
            </kbd>
          </button>

          <nav className="space-y-8">
            {docGroups.map((group) => (
              <div key={group.group}>
                <p className="mb-2 text-xs font-semibold tracking-wider text-white/40 uppercase">
                  {group.group}
                </p>
                <ul className="space-y-1">
                  {group.docs.map((doc) => (
                    <li key={doc.slug}>
                      <NavLink
                        to={`/docs/${doc.slug}`}
                        className={({ isActive }) =>
                          `block rounded-md px-3 py-1.5 text-sm transition-colors ${
                            isActive
                              ? "bg-white/10 font-medium text-white"
                              : "text-white/60 hover:bg-white/5 hover:text-white"
                          }`
                        }
                      >
                        {doc.title}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="border-t border-white/10 pt-5">
              <p className="mb-2 text-xs font-semibold tracking-wider text-white/40 uppercase">
                Project
              </p>
              <ul>
                <li>
                  <NavLink
                    to="/roadmap"
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                        isActive
                          ? "bg-white/10 font-medium text-white"
                          : "text-white/60 hover:bg-white/5 hover:text-white"
                      }`
                    }
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    Development Roadmap
                  </NavLink>
                </li>
              </ul>
            </div>
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>

      <DocsSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
