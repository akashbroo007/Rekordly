import { lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import { ScrollToTop } from "./components/layout/ScrollToTop";
import { SmoothScroll } from "./components/layout/SmoothScroll";
import { CurrencyProvider } from "./lib/CurrencyContext";
import { HomePage } from "./pages/HomePage";

const FeaturesPage = lazy(() => import("./pages/FeaturesPage"));
const PluginsPage = lazy(() => import("./pages/PluginsPage"));
const DownloadPage = lazy(() => import("./pages/DownloadPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const RoadmapPage = lazy(() => import("./pages/RoadmapPage"));
const TermsPage = lazy(() => import("./pages/legal/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/legal/PrivacyPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const DocsLayout = lazy(() => import("./pages/docs/DocsLayout"));
const DocsHomePage = lazy(() => import("./pages/docs/DocsHomePage"));
const DocsArticlePage = lazy(() => import("./pages/docs/DocsArticlePage"));

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
    </div>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

export default function App() {
  return (
    <SmoothScroll>
      <CurrencyProvider>
        <div className="flex min-h-screen flex-col bg-black">
          <ScrollToTop />
          <Navbar />
          <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/features"
            element={
              <Lazy>
                <FeaturesPage />
              </Lazy>
            }
          />
          <Route
            path="/plugins"
            element={
              <Lazy>
                <PluginsPage />
              </Lazy>
            }
          />
          <Route
            path="/download"
            element={
              <Lazy>
                <DownloadPage />
              </Lazy>
            }
          />
          <Route
            path="/pricing"
            element={
              <Lazy>
                <PricingPage />
              </Lazy>
            }
          />
          <Route
            path="/contact"
            element={
              <Lazy>
                <ContactPage />
              </Lazy>
            }
          />
          <Route
            path="/roadmap"
            element={
              <Lazy>
                <RoadmapPage />
              </Lazy>
            }
          />
          <Route
            path="/terms"
            element={
              <Lazy>
                <TermsPage />
              </Lazy>
            }
          />
          <Route
            path="/privacy"
            element={
              <Lazy>
                <PrivacyPage />
              </Lazy>
            }
          />
          <Route
            path="/docs"
            element={
              <Lazy>
                <DocsLayout />
              </Lazy>
            }
          >
            <Route index element={<DocsHomePage />} />
            <Route path=":section" element={<DocsArticlePage />} />
          </Route>
          <Route
            path="*"
            element={
              <Lazy>
                <NotFoundPage />
              </Lazy>
            }
          />
        </Routes>
      </main>
          <Footer />
        </div>
      </CurrencyProvider>
    </SmoothScroll>
  );
}
