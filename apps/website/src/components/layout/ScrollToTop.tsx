import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useLenis } from "lenis/react";

/**
 * Scroll management on navigation:
 * - without a hash: jump to top (previous behavior);
 * - with a hash: deep-link to the target section once it renders (lazy
 *   pages load async, so retry for a few frames), honoring the element's
 *   scroll-margin-top so the header never covers the heading.
 */
export function ScrollToTop() {
  const location = useLocation();
  const lenis = useLenis();

  useEffect(() => {
    const rawHash = decodeURIComponent(location.hash.slice(1));

    if (rawHash) {
      let attempts = 0;
      let cancelled = false;

      const scrollToTarget = () => {
        const element = document.getElementById(rawHash);
        if (!element) {
          // Page (or its sections) may still be loading — retry a few frames.
          if (attempts < 30 && !cancelled) {
            attempts += 1;
            window.requestAnimationFrame(scrollToTarget);
          }
          return;
        }
        const margin =
          Number.parseFloat(
            window.getComputedStyle(element).scrollMarginTop,
          ) || 0;
        if (lenis) {
          lenis.scrollTo(element, { offset: -margin, force: true });
        } else {
          // Reduced motion: native scrolling is kept (CSS scroll-margin applies).
          element.scrollIntoView({ behavior: "instant" as ScrollBehavior });
        }
      };

      window.requestAnimationFrame(scrollToTarget);
      return () => {
        cancelled = true;
      };
    }

    if (lenis) {
      lenis.scrollTo(0, { immediate: true, force: true });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [location, lenis]);

  return null;
}
