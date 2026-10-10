'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { AnimatedText, EASE_OUT } from '@/components/saathi/motion';
import type { AvatarDrive } from '@/components/saathi/three/types';
import { Composer } from './composer';

const AvatarStage = dynamic(() => import('@/components/saathi/three/avatar-stage'), {
  ssr: false,
  loading: () => null,
});

type Line = { who: 'Saathi' | 'Ayesha'; text: string };

const SCRIPT: Line[] = [
  { who: 'Saathi', text: 'Hi Ayesha, I’ve read your notes. The rash started three days ago?' },
  { who: 'Ayesha', text: 'Yes, and it itches more at night.' },
  { who: 'Saathi', text: 'Hold your arm near a window so I can see it in daylight.' },
  { who: 'Saathi', text: 'It looks like contact dermatitis. Did you change soap recently?' },
  { who: 'Ayesha', text: 'We did, last week.' },
  { who: 'Saathi', text: 'If it blisters or spreads to your face, see a doctor in person today.' },
];
const HELLO: Line = { who: 'Saathi', text: 'Hello! I’m Saathi. Tell me what’s bothering you.' };

export function Hero() {
  const reduce = useReducedMotion();
  const drive = useRef<AvatarDrive>({ level: 0, mood: 'idle', synthetic: true });
  const [i, setI] = useState(0);
  const [hello, setHello] = useState(false);
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end start'] });
  const avatarY = useTransform(scrollYProgress, [0, 1], ['0%', '14%']);
  const copyY = useTransform(scrollYProgress, [0, 1], ['0%', '-10%']);

  const line = hello ? HELLO : SCRIPT[i];

  // Saathi's lines move the mouth; the patient's lines make him listen.
  useEffect(() => {
    const d = drive.current;
    d.mood = line.who === 'Saathi' ? 'speaking' : 'listening';
    if (line.who === 'Ayesha') d.nodAt = performance.now() + 900;
    const t = setTimeout(
      () => {
        if (d.mood === 'speaking') d.mood = 'idle';
      },
      line.who === 'Saathi' ? 2700 : 0
    );
    return () => clearTimeout(t);
  }, [line]);

  useEffect(() => {
    if (hello) {
      const t = setTimeout(() => setHello(false), 3600);
      return () => clearTimeout(t);
    }
    const t = setInterval(() => setI((v) => (v + 1) % SCRIPT.length), 3800);
    return () => clearInterval(t);
  }, [hello]);

  const onPoke = useCallback(() => setHello(true), []);

  return (
    <section
      ref={section}
      className="relative isolate overflow-hidden bg-gradient-to-b from-white via-white to-[#e6ebe9]"
    >
      {/* Soft halo behind the doctor */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[2%] right-[-12%] -z-10 size-[min(110vw,1100px)] rounded-full bg-[radial-gradient(circle,rgb(43_53_52/0.12),transparent_62%)]"
      />

      <div className="mx-auto grid min-h-[calc(100svh-72px)] max-w-7xl items-center gap-4 px-6 pt-4 pb-16 md:px-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:px-20 lg:pb-24">
        {/* Copy + interactive box */}
        <motion.div
          style={reduce ? undefined : { y: copyY }}
          className="relative z-10 order-2 lg:order-1"
        >
          <AnimatedText
            as="h1"
            text="A doctor who picks up on WhatsApp."
            emphasis={['picks', 'up']}
            className="font-display tracking-display text-4xl leading-[1.02] text-gray-900 md:text-6xl lg:text-7xl"
          />
          <AnimatedText
            text="Tell Saathi what’s wrong. Get a clear next step in minutes."
            delay={0.5}
            className="mt-5 max-w-lg text-lg text-gray-600 md:text-xl"
          />

          <div className="mt-9">
            <Composer delay={1.1} />
          </div>

          <motion.p
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.7 }}
            className="mt-6 max-w-md text-xs leading-relaxed text-gray-500"
          >
            Saathi is an AI, not a replacement for your doctor. In an emergency, call your local
            emergency number.
          </motion.p>
        </motion.div>

        {/* The doctor: dominates the right of the hero, cropped at the chest like a close-up. */}
        <motion.div
          style={reduce ? undefined : { y: avatarY }}
          className="relative order-1 -mx-6 h-[64svh] min-h-[440px] md:mx-0 lg:absolute lg:inset-y-0 lg:right-[-3vw] lg:order-none lg:h-auto lg:min-h-0 lg:w-[60vw]"
        >
          <AvatarStage
            drive={drive}
            onPoke={onPoke}
            framing="hero"
            className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_78%,transparent_100%)]"
          />

          {/* Subtitles: what's being said on the demo call. */}
          <div
            aria-live="polite"
            className="pointer-events-none absolute inset-x-0 bottom-[6%] flex justify-center px-6 lg:bottom-[9%]"
          >
            <AnimatePresence mode="wait">
              <motion.p
                key={hello ? 'hello' : i}
                initial={reduce ? false : { opacity: 0, y: 10, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={reduce ? undefined : { opacity: 0, y: -8, filter: 'blur(6px)' }}
                transition={{ duration: 0.45, ease: EASE_OUT }}
                className={
                  line.who === 'Saathi'
                    ? 'font-display max-w-[30rem] text-center text-xl leading-snug text-gray-900 [text-shadow:0_0_18px_white,0_0_4px_white] md:text-2xl'
                    : 'max-w-[26rem] text-center text-base text-gray-500 italic [text-shadow:0_0_14px_white]'
                }
              >
                {line.who === 'Saathi' ? line.text : `“${line.text}”`}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Vitara's 32px fade into the dark section below */}
      <div className="to-brand pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent" />
    </section>
  );
}
