'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Pencil, Plus, Siren, Sparkles, Trash2, Video } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AnimatedText, EASE_OUT, PageSkeleton } from '@/components/saathi/motion';
import { AppHeader, Chip, Segmented, inputClass } from '@/components/saathi/ui';
import { Wordmark } from '@/components/saathi/wordmark';
import { BODY_AREAS, RED_FLAGS, RELATION_LABELS, SINCE_LABELS, firstName } from '@/lib/brief';
import { cn } from '@/lib/cn';
import { peekPendingConcern, takePendingConcern } from '@/lib/pending-concern';
import {
  type Consult,
  type Intake,
  type Profile,
  type Since,
  actions,
  emptyIntake,
  useHydrated,
  useSaathi,
} from '@/lib/saathi-store';
import { ProfileForm } from './profile-form';

const card = 'rounded-2xl border border-gray-200 bg-white';

function rise(delay = 0) {
  return {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease: EASE_OUT, delay },
  };
}

export function Dashboard() {
  const hydrated = useHydrated();
  const state = useSaathi();
  const [mode, setMode] = useState<'view' | 'add' | 'edit'>('view');
  const [carried, setCarried] = useState(false);
  const active = state.profiles.find((p) => p.id === state.activeId) ?? state.profiles[0];

  // Whatever was typed on the home page becomes today's concern once there is a profile.
  useEffect(() => {
    if (!hydrated || !active) return;
    if ((state.intakes[active.id]?.concern ?? '').trim()) return;
    const pending = takePendingConcern();
    if (pending) {
      actions.updateIntake(active.id, { concern: pending });
      setCarried(true);
    }
  }, [hydrated, active, state.intakes]);

  if (!hydrated) return <PageSkeleton />;

  if (!active || mode === 'add') {
    const pending = !active ? peekPendingConcern() : null;
    return (
      <Shell>
        <section className="mx-auto max-w-2xl px-6 py-12 md:py-20">
          <AnimatedText
            as="h1"
            text={
              active ? 'Who else do you look after?' : 'First, a few details doctor.ai should know.'
            }
            className="font-display tracking-display text-4xl leading-[1.05] text-gray-900 md:text-5xl"
          />
          <AnimatedText
            delay={0.4}
            stagger={0.03}
            text="doctor.ai reads this before every consult, so you don’t repeat it on the call. Only the name is required. Everything stays in this browser."
            className="mt-5 max-w-lg leading-relaxed text-gray-600"
          />
          {pending && (
            <motion.p
              {...rise(0.7)}
              className="bg-mist mt-6 flex gap-3 rounded-xl px-4 py-3 text-sm text-gray-700"
            >
              <Sparkles className="mt-0.5 size-4 shrink-0" />
              <span>
                We’ll add what you told doctor.ai, “{pending.slice(0, 80)}
                {pending.length > 80 ? '…' : ''}”, to your notes.
              </span>
            </motion.p>
          )}
          <motion.div {...rise(0.8)} className={cn(card, 'mt-10 p-5 shadow-sm sm:p-8')}>
            <ProfileForm
              submitLabel={active ? 'Add profile' : 'Save and continue'}
              onDone={() => setMode('view')}
              onCancel={active ? () => setMode('view') : undefined}
            />
          </motion.div>
        </section>
      </Shell>
    );
  }

  const intake = state.intakes[active.id] ?? emptyIntake();
  const consults = state.consults.filter((c) => c.profileId === active.id);

  return (
    <Shell
      switcher={
        <ProfileSwitcher
          profiles={state.profiles}
          activeId={active.id}
          onAdd={() => setMode('add')}
        />
      }
    >
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 md:px-12 md:py-14 lg:grid-cols-[1fr_360px] lg:gap-8">
        <IntakeCard key={active.id} profile={active} intake={intake} carried={carried} />
        <motion.aside {...rise(0.35)} className="flex flex-col gap-6">
          {mode === 'edit' ? (
            <div className={cn(card, 'p-5 sm:p-6')}>
              <h2 className="font-display tracking-display-sm mb-6 text-2xl text-gray-900">
                Edit {firstName(active.name)}
              </h2>
              <ProfileForm
                initial={active}
                submitLabel="Save changes"
                onDone={() => setMode('view')}
                onCancel={() => setMode('view')}
              />
            </div>
          ) : (
            <ProfileCard profile={active} onEdit={() => setMode('edit')} />
          )}
          <History consults={consults} />
        </motion.aside>
      </div>
    </Shell>
  );
}

