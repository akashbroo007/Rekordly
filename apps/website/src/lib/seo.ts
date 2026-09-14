import { useEffect } from "react";
import { site, siteUrl } from "../content/site";

export interface SeoOptions {
  /** Page title — the app name is appended automatically. */
  title: string;
  /** Meta description (155–165 chars recommended). */
  description: string;
  /** Canonical path, e.g. "/blog" (origin is added automatically). */
  path: string;
  /** Set true for pages that must stay out of the index (404, etc). */
  noindex?: boolean;
  /** Absolute or root-relative image used for og:image / twitter:image. */
  image?: string;
  /** Extra JSON-LD schema objects rendered alongside the defaults. */
  schema?: Record<string, unknown>[];
  /** Content type for the og:type tag. Defaults to "website". */
  type?: "website" | "article";
  /** Article-only metadata (published/modified time). */
  publishedTime?: string;
  modifiedTime?: string;
}

const addedNodes: Node[] = [];

function upsertMeta(
  attr: "name" | "property",
  key: string,
  content: string,
): void {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
    addedNodes.push(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
    addedNodes.push(el);
  }
  el.setAttribute("href", href);
}

function absoluteUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Declaratively manage the document head for a page. On unmount every node
 * this hook created is removed and the document reverts to the defaults in
 * index.html, so nested/route changes never leak metadata.
 */
export function useSeo(options: SeoOptions): void {
  const {
    title,
    description,
    path,
    noindex = false,
    image = "/og-image.png",
    schema = [],
    type = "website",
    publishedTime,
    modifiedTime,
  } = options;

  useEffect(() => {
    const fullTitle =
      title === site.name ? title : `${title} | ${site.name}`;
    const canonical = absoluteUrl(path);
    const ogImage = absoluteUrl(image);
    const robots = noindex
      ? "noindex, nofollow"
      : "index, follow, max-image-preview:large";

    document.title = fullTitle;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", robots);

    // Canonical
    upsertLink("canonical", canonical);

    // Open Graph
    upsertMeta("property", "og:site_name", site.name);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:image", ogImage);
    upsertMeta("property", "og:image:width", "1200");
    upsertMeta("property", "og:image:height", "630");
    upsertMeta("property", "og:image:alt", `${site.name} — ${title}`);

    // Twitter / X
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", ogImage);

    if (type === "article") {
      if (publishedTime)
        upsertMeta("property", "article:published_time", publishedTime);
      if (modifiedTime)
        upsertMeta("property", "article:modified_time", modifiedTime);
    }

    // JSON-LD structured data (WebSite on all pages + per-page extras)
    const jsonLd: Record<string, unknown>[] = [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: site.name,
        url: siteUrl,
        description: site.description,
      },
      ...schema,
    ];
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    addedNodes.push(script);

    return () => {
      for (const node of addedNodes.splice(0)) {
        node.parentNode?.removeChild(node);
      }
      document.title =
        "Rekordly — Monitor, record, and download live streams";
      const desc = document.head.querySelector('meta[name="description"]');
      if (desc) desc.remove();
    };
  }, [
    title,
    description,
    path,
    noindex,
    image,
    schema,
    type,
    publishedTime,
    modifiedTime,
  ]);
}

/** Build a schema.org FAQPage from the FAQ list. */
export function faqSchema(
  faqs: readonly { question: string; answer: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

/** Build a schema.org SoftwareApplication for the product. */
export function softwareAppSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: site.name,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Windows 10, Windows 11",
    description: site.description,
    url: siteUrl,
    image: absoluteUrl("/og-image.png"),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    license: "https://polyformproject.org/licenses/noncommercial/1.0.0",
  };
}
