'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Lock, MessageCircle, Pencil, Video } from 'lucide-react';
import { motion } from 'motion/react';
import { EASE_OUT, PageSkeleton } from '@/components/saathi/motion';
import { Field, inputClass } from '@/components/saathi/ui';
import { Wordmark } from '@/components/saathi/wordmark';
import { waChatLink, whatsappIntro } from '@/lib/brief';
import { cn } from '@/lib/cn';
import { type Profile, actions, useHydrated, useSaathi } from '@/lib/saathi-store';

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
 * asked here; the doctor asks on the call.
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
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [background, setBackground] = useState(profile?.conditions ?? '');
  const [touched, setTouched] = useState(false);
  const [channel, setChannel] = useState<Channel>(() =>
    next === 'video' || !whatsappNumber ? 'video' : 'whatsapp'
  );

  const showForm = !profile || editing;
  const nameOk = name.trim().length >= 2;
  const phoneOk = phone.replace(/\D/g, '').length >= 10;
  const valid = nameOk && phoneOk;
  const channelReady = channel === 'video' ? videoReady : !!whatsappNumber;

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

  const go = () => {
    setTouched(true);
    if (!valid || !channelReady) return;
    const saved = save();
    setEditing(false);
    if (channel === 'video') {
      router.push('/consult/video');
      return;
    }
    actions.logConsult(saved.id, 'whatsapp-chat');
    window.open(waChatLink(whatsappNumber!, whatsappIntro(saved)), '_blank', 'noopener');
  };

  return (
    <div className="min-h-svh bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 md:px-10">
        <Wordmark />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="size-4" /> Home
        </Link>
      </header>

      <main className="mx-auto grid max-w-6xl gap-12 px-6 pt-4 pb-20 md:px-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:pt-8">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <motion.h1
            {...rise(0)}
            className="font-display tracking-display text-4xl leading-[1.05] text-gray-900 md:text-5xl"
          >
            {profile && !editing
              ? `Salam, ${profile.name.split(' ')[0]}.`
              : 'Tell the doctor who you are.'}
          </motion.h1>
          <motion.p {...rise(0.08)} className="mt-3 max-w-lg leading-relaxed text-gray-600">
            {profile && !editing
              ? 'Your details are saved on this phone. Choose how you want to talk today.'
              : 'Three details, once. doctor.ai reads them before it says hello, so you never repeat yourself.'}
          </motion.p>

          {showForm ? (
            <motion.div {...rise(0.16)} className="mt-8 grid gap-5 sm:grid-cols-2">
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
                  Add your name and a WhatsApp number with country code.
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div
              {...rise(0.16)}
              className="mt-8 flex items-start justify-between gap-4 rounded-xl border border-gray-200 px-5 py-4"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium text-gray-900">{profile.name}</p>
                <p className="mt-0.5 text-gray-500 tabular-nums">{profile.phone}</p>
                <p className="mt-2 text-gray-600">
                  {profile.conditions.trim() || 'No health background added.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex shrink-0 items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                <Pencil className="size-3.5" /> Edit
              </button>
            </motion.div>
          )}

          <motion.fieldset {...rise(0.24)} className="mt-10">
            <legend className="font-display tracking-display-sm text-2xl text-gray-900">
              How do you want to talk?
            </legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ChannelOption
                selected={channel === 'whatsapp'}
                onSelect={() => setChannel('whatsapp')}
                available={!!whatsappNumber}
                icon={<MessageCircle className="size-5" />}
                title="WhatsApp"
                body="Message now. Send photos and voice notes. Replies in under a minute."
                unavailable="Not connected yet. Use video for now."
              />
              <ChannelOption
                selected={channel === 'video'}
                onSelect={() => setChannel('video')}
                available={videoReady}
                icon={<Video className="size-5" />}
                title="Video consult"
                body="Talk face to face in your browser. Show the doctor the problem."
                unavailable="Not available right now."
              />
            </div>
          </motion.fieldset>

          <motion.div
            {...rise(0.32)}
            className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center"
          >
            <button
              type="submit"
              disabled={!channelReady}
              className={cn(
                'inline-flex items-center justify-center gap-2.5 rounded-full px-7 py-4 text-base font-semibold whitespace-nowrap text-white transition-[transform,background-color] enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40',
                channel === 'whatsapp'
                  ? 'bg-[#128c7e] hover:bg-[#0f7a6e]'
                  : 'bg-brand hover:bg-brand-2'
              )}
            >
              {channel === 'whatsapp' ? 'Open WhatsApp' : 'Start the video consult'}
              <ArrowRight className="size-4" />
            </button>
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Lock className="size-3.5" /> Stays on this phone. Nothing is stored on our servers.
            </p>
          </motion.div>
        </form>

        <motion.aside
          {...rise(0.2)}
          className="bg-brand h-fit rounded-2xl p-7 text-white lg:sticky lg:top-8 lg:p-8"
        >
          <p className="text-[13px] font-medium tracking-[0.14em] text-white/55 uppercase">
            What happens next
          </p>
          <ol className="mt-5 flex flex-col gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="font-display grid size-8 shrink-0 place-items-center rounded-full border border-white/20 text-sm">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-300">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <ul className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-6 text-sm text-gray-300">
            {PROMISES.map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <Check className="size-4 text-[#25d366]" /> {p}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs leading-relaxed text-white/50">
            doctor.ai is an AI, not a doctor who can examine you. In an emergency, call 1122 now.
          </p>
        </motion.aside>
      </main>
    </div>
  );
}

const STEPS = [
  {
    title: 'The doctor reads your details',
    body: 'Your name and health background go with you, so the first question is about today.',
  },
  {
    title: 'You describe the problem',
    body: 'Type, talk, or send a photo. Urdu, English, Punjabi, or a mix.',
  },
  {
    title: 'You leave with a next step',
    body: 'What it might be, what to do at home, and when to see a doctor in person.',
  },
];

const PROMISES = [
  'Free to try',
  'Available day and night',
  'Says clearly when you need a real doctor',
];

function ChannelOption({
  selected,
  onSelect,
  available,
  icon,
  title,
  body,
  unavailable,
}: {
  selected: boolean;
  onSelect: () => void;
  available: boolean;
  icon: React.ReactNode;
  title: string;
  body: string;
  unavailable: string;
}) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer gap-4 rounded-xl border p-4 transition-[border-color,box-shadow]',
        selected
          ? 'border-gray-900 shadow-[0_0_0_1px_#111]'
          : 'border-gray-200 hover:border-gray-400',
        !available && 'cursor-default opacity-60'
      )}
    >
      <input
        type="radio"
        name="channel"
        className="sr-only"
        checked={selected}
        onChange={onSelect}
      />
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-lg',
          selected ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700'
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-gray-900">{title}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-gray-500">
          {available ? body : unavailable}
        </span>
      </span>
      {selected && <Check className="absolute top-4 right-4 size-4 text-gray-900" aria-hidden />}
    </label>
  );
}
