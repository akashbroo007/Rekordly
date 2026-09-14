import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export function ShimmerButton({
  variant = "default",
  size = "sm",
  className = "",
  children,
  ...props
}: ShimmerButtonProps) {
  const baseClasses =
    "group relative inline-flex items-center justify-center overflow-hidden rounded-full font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50";

  const variants = {
    default: "bg-white text-black hover:bg-gray-100",
    outline:
      "border border-white/20 bg-white/5 backdrop-blur-xl text-white hover:bg-white/10 hover:border-white/30",
    ghost: "text-white/90 hover:text-white hover:bg-white/10",
  };

  const sizes = {
    sm: "h-9 px-4 text-sm",
    md: "h-10 px-5 text-sm",
    lg: "h-11 px-6 text-[15px]",
  };

  return (
    <button
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      <span className="relative z-10 flex items-center">{children}</span>
      <div className="absolute inset-0 -top-2 -bottom-2 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-full" />
    </button>
  );
}

interface ShimmerLinkButtonProps {
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  href: string;
  external?: boolean;
  className?: string;
  children: ReactNode;
}

export function ShimmerLinkButton({
  variant = "default",
  size = "sm",
  href,
  external = false,
  className = "",
  children,
}: ShimmerLinkButtonProps) {
  const baseClasses =
    "group relative inline-flex items-center justify-center overflow-hidden rounded-full font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20";

  const variants = {
    default: "bg-white text-black hover:bg-gray-100",
    outline:
      "border border-white/20 bg-white/5 backdrop-blur-xl text-white hover:bg-white/10 hover:border-white/30",
    ghost: "text-white/90 hover:text-white hover:bg-white/10",
  };

  const sizes = {
    sm: "h-9 px-4 text-sm",
    md: "h-10 px-5 text-sm",
    lg: "h-11 px-6 text-[15px]",
  };

  const classes = `${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`;

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        <span className="relative z-10 flex items-center">{children}</span>
        <div className="absolute inset-0 -top-2 -bottom-2 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-full" />
      </a>
    );
  }

  return (
    <Link to={href} className={classes}>
      <span className="relative z-10 flex items-center">{children}</span>
      <div className="absolute inset-0 -top-2 -bottom-2 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-full" />
    </Link>
  );
}
