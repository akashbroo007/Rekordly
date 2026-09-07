import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'icon';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-primary text-white hover:bg-primary-hover',
  secondary:
    'border-border bg-transparent text-foreground-secondary hover:bg-hover hover:text-foreground',
  danger: 'border-transparent bg-error text-white hover:bg-error/90',
  ghost:
    'border-transparent bg-transparent text-foreground-secondary hover:bg-hover hover:text-foreground',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-9 gap-2 px-4 text-sm',
  icon: 'h-8 w-8 p-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex select-none items-center justify-center rounded-sm border font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className ?? ''}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}
