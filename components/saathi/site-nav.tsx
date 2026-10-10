'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Magnetic } from '@/components/saathi/motion';
import { Wordmark } from '@/components/saathi/wordmark';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#video', label: 'Video consults' },
  { href: '/#safety', label: 'Safety' },
  { href: '/#faq', label: 'FAQ' },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={cn(
        'sticky top-0 z-50 bg-white transition-shadow duration-300',
        scrolled && 'shadow-[0_1px_0_rgb(0_0_0/0.06),0_8px_24px_-12px_rgb(0_0_0/0.12)]'
      )}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-12 lg:px-20">
        <Wordmark />
        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="group relative text-sm text-gray-600 transition-colors hover:text-gray-900"
            >
              {l.label}
              <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-gray-900 transition-transform duration-300 group-hover:scale-x-100" />
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/start"
            className="px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:text-gray-900"
          >
            My details
          </Link>
          <Magnetic>
            <Link
              href="/start"
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-gray-900"
            >
              Start a consult
            </Link>
          </Magnetic>
        </div>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-lg text-gray-900 md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="overflow-hidden border-t border-gray-100 bg-white md:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-3 text-gray-700 hover:bg-gray-50"
                >
                  {l.label}
                </a>
              ))}
              <Link
                href="/start"
                className="mt-2 rounded-lg bg-gray-800 px-4 py-3 text-center font-medium text-white"
              >
                Start a consult
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
