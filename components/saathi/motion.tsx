'use client';

import { useEffect, useRef } from 'react';
import Lenis from 'lenis';
import {
  type HTMLMotionProps,
  type MotionValue,
  motion,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from 'motion/react';
import { cn } from '@/lib/cn';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type TextTag = 'h1' | 'h2' | 'h3' | 'p' | 'span';

/**
 * Splits text into words and fades each one up (opacity 0→1, 20px→0, 0.6s ease-out),
 * staggered. Runs on mount, or when scrolled into view with `inView`.
 * Words listed in `emphasis` render in italic.
 */
export function AnimatedText({
  text,
  as = 'p',
  className,
  delay = 0,
  stagger = 0.1,
  inView = false,
  emphasis = [],
  emphasisClassName = 'italic',
}: {
  text: string;
  as?: TextTag;
  className?: string;
  delay?: number;
  stagger?: number;
  inView?: boolean;
  emphasis?: string[];
  emphasisClassName?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { once: true, margin: '0px 0px -12% 0px' });
  const show = !inView || seen;
  const Tag = motion[as];
  const words = text.split(' ');

  if (reduce) {
    const Plain = as;
    return <Plain className={className}>{text}</Plain>;
  }

  return (
    <Tag ref={ref as never} className={className}>
      <span className="sr-only">{text}</span>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} aria-hidden>
          <motion.span
            className={cn(
              'inline-block',
              emphasis.includes(w.replace(/[.,!?]/g, '')) && emphasisClassName
            )}
            initial={{ opacity: 0, y: 20 }}
            animate={show ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.6, ease: 'easeOut', delay: delay + i * stagger }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </Tag>
  );
}

/** Fades and lifts its children into place when they scroll into view. */
export function Reveal({
  delay = 0,
  y = 28,
  className,
  children,
  ...props
}: { delay?: number; y?: number } & HTMLMotionProps<'div'>) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.8, ease: EASE_OUT, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Lenis smooth scrolling for long marketing pages. Off when reduced motion is requested. */
export function SmoothScroll() {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const lenis = new Lenis({ autoRaf: true, anchors: { offset: -80 }, lerp: 0.1 });
    return () => lenis.destroy();
  }, [reduce]);
  return null;
}

/**
 * Tilts toward the pointer in 3D with a soft glare, springing back on leave.
 * Pointer-only (no effect on touch) and off under reduced motion.
 */
export function TiltCard({
  max = 8,
  className,
  children,
  glare = true,
}: {
  max?: number;
  className?: string;
  children: React.ReactNode;
  glare?: boolean;
}) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 220, damping: 22 });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 220, damping: 22 });
  const gx = useTransform(px, (v) => `${v * 100}%`);
  const gy = useTransform(py, (v) => `${v * 100}%`);
  const glareBg = useTransform(
    [gx, gy] as MotionValue<string>[],
    ([x, y]) =>
      `radial-gradient(420px circle at ${x} ${y}, rgb(255 255 255 / 0.18), transparent 60%)`
  );

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={cn('relative [transform-style:preserve-3d]', className)}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1100 }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
    >
      {children}
      {glare && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: glareBg }}
        />
      )}
    </motion.div>
  );
}

/** Pulls its child a few pixels toward the cursor — for primary calls to action. */
export function Magnetic({
  strength = 0.25,
  className,
  children,
}: {
  strength?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 260, damping: 18 });
  const y = useSpring(0, { stiffness: 260, damping: 18 });
  if (reduce) return <span className={cn('inline-flex', className)}>{children}</span>;
  return (
    <motion.span
      className={cn('inline-flex', className)}
      style={{ x, y }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.span>
  );
}

/** Moves its children at a different speed to the page while it scrolls past. */
export function Parallax({
  speed = 0.15,
  className,
  children,
}: {
  speed?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [`${speed * 100}%`, `${-speed * 100}%`]);
  return (
    <motion.div ref={ref} className={className} style={reduce ? undefined : { y }}>
      {children}
    </motion.div>
  );
}

/**
 * Slow drifting light for dark sections: two blurred glows and a film-grain layer.
 * CSS-only animation, so it costs nothing on the main thread.
 */
export function AmbientBg({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <div className="animate-drift-a absolute -top-1/3 -left-1/4 size-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.09),transparent)]" />
      <div className="animate-drift-b absolute -right-1/4 -bottom-1/2 size-[60vmax] rounded-full bg-[radial-gradient(closest-side,rgb(122_158_150/0.16),transparent)]" />
      <div className="bg-grain absolute inset-0 opacity-[0.06] mix-blend-overlay" />
    </div>
  );
}

/**
 * A marquee whose speed follows the scroll: it drifts on its own and surges (or reverses)
 * as the page is scrolled.
 */
export function VelocityMarquee({
  children,
  baseVelocity = -2.2,
  className,
}: {
  children: React.ReactNode;
  baseVelocity?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const factor = useTransform(velocity, [-1500, 0, 1500], [-4, 0, 4], { clamp: false });
  const dir = useRef(1);
  const pct = useTransform(x, (v) => `${((((v % 50) + 50) % 50) - 50).toFixed(3)}%`);

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const f = factor.get();
    if (f < 0) dir.current = -1;
    else if (f > 0) dir.current = 1;
    const move = dir.current * baseVelocity * (delta / 1000) * (1 + Math.abs(f));
    x.set(x.get() + move);
  });

  return (
    <div className={cn('overflow-hidden', className)}>
      <motion.div className="flex w-max whitespace-nowrap" style={{ x: reduce ? 0 : pct }}>
        {children}
        {children}
      </motion.div>
    </div>
  );
}

/** Shimmering placeholder blocks shown while the browser store hydrates. */
export function PageSkeleton() {
  return (
    <div className="min-h-svh bg-white" aria-busy="true" aria-label="Loading">
      <div className="border-b border-gray-100 px-6 py-5 md:px-12">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="skeleton h-7 w-24 rounded-md" />
          <div className="skeleton h-8 w-40 rounded-full" />
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:px-12 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="skeleton h-12 w-3/4 rounded-lg" />
          <div className="skeleton h-72 w-full rounded-2xl" />
        </div>
        <div className="space-y-5">
          <div className="skeleton h-56 w-full rounded-2xl" />
          <div className="skeleton h-32 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export { EASE_OUT };
