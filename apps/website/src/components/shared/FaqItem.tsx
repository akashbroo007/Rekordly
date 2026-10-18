import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { splitFeatureMentions } from "../../content/featuresConfig";

interface FaqItemProps {
  question: string;
  answer: string;
}

export function FaqItem({ question, answer }: FaqItemProps) {
  const [open, setOpen] = useState(false);
  // The first mention of a feature name inside the answer links to its page.
  const parts = splitFeatureMentions(answer);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] transition-colors hover:border-white/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="font-medium text-white">{question}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-white/60 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <p className="px-5 pb-5 text-sm leading-6 text-white/70">
          {parts.map((part, index) =>
            typeof part === "string" ? (
              part
            ) : (
              <Link
                key={index}
                to={part.href}
                className="text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white"
              >
                {part.label}
              </Link>
            ),
          )}
        </p>
      )}
    </div>
  );
}
