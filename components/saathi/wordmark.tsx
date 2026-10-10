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
      aria-label="doctor.ai home"
      className={cn(
        'font-display tracking-display-sm text-2xl leading-none font-bold',
        tone === 'light' ? 'text-white' : 'text-gray-900',
        className
      )}
    >
      doctor
      <span className={tone === 'light' ? 'text-white/55' : 'text-gray-400'}>.ai</span>
    </Link>
  );
}
