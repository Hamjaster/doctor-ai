'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-sm font-medium text-gray-900">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs leading-relaxed text-gray-500">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 transition-[border-color,box-shadow] focus:border-gray-400 focus:outline-none focus-visible:outline-none focus:ring-4 focus:ring-gray-900/5';

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <fieldset className={cn('flex flex-col', className)}>
      <legend className="mb-3 text-sm font-medium text-gray-900">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={cn(
                'rounded-full border px-4 py-2 text-sm transition-[background-color,border-color,color,transform] active:scale-95',
                on
                  ? 'border-brand bg-brand text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900'
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm transition-[background-color,border-color,color,transform] active:scale-95',
        on
          ? 'border-brand bg-brand text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900'
      )}
    >
      {children}
    </button>
  );
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ComponentProps<'button'> & { variant?: 'primary' | 'quiet' | 'ghost' }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 font-medium transition-[transform,background-color,opacity] disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' &&
          'bg-brand hover:bg-brand-2 text-white enabled:hover:-translate-y-0.5',
        variant === 'quiet' &&
          'border border-gray-200 bg-white text-gray-900 hover:border-gray-400',
        variant === 'ghost' && 'text-gray-500 hover:text-gray-900',
        className
      )}
    />
  );
}

/** Page header for the app screens (dashboard, consult, video). */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 md:px-12">
        {children}
      </div>
    </header>
  );
}
