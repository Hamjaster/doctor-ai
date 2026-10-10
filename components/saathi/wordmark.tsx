import Link from 'next/link';
import { cn } from '@/lib/cn';

export function Wordmark({
  tone = 'dark',
  className,
  href = '/',
}: {
  tone?: 'dark' | 'light';
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="Saathi home"
      className={cn(
        'font-display tracking-display-sm text-2xl leading-none font-bold',
        tone === 'light' ? 'text-white' : 'text-gray-900',
        className
      )}
    >
      Saathi
    </Link>
  );
}
