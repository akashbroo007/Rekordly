import type { TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Textarea({ label, hint, error, className, id, ...props }: TextareaProps) {
  const textareaId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={textareaId} className="text-xs font-medium text-foreground-secondary">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={`min-h-[80px] rounded-sm border bg-elevated px-3 py-2 text-sm text-foreground placeholder:text-foreground-disabled transition-colors duration-150 focus:border-primary focus:outline-none resize-none ${error ? 'border-error' : 'border-border'} ${className ?? ''}`}
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
