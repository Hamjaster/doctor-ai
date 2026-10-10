'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCheck, Mic, Paperclip, Phone, Play, Video } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AnimatedText, EASE_OUT } from '@/components/saathi/motion';
import { waChatLink } from '@/lib/brief';
import { cn } from '@/lib/cn';

/*
 * The hero shows the product as it is: a WhatsApp chat with a doctor, in the language people
 * here actually type. The phone is drawn in CSS so it stays crisp and loads with the page.
 */

type Bubble =
  | { who: 'patient' | 'doctor'; kind: 'text'; text: string; time: string }
  | { who: 'patient'; kind: 'voice'; length: string; time: string }
  | { who: 'doctor'; kind: 'video'; text: string; time: string };

const CHAT: Bubble[] = [
  {
    who: 'patient',
    kind: 'text',
    text: 'Salam doctor. Mere betay ko kal raat se bukhar hai, 101 tak gaya tha.',
    time: '9:12 PM',
  },
  {
    who: 'doctor',
    kind: 'text',
    text: 'Walaikum salam. Kitni umar hai? Aur kya woh paani ya doodh theek se le raha hai?',
    time: '9:12 PM',
  },
  {
    who: 'patient',
    kind: 'text',
    text: '4 saal. Paani kam pee raha hai, thora sust hai.',
    time: '9:13 PM',
  },
  { who: 'patient', kind: 'voice', length: '0:14', time: '9:13 PM' },
  {
    who: 'doctor',
    kind: 'text',
    text: 'Paracetamol syrup packet ke hisaab se dein, aur har ghantay thora paani ya ORS. Agar saans tez ho ya bukhar 3 din se zyada rahe, foran doctor ko dikhayein.',
    time: '9:14 PM',
  },
  {
    who: 'doctor',
    kind: 'video',
    text: 'Chahen to abhi video par dikha dein, main dekh leta hoon.',
    time: '9:14 PM',
  },
];

const FACTS = [
  { title: 'Replies in under a minute', body: 'Day or night, including Eid.' },
  { title: 'Urdu, English, Punjabi', body: 'Type or send a voice note.' },
  { title: 'Video when it matters', body: 'Show a rash, a report or a medicine.' },
];

export function Hero({ whatsappNumber }: { whatsappNumber: string | null }) {
  const chatHref = whatsappNumber
    ? waChatLink(whatsappNumber, 'Salam doctor.ai, mujhe aik doctor se baat karni hai.')
    : '/start?next=whatsapp';

  return (
    <section className="relative isolate overflow-hidden bg-white">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 pt-10 pb-16 md:px-12 lg:min-h-[calc(100svh-72px)] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10 lg:px-20 lg:pt-4 lg:pb-20">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
            className="flex items-center gap-2.5 text-[13px] font-medium tracking-[0.14em] text-gray-500 uppercase"
          >
            <span className="relative flex size-2">
              <span className="bg-wa absolute inset-0 animate-ping rounded-full opacity-60" />
              <span className="bg-wa relative size-2 rounded-full" />
            </span>
            Available now · Urdu &amp; English
          </motion.p>

          <AnimatedText
            as="h1"
            text="A doctor who replies on WhatsApp."
            emphasis={['replies']}
            stagger={0.07}
            className="font-display tracking-display mt-7 max-w-[13ch] text-[clamp(2.75rem,6.4vw,5.5rem)] leading-[1.02] text-gray-900"
          />

          <AnimatedText
            text="Message doctor.ai the way you message family. Describe the problem, send a photo or a voice note, and get a clear next step, in your language."
            delay={0.4}
            stagger={0.025}
            className="mt-6 max-w-[34rem] text-lg leading-relaxed text-gray-600 md:text-[1.2rem]"
          />

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.85 }}
            className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6"
          >
            <a
              href={chatHref}
              target={whatsappNumber ? '_blank' : undefined}
              rel={whatsappNumber ? 'noopener noreferrer' : undefined}
              className="group inline-flex items-center gap-3 rounded-full bg-[#128c7e] py-4 pr-7 pl-5 text-base font-semibold text-white shadow-[0_12px_32px_-14px_rgb(18_140_126/0.9)] transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-[#0f7a6e]"
            >
              <WhatsAppMark className="size-6" />
              Message a doctor on WhatsApp
            </a>
            <Link
              href="/start?next=video"
              className="group inline-flex items-center gap-2 py-2 font-medium text-gray-900"
            >
              <Video className="size-5" />
              Start a video consult
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>

          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.1 }}
            className="mt-12 grid max-w-2xl grid-cols-1 gap-6 border-t border-gray-200 pt-7 sm:grid-cols-3 sm:gap-8"
          >
            {FACTS.map((f) => (
              <div key={f.title}>
                <dt className="font-medium text-gray-900">{f.title}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-gray-500">{f.body}</dd>
              </div>
            ))}
          </motion.dl>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.3 }}
            className="mt-8 text-xs leading-relaxed text-gray-500"
          >
            doctor.ai is an AI, not a replacement for your doctor. In an emergency, call 1122.
          </motion.p>
        </div>

        <PhoneDemo />
      </div>
    </section>
  );
}

