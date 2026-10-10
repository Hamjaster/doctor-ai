'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Lock, Pencil } from 'lucide-react';
import { motion } from 'motion/react';
import { WhatsAppMark } from '@/components/saathi/landing/hero';
import { EASE_OUT, PageSkeleton } from '@/components/saathi/motion';
import type { AvatarDrive } from '@/components/saathi/three/types';
import { Field, inputClass } from '@/components/saathi/ui';
import { Wordmark } from '@/components/saathi/wordmark';
import { firstName, waChatLink, whatsappIntro } from '@/lib/brief';
import { cn } from '@/lib/cn';
import { type Profile, actions, useHydrated, useSaathi } from '@/lib/saathi-store';

const AvatarStage = dynamic(() => import('@/components/saathi/three/avatar-stage'), {
  ssr: false,
  loading: () => null,
});

export type StartNext = 'video' | 'whatsapp' | null;
type Channel = 'whatsapp' | 'video';

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease: EASE_OUT, delay },
});

/**
 * The only onboarding: a name, a WhatsApp number and one line of health background. That line
 * goes into doctor.ai's instructions for the consult (see lib/brief.ts). Today's problem isn't
 * asked here; the doctor asks on the call. Picking a channel is the action: tap a card and go.
 */
export function Start({
  whatsappNumber,
  videoReady,
  next,
}: {
  whatsappNumber: string | null;
  videoReady: boolean;
  next: StartNext;
}) {
  const hydrated = useHydrated();
  const state = useSaathi();
  const profile = state.profiles.find((p) => p.id === state.activeId) ?? state.profiles[0];
  if (!hydrated) return <PageSkeleton />;
  // Keyed on the profile so the form initialises from it and resets if it changes.
  return (
    <StartScreen
      key={profile?.id ?? 'new'}
      profile={profile}
      whatsappNumber={whatsappNumber}
      videoReady={videoReady}
      next={next}
    />
  );
}

