import {
  useEffect,
  useCallback,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, FileText, Search } from "lucide-react";
import { searchDocs, preloadSearch, type SearchRecord } from "../../lib/docs";

interface DocsSearchProps {
  open: boolean;
  onClose: () => void;
}

export function DocsSearch({ open, onClose }: DocsSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      void preloadSearch();
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;

    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      const found = await searchDocs(query);
      if (!cancelled) {
        setResults(found);
        setActiveIndex(0);
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const select = useCallback(
    (record: SearchRecord | undefined) => {
      if (!record) return;
      navigate(`/docs/${record.slug}`);
      onClose();
    },
    [navigate, onClose],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      select(results[activeIndex]);
    } else if (event.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 px-4 pt-[15vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-white/15 bg-[#0d0d0d] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <Search className="h-4 w-4 shrink-0 text-white/50" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search documentation..."
            className="w-full bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-white/40"
          />
          <kbd className="shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/50">
            ESC
          </kbd>
        </div>

        <div className="max-h-[45vh] overflow-y-auto p-2">
          {query.trim() && results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-white/50">
              No results for "{query}"
            </p>
          )}
          {!query.trim() && (
            <p className="px-3 py-6 text-center text-sm text-white/40">
              Type to search across all documentation.
            </p>
          )}
          {results.map((record, index) => (
            <button
              key={`${record.slug}-${index}`}
              type="button"
              onClick={() => select(record)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                index === activeIndex ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-white">
                  {record.title}
                  <span className="ml-2 text-xs font-normal text-white/50">
                    {record.heading}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-white/60">
                  {record.excerpt}
                </span>
              </span>
              {index === activeIndex && (
                <CornerDownLeft className="mt-1 h-3.5 w-3.5 shrink-0 text-white/40" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
