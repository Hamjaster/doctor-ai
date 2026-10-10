'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';

/**
 * A silent looping product film. Loads only when it nears the viewport, plays while visible,
 * pauses when scrolled away. Under reduced motion it shows the poster frame only.
 */
export function LoopVideo({
  name,
  label,
  className,
  width,
  height,
}: {
  /** Basename under /public/videos: `<name>.webm`, `<name>.mp4`, `<name>-poster.jpg`. */
  name: string;
  /** What the film shows, for screen readers. */
  label: string;
  className?: string;
  width: number;
  height: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const visible = useRef(false);
  const poster = `/videos/${name}-poster.jpg`;

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          setNear(true);
          if (el.currentSrc) el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { rootMargin: '200px 0px', threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  // Sources mount once the film is near; load them and start if it's on screen.
  useEffect(() => {
    const el = ref.current;
    if (!near || !el) return;
    el.load();
    if (visible.current) el.play().catch(() => {});
  }, [near]);

  if (reduce) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={poster}
        alt={label}
        width={width}
        height={height}
        className={cn('block h-auto w-full', className)}
      />
    );
  }

  return (
    <video
      ref={ref}
      aria-label={label}
      className={cn('block h-auto w-full', className)}
      width={width}
      height={height}
      poster={poster}
      muted
      loop
      playsInline
      preload={near ? 'auto' : 'none'}
    >
      {near && (
        <>
          <source src={`/videos/${name}.webm`} type="video/webm" />
          <source src={`/videos/${name}.mp4`} type="video/mp4" />
        </>
      )}
    </video>
  );
}