function StartScreen({
  profile,
  whatsappNumber,
  videoReady,
  next,
}: {
  profile?: Profile;
  whatsappNumber: string | null;
  videoReady: boolean;
  next: StartNext;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [background, setBackground] = useState(profile?.conditions ?? '');
  const [touched, setTouched] = useState(false);

  const showForm = !profile || editing;
  const nameOk = name.trim().length >= 2;
  const phoneOk = phone.replace(/\D/g, '').length >= 10;
  const valid = nameOk && phoneOk;

  const save = (): Profile => {
    const base: Omit<Profile, 'id'> = profile ?? {
      name: '',
      relation: 'self',
      age: '',
      sex: '',
      phone: '',
      conditions: '',
      medications: '',
      allergies: '',
    };
    const data = {
      ...base,
      id: profile?.id,
      name: name.trim(),
      phone: phone.trim(),
      conditions: background.trim(),
    };
    const id = actions.saveProfile(data);
    actions.ensureRef(id);
    return { ...data, id };
  };

  const go = (channel: Channel) => {
    setTouched(true);
    if (!valid) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const saved = save();
    setEditing(false);
    if (channel === 'video') {
      router.push('/consult/video');
      return;
    }
    actions.logConsult(saved.id, 'whatsapp-chat');
    window.open(waChatLink(whatsappNumber!, whatsappIntro(saved)), '_blank', 'noopener');
  };

  const greeting = profile && !editing;

  return (
    <div className="min-h-svh bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 md:px-12">
        <Wordmark />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="size-4" /> Home
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-6 pb-20 md:px-12 lg:pt-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <motion.h1
              {...rise(0)}
              className="font-display tracking-display text-[clamp(2.75rem,6vw,4.75rem)] leading-[1.02] text-gray-900"
            >
              {greeting ? `Salam, ${firstName(profile.name)}.` : 'Tell the doctor who you are.'}
            </motion.h1>
            <motion.p
              {...rise(0.08)}
              className="mt-4 max-w-[32rem] text-lg leading-relaxed text-gray-600"
            >
              {greeting
                ? 'doctor.ai has your details. Choose how you want to talk today.'
                : 'Three details, once. doctor.ai reads them before it says hello, so you never repeat yourself.'}
            </motion.p>
          </div>

          {greeting && (
            <motion.div
              {...rise(0.14)}
              className="flex items-center gap-x-3 gap-y-1 text-sm text-gray-500 lg:justify-end lg:pb-2"
            >
              <span className="font-medium text-gray-900">{profile.name}</span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{profile.phone}</span>
              {profile.conditions.trim() && (
                <>
                  <span aria-hidden className="hidden sm:inline">
                    ·
                  </span>
                  <span className="hidden max-w-[20rem] truncate sm:inline">
                    {profile.conditions.trim()}
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900"
              >
                <Pencil className="size-3.5" /> Edit
              </button>
            </motion.div>
          )}
        </div>

        {showForm && (
          <motion.div
            ref={formRef}
            {...rise(0.14)}
            className="bg-mist mt-10 grid gap-5 rounded-3xl p-6 sm:grid-cols-2 md:p-8"
          >
            <Field label="Full name">
              {(id) => (
                <input
                  id={id}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Ayesha Khan"
                  aria-invalid={touched && !nameOk}
                  className={cn(inputClass, touched && !nameOk && 'border-danger')}
                />
              )}
            </Field>
            <Field label="WhatsApp number">
              {(id) => (
                <input
                  id={id}
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder="+92 300 1234567"
                  aria-invalid={touched && !phoneOk}
                  className={cn(inputClass, touched && !phoneOk && 'border-danger')}
                />
              )}
            </Field>
            <Field
              label="Anything the doctor should know about your health?"
              hint="One line is enough: ongoing conditions, regular medicines, allergies. Optional."
              className="sm:col-span-2"
            >
              {(id) => (
                <input
                  id={id}
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  maxLength={300}
                  placeholder="Diabetic, on blood pressure tablets, allergic to penicillin"
                  className={inputClass}
                />
              )}
            </Field>
            {touched && !valid && (
              <p role="alert" className="text-danger text-sm sm:col-span-2">
                Add your name and a WhatsApp number with country code, then pick how to talk.
              </p>
            )}
          </motion.div>
        )}

        <motion.p
          {...rise(0.2)}
          className="mt-12 text-[13px] font-medium tracking-[0.14em] text-gray-500 uppercase"
        >
          How do you want to talk?
        </motion.p>
        <div
          className={cn(
            'mt-4 grid gap-4 md:grid-cols-2 md:gap-5',
            next === 'video' && '[&>*:first-child]:order-last'
          )}
        >
          <motion.div {...rise(0.26)}>
            <WhatsAppCard available={!!whatsappNumber} onPick={() => go('whatsapp')} />
          </motion.div>
          <motion.div {...rise(0.32)}>
            <VideoCard available={videoReady} onPick={() => go('video')} />
          </motion.div>
        </div>

        <motion.div
          {...rise(0.4)}
          className="mt-8 flex flex-col gap-2 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2">
            <Lock className="size-3.5" /> Your details stay on this phone. Nothing is stored on our
            servers.
          </p>
          <p>doctor.ai is an AI, not a doctor who can examine you. In an emergency, call 1122.</p>
        </motion.div>
      </main>
    </div>
  );
}

/* ───────────────────────── Channel cards ───────────────────────── */

const cardClass =
  'group relative flex min-h-[26rem] w-full flex-col overflow-hidden rounded-3xl text-left text-white transition-[transform,box-shadow] duration-300 ease-out enabled:hover:-translate-y-1 enabled:hover:shadow-2xl enabled:hover:shadow-gray-900/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gray-900/20 disabled:cursor-not-allowed md:min-h-[30rem]';

function CardCopy({
  eyebrow,
  title,
  body,
  cta,
  available,
  unavailable,
}: {
  eyebrow: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  available: boolean;
  unavailable: string;
}) {
  return (
    <div className="relative z-10 flex flex-1 flex-col p-7 md:p-8">
      <div className="flex items-center gap-2.5 text-[13px] font-medium tracking-[0.14em] text-white/70 uppercase">
        {eyebrow}
      </div>
      <h2 className="font-display tracking-display-sm mt-5 text-4xl leading-none md:text-[2.75rem]">
        {title}
      </h2>
      <p className="mt-3 max-w-[22rem] leading-relaxed text-white/75">{body}</p>
      <span
        className={cn(
          'mt-auto inline-flex w-fit items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-[background-color,gap] group-enabled:group-hover:gap-3',
          available ? 'bg-white text-gray-900' : 'bg-white/15 text-white/70'
        )}
      >
        {available ? cta : unavailable}
        {available && <ArrowRight className="size-4" />}
      </span>
    </div>
  );
}

const PREVIEW_CHAT = [
  { who: 'patient', text: 'Salam doctor, kal se gala kharab hai aur halka bukhar.' },
  { who: 'doctor', text: 'Walaikum salam. Kitna bukhar? Nigalne mein dard hai?' },
] as const;

function WhatsAppCard({ available, onPick }: { available: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!available}
      className={cn(cardClass, 'bg-[#0b5e54]', !available && 'opacity-70 saturate-50')}
    >
      {/* A corner of the chat, so the card looks like the thing it opens. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 bottom-20 w-[min(75%,19rem)] space-y-2 text-[13px] leading-snug text-gray-900 transition-transform duration-500 ease-out group-enabled:group-hover:-translate-x-3 md:bottom-24"
      >
        {PREVIEW_CHAT.map((b) => (
          <div
            key={b.text}
            className={cn(
              'max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-md shadow-black/10',
              b.who === 'patient' ? 'ml-auto rounded-br-md bg-[#d9fdd3]' : 'rounded-bl-md bg-white'
            )}
          >
            {b.text}
          </div>
        ))}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0b5e54] to-transparent"
      />
      <CardCopy
        eyebrow={
          <>
            <WhatsAppMark className="size-4" /> Replies in under a minute
          </>
        }
        title="Message on WhatsApp"
        body="Type or send a voice note. Send a photo of the problem. Urdu, English, or a mix."
        cta="Open WhatsApp"
        available={available}
        unavailable="Not connected yet. Use video for now."
      />
    </button>
  );
}

function VideoCard({ available, onPick }: { available: boolean; onPick: () => void }) {
  // The avatar reads this ref every frame; hovering the card makes the doctor wave.
  const drive = useRef<AvatarDrive>({ level: 0, mood: 'idle' });
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!available}
      onPointerEnter={() => (drive.current.waveAt = performance.now())}
      className={cn(
        cardClass,
        'bg-[radial-gradient(ellipse_at_50%_30%,#3a4746_0%,#1c2322_55%,#141a19_100%)]',
        !available && 'opacity-70 saturate-50'
      )}
    >
      {/* The doctor, head and shoulders, standing in the lower right of the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[70%] transition-transform duration-500 ease-out group-enabled:group-hover:scale-[1.03] md:w-[62%]"
      >
        <div className="absolute top-[18%] left-1/2 aspect-square w-[80%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(122_158_150/0.45),transparent)]" />
        <AvatarStage
          drive={drive}
          framing="call"
          className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[70%] bg-gradient-to-r from-[#1c2322] via-[#1c2322]/80 to-transparent md:w-[60%]"
      />
      <CardCopy
        eyebrow={
          <>
            <span className="relative flex size-2">
              <span className="bg-wa absolute inset-0 animate-ping rounded-full opacity-60" />
              <span className="bg-wa relative size-2 rounded-full" />
            </span>
            Doctor available now
          </>
        }
        title="Video consult"
        body="Face to face in your browser. Hold up a rash, a report or a medicine, and the doctor looks with you."
        cta="Start the video consult"
        available={available}
        unavailable="Not available right now."
      />
    </button>
  );
}