/* ───────────────────────── The phone ───────────────────────── */

function PhoneDemo() {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(reduce ? CHAT.length : 1);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setCount((c) => (c >= CHAT.length ? 1 : c + 1)), 2400);
    return () => clearInterval(t);
  }, [reduce]);

  const shown = CHAT.slice(0, count);
  const doctorTyping = !reduce && CHAT[count]?.who === 'doctor';

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.3 }}
      className="relative mx-auto w-full max-w-[21rem] lg:max-w-[23rem]"
    >
      {/* Backdrop panel: a product shot, not a glow. */}
      <div
        aria-hidden
        className="absolute inset-x-[-14%] top-[8%] bottom-[-6%] -z-10 rounded-[2.5rem] bg-[#eef1f0]"
      />

      <div className="rounded-[2.75rem] bg-[#1b1f1e] p-[10px] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.45),0_0_0_1px_rgb(0_0_0/0.08)]">
        <div className="relative flex h-[40rem] flex-col overflow-hidden rounded-[2.1rem] bg-[#efe7dc] [background-image:radial-gradient(rgb(0_0_0/0.035)_1px,transparent_1px)] [background-size:14px_14px]">
          {/* Status bar + chat header */}
          <div className="bg-[#075e54] pt-3 text-white">
            <div className="flex items-center justify-between px-6 text-[11px] font-medium tabular-nums">
              <span>9:14</span>
              <span className="h-5 w-20 rounded-full bg-black" aria-hidden />
              <span className="flex items-center gap-1">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-5 rounded-sm border border-white/70"
                >
                  <span className="block h-full w-4/5 bg-white/90" />
                </span>
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3 px-3 pb-2.5">
              <span className="font-display grid size-9 place-items-center rounded-full bg-[#dcf8e6] text-base text-[#075e54]">
                dr
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-tight font-semibold">doctor.ai</p>
                <p className="text-[11px] leading-tight text-white/75">
                  {doctorTyping ? 'typing…' : 'online'}
                </p>
              </div>
              <Video className="size-5 text-white/90" />
              <Phone className="size-[18px] text-white/90" />
            </div>
          </div>

          {/* Messages */}
          <div className="flex flex-1 flex-col justify-end gap-1.5 px-3 pb-3">
            <p className="mx-auto mb-2 rounded-md bg-[#fdf6dd] px-3 py-1 text-center text-[10.5px] leading-snug text-gray-700 shadow-sm">
              doctor.ai is an AI. Emergency mein 1122 par call karein.
            </p>
            <AnimatePresence initial={false}>
              {shown.map((b, i) => (
                <motion.div
                  key={i}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE_OUT }}
                  className={cn('flex', b.who === 'patient' ? 'justify-end' : 'justify-start')}
                >
                  <ChatBubble bubble={b} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Composer */}
          <div className="flex items-center gap-2 px-2.5 pt-1 pb-4">
            <div className="flex h-10 flex-1 items-center gap-3 rounded-full bg-white px-4 text-[13.5px] text-gray-400 shadow-sm">
              <span className="flex-1">Message</span>
              <Paperclip className="size-4" />
            </div>
            <span className="grid size-10 place-items-center rounded-full bg-[#128c7e] text-white">
              <Mic className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ChatBubble({ bubble }: { bubble: Bubble }) {
  const patient = bubble.who === 'patient';
  const shell = cn(
    'relative max-w-[82%] rounded-xl px-3 pt-1.5 pb-1 text-[13.5px] leading-snug text-gray-900 shadow-[0_1px_1px_rgb(0_0_0/0.08)]',
    patient ? 'rounded-tr-sm bg-[#d9fdd3]' : 'rounded-tl-sm bg-white'
  );
  const meta = (
    <span className="float-right mt-1 ml-3 flex items-center gap-1 text-[10px] text-gray-500">
      {bubble.time}
      {patient && <CheckCheck className="size-3.5 text-[#53bdeb]" />}
    </span>
  );

  if (bubble.kind === 'voice') {
    return (
      <div className={cn(shell, 'w-[72%] max-w-[72%] pt-2.5')}>
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#128c7e] text-white">
            <Play className="size-3.5 fill-current" />
          </span>
          <span aria-hidden className="flex h-6 flex-1 items-center gap-[2px]">
            {VOICE_BARS.map((h, i) => (
              <span
                key={i}
                className={cn('w-[2px] rounded-full', i < 14 ? 'bg-[#128c7e]' : 'bg-gray-400/60')}
                style={{ height: `${h}%` }}
              />
            ))}
          </span>
        </div>
        <div className="flex items-center justify-between pl-[42px] text-[10px] text-gray-500">
          <span>{bubble.length}</span>
          {meta}
        </div>
      </div>
    );
  }

  if (bubble.kind === 'video') {
    return (
      <div className={shell}>
        {bubble.text}
        {meta}
        <span className="mt-2 mb-1 flex w-full items-center justify-center gap-2 rounded-lg border border-[#128c7e]/30 bg-[#128c7e]/[0.07] py-2 text-[13px] font-semibold text-[#0f7a6e]">
          <Video className="size-4" /> Video call shuru karein
        </span>
      </div>
    );
  }

  return (
    <div className={shell}>
      {bubble.text}
      {meta}
    </div>
  );
}

const VOICE_BARS = [
  30, 55, 80, 60, 95, 70, 45, 85, 65, 40, 75, 90, 55, 35, 70, 50, 85, 60, 40, 65, 45, 30, 55, 35,
];

/** The WhatsApp glyph, drawn here so it isn't filtered out of an icon set. */
function WhatsAppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2m0 1.67c4.56 0 8.24 3.69 8.24 8.24s-3.68 8.24-8.24 8.24c-1.53 0-3.01-.42-4.3-1.21l-.31-.18-3.12.82.83-3.04-.2-.32a8.2 8.2 0 0 1-1.26-4.31c0-4.55 3.69-8.24 8.24-8.24m-3.47 4.3c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.43 1.03 2.6c.12.17 1.74 2.77 4.3 3.77 2.12.84 2.55.67 3.01.63.46-.04 1.48-.6 1.69-1.19.21-.58.21-1.08.15-1.19-.06-.1-.23-.16-.48-.29s-1.48-.73-1.71-.81c-.23-.08-.4-.13-.56.12-.17.25-.65.81-.8.98-.14.17-.29.19-.54.06-.25-.12-1.06-.39-2.01-1.24-.74-.66-1.24-1.48-1.39-1.73-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.44.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.52Z" />
    </svg>
  );
}
