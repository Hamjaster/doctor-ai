'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  Eye,
  FileText,
  Hand,
  Phone,
  Pill,
  Plus,
  ScanFace,
  ShieldAlert,
  Smile,
} from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  AmbientBg,
  AnimatedText,
  EASE_OUT,
  Magnetic,
  Reveal,
  TiltCard,
  VelocityMarquee,
} from '@/components/saathi/motion';
import { Wordmark } from '@/components/saathi/wordmark';
import { RED_FLAGS } from '@/lib/brief';
import { cn } from '@/lib/cn';

const PAD = 'px-6 md:px-12 lg:px-20';

/* ───────────────────────── Statement ───────────────────────── */

const TOPICS = [
  'Fever',
  'Rashes',
  'Cough that won’t go',
  'Blood pressure',
  'Sugar levels',
  'Stomach pain',
  'Medicine doses',
  'Lab reports',
  'Child’s temperature',
  'Headaches',
  'Allergies',
];

export function Statement() {
  return (
    <section className="bg-brand relative isolate overflow-hidden text-white">
      <AmbientBg />
      <div
        className={cn('relative mx-auto grid max-w-7xl gap-10 py-24 md:grid-cols-2 md:py-32', PAD)}
      >
        <AnimatedText
          as="h2"
          inView
          text="Your first call when something feels wrong"
          className="font-display tracking-display text-3xl leading-[1.05] md:text-5xl lg:text-6xl"
        />
        <div className="flex md:justify-end md:self-end">
          <AnimatedText
            inView
            delay={0.3}
            stagger={0.04}
            text="doctor.ai listens, asks the questions a good doctor would, looks when you show it, and tells you plainly what to do next."
            className="max-w-sm text-gray-300 md:text-right"
          />
        </div>
      </div>
      {/* What people call about, drifting past */}
      <div className="relative border-t border-white/10 py-7" aria-hidden>
        <VelocityMarquee>
          <div className="flex gap-12 pr-12">
            {TOPICS.map((t, i) => (
              <span
                key={i}
                className="font-display tracking-display-sm flex items-center gap-12 text-2xl text-white/35 italic md:text-3xl"
              >
                {t}
                <Plus className="size-4 text-white/20" />
              </span>
            ))}
          </div>
        </VelocityMarquee>
        <div className="from-brand pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r to-transparent" />
        <div className="from-brand pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l to-transparent" />
      </div>
    </section>
  );
}

/* ───────────────────────── How it works ───────────────────────── */

const STEPS = [
  {
    title: 'Say who you are',
    body: 'Your name, your number and one line about your health. Ten seconds, and doctor.ai reads it before it says hello.',
  },
  {
    title: 'Call doctor.ai on WhatsApp',
    body: 'Send your notes in the chat, then tap call. You start with the problem, not with paperwork.',
  },
  {
    title: 'Leave with a next step',
    body: 'Care at home, see a doctor this week, or get help now. doctor.ai tells you which, in plain words.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24">
      <div className={cn('mx-auto max-w-7xl pt-24 md:pt-32', PAD)}>
        <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-end">
          <AnimatedText
            as="h2"
            inView
            text="From “something’s wrong” to a next step, in one call."
            className="font-display tracking-display text-3xl leading-[1.05] text-gray-900 md:text-5xl lg:text-6xl"
          />
          <AnimatedText
            inView
            delay={0.3}
            stagger={0.04}
            text="No waiting room, no appointment. Three steps, and the first one you can do right now."
            className="max-w-sm text-gray-600 md:justify-self-end md:text-right"
          />
        </div>
      </div>
      <StepsStory />
    </section>
  );
}

/**
 * Desktop: the steps pin to the screen and advance as you scroll, with the matching screen
 * on the right. Phones (and reduced motion): a plain stacked list.
 */
