import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy, Link as LinkIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { slugifyHeading } from "../../lib/docs";

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return extractText(props?.children);
  }
  return "";
}

function useCopy() {
  const [copied, setCopied] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return { copied, copy };
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const { copied, copy } = useCopy();
  const code = extractText(children).replace(/\n$/, "");

  return (
    <div className="group relative">
      <button
        type="button"
        aria-label="Copy code"
        onClick={() => copy(code)}
        className="absolute right-3 top-3 flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-black/60 px-2 text-xs text-white/60 opacity-0 backdrop-blur transition-all hover:text-white group-hover:opacity-100"
      >
        {copied ? (
          <Check className="h-3 w-3" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

function HeadingAnchor({ id }: { id: string }) {
  return (
    <a
      href={`#${id}`}
      aria-label="Link to this section"
      className="ml-2 inline-flex text-white/25 opacity-0 transition-opacity hover:text-white group-hover/h:opacity-100"
    >
      <LinkIcon className="h-3.5 w-3.5" />
    </a>
  );
}

export function MarkdownRenderer({ source }: { source: string }) {
  const navigate = useNavigate();

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          h1: ({ children }) => (
            <h1 className="group/h">{children}</h1>
          ),
          h2: ({ children }) => {
            const text = extractText(children);
            const id = slugifyHeading(text);
            return (
              <h2 id={id} className="group/h">
                {children}
                <HeadingAnchor id={id} />
              </h2>
            );
          },
          h3: ({ children }) => {
            const text = extractText(children);
            const id = slugifyHeading(text);
            return (
              <h3 id={id} className="group/h">
                {children}
                <HeadingAnchor id={id} />
              </h3>
            );
          },
          a: ({ href, children }) => {
            const label = extractText(children);
            if (!href || href.startsWith("#")) {
              return <a href={href}>{children}</a>;
            }
            if (
              href.startsWith("http") ||
              href.startsWith("mailto:")
            ) {
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {label}
                </a>
              );
            }
            // Root-absolute paths (/pricing, /blog/…) route directly;
            // bare slugs (installation, auto-record…) stay docs-relative.
            if (href.startsWith("/")) {
              return (
                <Link to={href} className="!p-0 !underline">
                  {label}
                </Link>
              );
            }
            return (
              <button
                type="button"
                onClick={() => navigate(`/docs/${href}`)}
                className="!p-0 !underline"
              >
                {label}
              </button>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
