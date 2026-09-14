import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";

/**
 * Smooth window scrolling via Lenis. Uses `root` mode so the real window is
 * scrolled — `position: sticky` elements (docs sidebar, TOC), IntersectionObserver
 * scroll-spy, and framer-motion scroll tracking all keep working untouched.
 *
 * Disabled when the user prefers reduced motion — native scrolling is kept.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return <>{children}</>;
  }

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1,
        autoRaf: true,
        anchors: true,
      }}
    >
      {children}
    </ReactLenis>
  );
}
