import * as React from "react";
import { cn } from "@/lib/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("input-base", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("input-base h-auto min-h-[80px] resize-y py-2 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> & { options: SelectOption[]; placeholder?: string }
>(({ className, options, placeholder, ...props }, ref) => (
  <select ref={ref} className={cn("input-base cursor-pointer pe-8", className)} {...props}>
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {options.map((o) => (
      <option key={o.value} value={o.value} disabled={o.disabled}>
        {o.label}
      </option>
    ))}
  </select>
));
NativeSelect.displayName = "NativeSelect";

export function Field({
  label,
  error,
  hint,
  children,
  className,
  required,
  htmlFor,
}: {
  label?: React.ReactNode;
  error?: string | null;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ms-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs text-danger" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