function Shell({ children, switcher }: { children: React.ReactNode; switcher?: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-gradient-to-b from-white to-[#f3f5f4]">
      <AppHeader>
        <Wordmark />
        {switcher}
      </AppHeader>
      <main>{children}</main>
    </div>
  );
}

function ProfileSwitcher({
  profiles,
  activeId,
  onAdd,
}: {
  profiles: Profile[];
  activeId: string;
  onAdd: () => void;
}) {
  return (
    <nav
      aria-label="Profiles"
      className="-mr-2 flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-gray-100 p-1 pr-1"
    >
      {profiles.map((p) => {
        const on = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            aria-current={on ? 'true' : undefined}
            onClick={() => actions.setActive(p.id)}
            className={cn(
              'relative shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors',
              on ? 'text-white' : 'text-gray-600 hover:text-gray-900'
            )}
          >
            {on && (
              <motion.span
                layoutId="profile-pill"
                className="bg-brand absolute inset-0 rounded-full"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative">{firstName(p.name)}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        className="grid size-8 shrink-0 place-items-center rounded-full text-gray-500 transition-colors hover:bg-white hover:text-gray-900"
        aria-label="Add a family member"
        title="Add a family member"
      >
        <Plus className="size-4" />
      </button>
    </nav>
  );
}

/* ───────────────────────── Today's concern ───────────────────────── */

const SEVERITY_WORDS: Record<number, string> = {
  1: 'Barely there',
  3: 'Annoying',
  5: 'Hard to ignore',
  7: 'Stopping me from normal things',
  9: 'Worst I’ve felt',
};

function IntakeCard({
  profile,
  intake,
  carried,
}: {
  profile: Profile;
  intake: Intake;
  carried: boolean;
}) {
  const update = (patch: Partial<Intake>) => actions.updateIntake(profile.id, patch);
  const name = firstName(profile.name);
  const ready = intake.concern.trim().length >= 3;
  const emergency = intake.redFlags.length > 0;
  const severityWord =
    intake.severity &&
    SEVERITY_WORDS[
      Math.max(
        ...Object.keys(SEVERITY_WORDS)
          .map(Number)
          .filter((k) => k <= intake.severity!)
      )
    ];

  return (
    <section aria-labelledby="concern-title" className="flex flex-col gap-8">
      <div id="concern-title">
        <AnimatedText
          as="h1"
          text={
            profile.relation === 'self'
              ? `How are you feeling, ${name}?`
              : `How is ${name} feeling?`
          }
          className="font-display tracking-display text-4xl leading-[1.05] text-gray-900 md:text-6xl"
        />
        <AnimatedText
          delay={0.4}
          stagger={0.04}
          text="Describe it once here. doctor.ai reads it before it says hello."
          className="mt-4 text-gray-600"
        />
      </div>

      <motion.div {...rise(0.25)} className={cn(card, 'flex flex-col gap-9 p-5 shadow-sm sm:p-8')}>
        <div className="flex flex-col gap-2">
          <label htmlFor="concern" className="text-sm font-medium text-gray-900">
            What’s wrong, in your own words?
          </label>
          <textarea
            id="concern"
            rows={4}
            className={cn(inputClass, 'bg-gray-50 text-base')}
            value={intake.concern}
            onChange={(e) => update({ concern: e.target.value })}
            placeholder="An itchy red rash on my forearm. It started three days ago and is worse at night."
          />
          <p className="text-xs text-gray-500">
            {carried ? 'Added from what you typed on the home page. ' : ''}Saved as you type.
          </p>
        </div>

        <fieldset>
          <legend className="mb-3 text-sm font-medium text-gray-900">Where is it?</legend>
          <div className="flex flex-wrap gap-2">
            {BODY_AREAS.map((a) => (
              <Chip
                key={a}
                on={intake.areas.includes(a)}
                onClick={() =>
                  update({
                    areas: intake.areas.includes(a)
                      ? intake.areas.filter((x) => x !== a)
                      : [...intake.areas, a],
                  })
                }
              >
                {a}
              </Chip>
            ))}
          </div>
        </fieldset>

        <Segmented<Exclude<Since, ''>>
          label="When did it start?"
          value={intake.since || null}
          onChange={(v) => update({ since: v })}
          options={(Object.keys(SINCE_LABELS) as Exclude<Since, ''>[]).map((k) => ({
            value: k,
            label: SINCE_LABELS[k],
          }))}
        />

        <fieldset>
          <legend className="mb-3 flex w-full items-baseline justify-between gap-4 text-sm font-medium text-gray-900">
            How bad is it?
            <AnimatePresence mode="wait">
              <motion.span
                key={severityWord || 'none'}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="font-normal text-gray-500"
              >
                {severityWord || 'Pick a number'}
              </motion.span>
            </AnimatePresence>
          </legend>
          <div className="grid grid-cols-10 gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const on = intake.severity !== null && n <= intake.severity;
              return (
                <motion.button
                  key={n}
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  aria-label={`${n} out of 10`}
                  aria-pressed={intake.severity === n}
                  onClick={() => update({ severity: n })}
                  className={cn(
                    'h-11 rounded-lg border text-sm tabular-nums transition-colors',
                    on
                      ? n >= 8
                        ? 'border-danger bg-danger text-white'
                        : 'border-brand bg-brand text-white'
                      : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-400'
                  )}
                  style={on ? { transitionDelay: `${(n - 1) * 25}ms` } : undefined}
                >
                  {n}
                </motion.button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="border-danger/20 bg-danger-soft/50 rounded-2xl border p-4 sm:p-5">
          <legend className="sr-only">Emergency signs</legend>
          <p className="text-sm font-medium text-gray-900">Is any of this happening right now?</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {RED_FLAGS.map((f) => {
              const on = intake.redFlags.includes(f);
              return (
                <label
                  key={f}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                    on ? 'bg-danger text-white' : 'bg-white/80 text-gray-800 hover:bg-white'
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-danger mt-0.5 size-4 shrink-0"
                    checked={on}
                    onChange={() =>
                      update({
                        redFlags: on
                          ? intake.redFlags.filter((x) => x !== f)
                          : [...intake.redFlags, f],
                      })
                    }
                  />
                  {f}
                </label>
              );
            })}
          </div>
        </fieldset>

        <AnimatePresence>
          {emergency && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-danger flex gap-4 rounded-2xl p-5 text-white">
                <Siren className="mt-0.5 size-6 shrink-0" />
                <div>
                  <p className="text-lg font-semibold">Get emergency care now.</p>
                  <p className="mt-1 leading-relaxed text-white/90">
                    Call your local emergency number or go to the nearest emergency department.
                    Don’t wait for a consult with doctor.ai.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            {ready
              ? 'doctor.ai will read these notes before it says hello.'
              : 'Describe the problem to continue.'}
          </p>
          <Link
            href="/consult"
            aria-disabled={!ready}
            tabIndex={ready ? undefined : -1}
            onClick={(e) => !ready && e.preventDefault()}
            className={cn(
              'group inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 font-medium transition-[transform,background-color,opacity]',
              !ready && 'pointer-events-none opacity-40',
              emergency
                ? 'border border-gray-200 bg-white text-gray-900'
                : 'bg-brand hover:bg-brand-2 text-white hover:-translate-y-0.5'
            )}
          >
            {emergency ? 'Continue to doctor.ai anyway' : 'Continue to consult'}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

/* ───────────────────────── Profile card ───────────────────────── */

function ProfileCard({ profile, onEdit }: { profile: Profile; onEdit: () => void }) {
  const meta = [
    RELATION_LABELS[profile.relation],
    profile.age && `${profile.age} yrs`,
    profile.sex && profile.sex[0].toUpperCase() + profile.sex.slice(1),
  ].filter(Boolean);
  const rows = [
    { label: 'Conditions', value: profile.conditions },
    { label: 'Medicines', value: profile.medications },
    { label: 'Allergies', value: profile.allergies },
  ];

  return (
    <div className={cn(card, 'overflow-hidden shadow-sm')}>
      <div className="bg-brand relative overflow-hidden p-6 text-white">
        <div
          aria-hidden
          className="absolute -top-16 -right-16 size-48 rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.12),transparent_65%)]"
        />
        <p className="relative text-sm text-gray-300">Health profile</p>
        <p className="font-display tracking-display-sm relative mt-2 text-3xl leading-none">
          {profile.name}
        </p>
        <p className="relative mt-2 text-sm text-gray-300">{meta.join(' · ')}</p>
        {profile.phone && (
          <p className="relative mt-4 text-sm text-white tabular-nums">{profile.phone}</p>
        )}
      </div>
      <dl className="divide-y divide-gray-100">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[96px_1fr] gap-3 px-6 py-4 text-sm">
            <dt className="text-gray-500">{r.label}</dt>
            <dd className={r.value.trim() ? 'text-gray-900' : 'text-gray-400'}>
              {r.value.trim() || 'None added'}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
        >
          <Pencil className="size-3.5" /> Edit profile
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete ${profile.name}'s profile? This can’t be undone.`)) {
              actions.removeProfile(profile.id);
            }
          }}
          className="hover:bg-danger-soft hover:text-danger inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500"
        >
          <Trash2 className="size-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── History ───────────────────────── */

const CHANNEL_LABEL: Record<Consult['channel'], string> = {
  'whatsapp-chat': 'WhatsApp notes',
  'whatsapp-call': 'WhatsApp call',
  video: 'Video consult',
};

function History({ consults }: { consults: Consult[] }) {
  return (
    <div className={cn(card, 'p-6 shadow-sm')}>
      <h2 className="font-display tracking-display-sm text-xl text-gray-900">Past consults</h2>
      {consults.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-gray-500">
          None yet. Each time you hand off to doctor.ai, it’s listed here with its token number.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {consults.slice(0, 8).map((c, i) => (
            <motion.li
              key={c.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.05 }}
              className="rounded-xl bg-gray-50 p-4"
            >
              <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5">
                  {c.channel === 'video' ? (
                    <Video className="size-3.5" />
                  ) : (
                    <span className="bg-wa size-1.5 rounded-full" />
                  )}
                  {CHANNEL_LABEL[c.channel]}
                </span>
                <time dateTime={new Date(c.at).toISOString()}>
                  {new Date(c.at).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-gray-900">{c.concern}</p>
              <p className="mt-2 text-xs text-gray-400 tabular-nums">{c.ref}</p>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
