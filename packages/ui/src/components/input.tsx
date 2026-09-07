import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, className, id, ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-foreground-secondary">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`h-9 rounded-sm border bg-elevated px-3 text-sm text-foreground placeholder:text-foreground-disabled transition-colors duration-150 focus:border-primary focus:outline-none ${error ? 'border-error' : 'border-border'} ${className ?? ''}`}
        {...props}
      />
      {error ? (
        <p className="text-xs text-error">{error}</p>
      ) : hint ? (
        <p className="text-xs text-foreground-muted">{hint}</p>
      ) : null}
    </div>
  );
}
