'use client';

import { useRef } from 'react';
import { Captions, NotebookPen, Video } from 'lucide-react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { AmbientBg, AnimatedText, EASE_OUT, Reveal, TiltCard } from '@/components/saathi/motion';
import { cn } from '@/lib/cn';
import { LoopVideo } from './loop-video';

const PAD = 'px-6 md:px-12 lg:px-20';

const POINTS = [
  {
    icon: NotebookPen,
    title: 'Your notes arrive first',
    body: 'Send the slip in the chat, and Saathi has read it before it picks up.',
  },
  {
    icon: Captions,
    title: 'Plain words, no rush',
    body: 'It asks what a good doctor would, and says up front that it’s an AI.',
  },
  {
    icon: Video,
    title: 'Video when it needs to see',
    body: 'WhatsApp calls are voice. For a rash or a wound, switch to a video consult in your browser.',
  },
];

/** The product films, right after the hero: the consult end to end, then the call itself. */
export function ProductFilm() {
  const frame = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: frame, offset: ['start end', 'center center'] });
  const scale = useTransform(scrollYProgress, [0, 1], [0.86, 1]);
  const radius = useTransform(scrollYProgress, [0, 1], [40, 20]);
  const tilt = useTransform(scrollYProgress, [0, 1], [10, 0]);

  return (
    <section id="film" className="bg-brand relative isolate overflow-hidden text-white">
      <AmbientBg />
      <div className={cn('relative mx-auto max-w-7xl pt-20 pb-24 md:pt-28 md:pb-32', PAD)}>
        <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-end">
          <AnimatedText
            as="h2"
            inView
            text="Watch a consult, start to finish."
            emphasis={['finish']}
            className="font-display tracking-display text-3xl leading-[1.05] md:text-5xl lg:text-6xl"
          />
          <AnimatedText
            inView
            delay={0.3}
            stagger={0.035}
            text="Type what’s wrong, send it on WhatsApp, talk it through, and leave with a next step in plain words."
            className="max-w-sm text-gray-300 md:justify-self-end md:text-right"
          />
        </div>

        {/* The consult film grows into place as it scrolls up */}
        <div ref={frame} className="mt-14 [perspective:1600px]">
          <motion.div
            style={reduce ? undefined : { scale, borderRadius: radius, rotateX: tilt }}
            className="origin-top overflow-hidden border border-white/10 bg-[#f2f4f3] shadow-[0_60px_120px_-40px_rgb(0_0_0/0.6)]"
          >
            <LoopVideo
              name="consult-flow"
              width={1920}
              height={1080}
              label="A Saathi consult: notes typed into the composer, a token card, the notes sent in a WhatsApp chat, a call, and a next-step summary."
            />
          </motion.div>
        </div>

        <div className="mt-24 grid items-center gap-14 md:mt-32 md:grid-cols-[1fr_0.9fr] lg:gap-24">
          <div>
            <AnimatedText
              as="h3"
              inView
              text="Talk it through, in plain words."
              emphasis={['plain']}
              className="font-display tracking-display text-3xl leading-[1.05] md:text-5xl"
            />
            <ul className="mt-10 divide-y divide-white/10 border-y border-white/10">
              {POINTS.map(({ icon: Icon, title, body }, i) => (
                <motion.li
                  key={title}
                  initial={reduce ? false : { opacity: 0, x: -24 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '0px 0px -10% 0px' }}
                  transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.1 + i * 0.1 }}
                  className="group flex gap-5 py-6"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 transition-colors group-hover:bg-white group-hover:text-gray-900">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="font-display tracking-display-sm block text-xl md:text-2xl">
                      {title}
                    </span>
                    <span className="mt-1.5 block max-w-md leading-relaxed text-gray-300">
                      {body}
                    </span>
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>
          <Reveal y={60}>
            <TiltCard className="mx-auto w-full max-w-[460px] overflow-hidden rounded-[28px] border border-white/10 shadow-[0_50px_100px_-30px_rgb(0_0_0/0.6)]">
              <LoopVideo
                name="whatsapp-call"
                width={1080}
                height={1350}
                label="A WhatsApp voice call with Saathi, with live captions of the conversation."
              />
            </TiltCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