function StepsStory() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const fill = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setActive(Math.min(STEPS.length - 1, Math.floor(v * STEPS.length * 0.999)));
  });

  const list = (
    <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
      {STEPS.map((st, i) => (
        <motion.li
          key={st.title}
          initial={reduce ? false : { opacity: 0, y: 28, filter: 'blur(6px)' }}
          whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          viewport={{ once: true, margin: '0px 0px -10% 0px' }}
          transition={{ duration: 0.8, ease: EASE_OUT, delay: i * 0.12 }}
          className="relative list-none"
        >
          <span className="font-display bg-brand relative z-10 grid size-14 place-items-center rounded-full text-2xl text-white">
            {i + 1}
          </span>
          <h3 className="font-display tracking-display-sm mt-7 text-2xl text-gray-900 md:text-3xl">
            {st.title}
          </h3>
          <p className="mt-3 max-w-xs leading-relaxed text-gray-600">{st.body}</p>
        </motion.li>
      ))}
    </ol>
  );

  return (
    <>
      {/* Phones and reduced motion */}
      <div className={cn('mx-auto max-w-7xl py-16', PAD, reduce ? 'block' : 'md:hidden')}>
        {list}
      </div>

      {/* Desktop scroll story */}
      {!reduce && (
        <div ref={ref} className="relative hidden h-[300vh] md:block">
          <div className="sticky top-0 flex h-svh items-center">
            <div className={cn('mx-auto grid w-full max-w-7xl grid-cols-[1fr_1.05fr] gap-16', PAD)}>
              <div className="relative flex flex-col justify-center gap-2 pl-10">
                {/* rail */}
                <div className="absolute top-6 bottom-6 left-0 w-px bg-gray-200" />
                <motion.div
                  style={{ scaleY: fill }}
                  className="bg-brand absolute top-6 bottom-6 left-0 w-px origin-top"
                />
                {STEPS.map((st, i) => {
                  const on = i === active;
                  return (
                    <motion.div
                      key={st.title}
                      animate={{ opacity: on ? 1 : 0.32, x: on ? 0 : -8 }}
                      transition={{ duration: 0.5, ease: EASE_OUT }}
                      className="relative py-6"
                    >
                      <motion.span
                        animate={{ scale: on ? 1 : 0.6 }}
                        className={cn(
                          'absolute top-9 -left-[45px] size-2.5 rounded-full',
                          on ? 'bg-brand' : 'bg-gray-300'
                        )}
                      />
                      <span className="text-sm text-gray-500">Step {i + 1}</span>
                      <h3 className="font-display tracking-display-sm mt-2 text-3xl text-gray-900 lg:text-4xl">
                        {st.title}
                      </h3>
                      <AnimatePresence initial={false}>
                        {on && (
                          <motion.p
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.45, ease: EASE_OUT }}
                            className="max-w-md overflow-hidden pt-3 leading-relaxed text-gray-600"
                          >
                            {st.body}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
              <div className="bg-mist relative grid aspect-[5/4] place-items-center overflow-hidden rounded-3xl">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, y: 40, scale: 0.96, filter: 'blur(8px)' }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -30, scale: 0.98, filter: 'blur(6px)' }}
                    transition={{ duration: 0.55, ease: EASE_OUT }}
                    className="w-[78%]"
                  >
                    <StepScreen step={active} />
                  </motion.div>
                </AnimatePresence>
                <span className="font-display tracking-display pointer-events-none absolute right-6 bottom-2 text-[9rem] leading-none text-gray-900/[0.06]">
                  {active + 1}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** A small, truthful mock of what you see at each step. */
function StepScreen({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl shadow-gray-900/10">
        <p className="min-h-24 text-lg leading-relaxed text-gray-900">
          A red, itchy rash on my forearm. Started three days ago, worse at night.
          <motion.span
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="bg-brand ml-0.5 inline-block h-5 w-0.5 align-middle"
          />
        </p>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          {['Skin', 'Arms & hands', '1–3 days', 'Severity 4/10'].map((c, i) => (
            <motion.span
              key={c}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.08 }}
              className="rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-600"
            >
              {c}
            </motion.span>
          ))}
        </div>
      </div>
    );
  }
  if (step === 1) {
    return (
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-[#efeae2] shadow-2xl shadow-gray-900/10">
        <div className="flex items-center gap-3 bg-white px-4 py-3">
          <span className="font-display bg-brand grid size-9 place-items-center rounded-full text-white">
            d
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium text-gray-900">doctor.ai</span>
            <span className="block text-xs text-gray-500">AI doctor</span>
          </span>
          <span className="relative grid size-10 place-items-center rounded-full bg-[#25d366] text-white">
            <motion.span
              animate={{ scale: [1, 1.8], opacity: [0.7, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full border-2 border-[#25d366]"
            />
            <Phone className="size-4 fill-current" />
          </span>
        </div>
        <div className="space-y-2 p-4">
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-sm leading-relaxed text-gray-900"
          >
            doctor.ai consult DA-7K4Q · Patient: Ayesha, 34 · Concern: itchy rash on forearm
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.55 }}
            className="max-w-[80%] rounded-xl rounded-tl-sm bg-white px-3 py-2 text-sm leading-relaxed text-gray-900"
          >
            Got your notes. Tap call when you’re ready.
          </motion.div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl shadow-gray-900/10">
      <span className="flex items-center gap-2 text-sm text-gray-500">
        <CalendarCheck className="size-4" /> After the call
      </span>
      <p className="font-display tracking-display-sm mt-2 text-3xl text-gray-900">
        Care at home, <span className="italic">for now.</span>
      </p>
      <ul className="mt-4 divide-y divide-gray-100 border-y border-gray-100 text-sm text-gray-700">
        {[
          'Switch back to your old soap and keep the area dry.',
          'See a doctor in person if it blisters or spreads.',
          'Get help now if your face or lips swell.',
        ].map((t, i) => (
          <motion.li
            key={t}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.12 }}
            className="py-2.5"
          >
            {t}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────── Show it on video ───────────────────────── */

const SHOWABLE = [
  { icon: Hand, title: 'Skin', body: 'Rashes, bites, burns, spots that changed.' },
  { icon: Eye, title: 'Eyes', body: 'Redness, swelling, discharge.' },
  { icon: Smile, title: 'Mouth & throat', body: 'Ulcers, tonsils, a sore tooth.' },
  { icon: ScanFace, title: 'Cuts & wounds', body: 'Whether it’s healing or getting worse.' },
  { icon: Pill, title: 'Medicine strips', body: 'Hold up the pack and ask what it’s for.' },
  { icon: FileText, title: 'Reports', body: 'Lab results and prescriptions, read with you.' },
];

export function ShowOnVideo() {
  return (
    <section id="video" className="bg-mist scroll-mt-24">
      <div className={cn('mx-auto max-w-7xl py-24 md:py-32', PAD)}>
        <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-end">
          <AnimatedText
            as="h2"
            inView
            text="Some things are easier to show than describe."
            emphasis={['show']}
            className="font-display tracking-display text-3xl leading-[1.05] text-gray-900 md:text-5xl lg:text-6xl"
          />
          <AnimatedText
            inView
            delay={0.3}
            stagger={0.04}
            text="WhatsApp calls are voice only. When doctor.ai needs to see, switch to a video consult in your browser and hold it up to the camera."
            className="max-w-sm text-gray-600 md:justify-self-end md:text-right"
          />
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3 md:grid-rows-3">
          <Reveal className="bg-brand relative overflow-hidden rounded-2xl p-7 text-white md:row-span-3">
            <Viewfinder />
            <div className="relative flex h-full min-h-[280px] flex-col justify-end">
              <h3 className="font-display tracking-display-sm text-3xl md:text-4xl">
                Hold it up to the camera.
              </h3>
              <p className="mt-3 max-w-xs text-gray-300">
                doctor.ai looks, asks what it needs to, and tells you what it sees.
              </p>
              <Link
                href="/start?next=video"
                className="group mt-6 inline-flex w-fit items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-900"
              >
                Start a video consult
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>
          {SHOWABLE.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={0.06 * i}>
              <TiltCard max={6} className="h-full rounded-2xl">
                <motion.div
                  whileHover={{ y: -4 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                  className="group h-full rounded-2xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-xl hover:shadow-gray-900/5"
                >
                  <span className="bg-mist group-hover:bg-brand grid size-11 place-items-center rounded-xl text-gray-900 transition-colors group-hover:text-white">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="font-display tracking-display-sm mt-5 text-xl text-gray-900">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{body}</p>
                </motion.div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Viewfinder() {
  const reduce = useReducedMotion();
  const c = 'absolute size-9 border-white/50';
  return (
    <div aria-hidden className="pointer-events-none absolute inset-6">
      <span className={cn(c, 'top-0 left-0 rounded-tl-xl border-t-2 border-l-2')} />
      <span className={cn(c, 'top-0 right-0 rounded-tr-xl border-t-2 border-r-2')} />
      <span className={cn(c, 'bottom-0 left-0 rounded-bl-xl border-b-2 border-l-2')} />
      <span className={cn(c, 'right-0 bottom-0 rounded-br-xl border-r-2 border-b-2')} />
      {!reduce && (
        <div className="absolute inset-x-3 top-0 h-[55%]">
          <div className="animate-scan h-px w-full bg-gradient-to-r from-transparent via-white/70 to-transparent shadow-[0_0_24px_4px_rgb(255_255_255/0.25)]" />
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Safety ───────────────────────── */

export function Safety() {
  return (
    <section id="safety" className={cn('mx-auto max-w-7xl scroll-mt-24 py-24 md:py-32', PAD)}>
      <Reveal className="bg-brand relative isolate overflow-hidden rounded-3xl p-8 text-white sm:p-12 md:p-16">
        <AmbientBg />
        <div className="relative grid gap-12 md:grid-cols-2">
          <div>
            <ShieldAlert className="size-8 text-white/80" />
            <AnimatedText
              as="h2"
              inView
              text="doctor.ai knows when a call isn’t enough."
              className="font-display tracking-display mt-6 text-3xl leading-[1.05] md:text-5xl"
            />
            <AnimatedText
              inView
              delay={0.4}
              stagger={0.03}
              text="Every call starts with doctor.ai telling you it’s an AI. If what you describe sounds like an emergency, it tells you to get help now instead of carrying on."
              className="mt-6 max-w-md leading-relaxed text-gray-300"
            />
          </div>
          <div>
            <p className="text-sm text-gray-300">Get emergency care, don’t call doctor.ai, for:</p>
            <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
              {RED_FLAGS.map((f, i) => (
                <motion.li
                  key={f}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 + i * 0.07 }}
                  className="flex items-center gap-3 py-3.5"
                >
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#ff7b66] opacity-40" />
                    <span className="relative inline-flex size-2 rounded-full bg-[#ff7b66]" />
                  </span>
                  {f}
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ───────────────────────── Families ───────────────────────── */

const PEOPLE = [
  { name: 'Me', note: 'Asthma inhaler' },
  { name: 'Ammi · 61', note: 'Amlodipine 5mg' },
  { name: 'Abbu · 66', note: 'Allergic to penicillin' },
  { name: 'Zara · 7', note: 'Weight 22 kg' },
];

export function Families() {
  return (
    <section className={cn('mx-auto max-w-7xl pb-24 md:pb-32', PAD)}>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <AnimatedText
            as="h2"
            inView
            text="One profile for everyone you look after."
            className="font-display tracking-display text-3xl leading-[1.05] text-gray-900 md:text-5xl"
          />
          <AnimatedText
            inView
            delay={0.3}
            stagger={0.03}
            text="Keep Ammi’s blood pressure tablets, Abbu’s allergies and the kids’ ages in one place. Pick who the consult is for, and doctor.ai gets the right notes."
            className="mt-6 max-w-md leading-relaxed text-gray-600"
          />
        </div>
        <div className="flex flex-col gap-3">
          {PEOPLE.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '0px 0px -10% 0px' }}
              transition={{ duration: 0.7, ease: EASE_OUT, delay: i * 0.1 }}
              whileHover={{ x: -6 }}
              className={cn(
                'flex items-center justify-between rounded-2xl border px-5 py-4',
                i === 1
                  ? 'bg-brand border-brand text-white shadow-xl shadow-gray-900/15'
                  : 'border-gray-200 bg-white text-gray-900'
              )}
            >
              <span className="font-display tracking-display-sm text-xl">{p.name}</span>
              <span className={cn('text-sm', i === 1 ? 'text-gray-300' : 'text-gray-500')}>
                {p.note}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── FAQ ───────────────────────── */

const FAQ = [
  {
    q: 'Is doctor.ai a real doctor?',
    a: 'No. doctor.ai is an AI, and it says so on every call. It helps you understand what might be going on and how urgent it is. It doesn’t replace a doctor who can examine you.',
  },
  {
    q: 'What do I need?',
    a: 'WhatsApp on your phone for a voice call. For a video consult, any phone or laptop browser with a camera.',
  },
  {
    q: 'Where is my health profile kept?',
    a: 'In this browser, on your device. Your notes reach doctor.ai only when you send them in WhatsApp or start a video consult.',
  },
  {
    q: 'Can I set up a profile for my parents?',
    a: 'Yes. Add a profile for each person you look after and switch between them before a consult.',
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-24 border-t border-gray-100">
      <div
        className={cn(
          'mx-auto grid max-w-7xl gap-10 py-24 md:grid-cols-[0.8fr_1.2fr] md:py-28',
          PAD
        )}
      >
        <AnimatedText
          as="h2"
          inView
          text="Questions people ask first"
          className="font-display tracking-display text-3xl leading-[1.05] text-gray-900 md:text-5xl"
        />
        <div className="divide-y divide-gray-200 border-y border-gray-200">
          {FAQ.map(({ q, a }, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={q} delay={i * 0.06} y={16}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-6 py-6 text-left text-lg text-gray-900"
                >
                  {q}
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-full border transition-colors',
                      isOpen ? 'bg-brand border-brand text-white' : 'border-gray-200 text-gray-500'
                    )}
                  >
                    <Plus className="size-4" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: EASE_OUT }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-xl pb-6 leading-relaxed text-gray-600">{a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Closing + footer ───────────────────────── */

export function Closing() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] });
  const scale = useTransform(scrollYProgress, [0, 1], [0.92, 1]);
  const radius = useTransform(scrollYProgress, [0, 1], [48, 0]);
  const reduce = useReducedMotion();

  return (
    <div ref={ref}>
      <motion.footer
        style={
          reduce ? undefined : { scale, borderTopLeftRadius: radius, borderTopRightRadius: radius }
        }
        className="bg-brand relative isolate origin-bottom overflow-hidden text-white"
      >
        <AmbientBg />
        <div className={cn('relative mx-auto max-w-7xl pt-24 pb-10 md:pt-32', PAD)}>
          <AnimatedText
            as="h2"
            inView
            text="Feeling unwell? doctor.ai is one call away."
            className="font-display tracking-display max-w-4xl text-4xl leading-[1.02] md:text-6xl lg:text-7xl"
          />
          <Reveal delay={0.5} className="mt-10 flex flex-wrap gap-3">
            <Magnetic>
              <Link
                href="/start?next=video"
                className="group inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3.5 font-medium text-gray-900"
              >
                Start a video consult
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Magnetic>
            <Link
              href="/start?next=whatsapp"
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-6 py-3.5 font-medium text-white transition-colors hover:bg-white/10"
            >
              Chat on WhatsApp <ArrowUpRight className="size-4" />
            </Link>
          </Reveal>
          <div className="mt-24 flex flex-col gap-6 border-t border-white/10 pt-8 text-sm text-gray-400 md:flex-row md:items-end md:justify-between">
            <Wordmark tone="light" />
            <p className="max-w-lg leading-relaxed">
              doctor.ai is an AI and does not replace a doctor who can examine you. In an emergency,
              call your local emergency number now.
            </p>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}
