import type { SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: readonly { value: string; label: string }[];
}

export function Select({ label, hint, error, options, className, id, ...props }: SelectProps) {
  const selectId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-foreground-secondary">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`h-9 rounded-sm border bg-elevated px-3 text-sm text-foreground transition-colors duration-150 focus:border-primary focus:outline-none ${error ? 'border-error' : 'border-border'} ${className ?? ''}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-xs text-error">{error}</p>
      ) : hint ? (
        <p className="text-xs text-foreground-muted">{hint}</p>
      ) : null}
    </div>
  );
}
