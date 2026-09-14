import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { useSeo } from "../lib/seo";

export default function NotFoundPage() {
  useSeo({
    title: "Page not found",
    description: "The page you're looking for doesn't exist or has moved.",
    path: "/404",
    noindex: true,
  });

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-7xl font-bold text-white/10">404</p>
      <h1 className="mt-4 text-2xl font-bold text-white">Page not found</h1>
      <p className="mt-3 max-w-sm text-white/70">
        The page you're looking for doesn't exist or has moved.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-gray-100"
      >
        <Home className="h-4 w-4" />
        Back to home
      </Link>
    </div>
  );
}
