'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, MessageCircle, Phone, Siren, Video } from 'lucide-react';
import { motion } from 'motion/react';
import { AnimatedText, EASE_OUT, PageSkeleton } from '@/components/saathi/motion';
import { AppHeader } from '@/components/saathi/ui';
import { Wordmark } from '@/components/saathi/wordmark';
import { buildBrief, firstName, waCallLink, waChatLink } from '@/lib/brief';
import { actions, useHydrated, useSaathi } from '@/lib/saathi-store';
import { QR } from './qr';
import { TokenCard } from './token-card';

// Long notes make a QR code too dense for some phone cameras; past this, the code carries the
// token only and the patient pastes the rest.
const QR_MAX_LENGTH = 900;

function rise(delay = 0) {
  return {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease: EASE_OUT, delay },
  };
}

export function Handoff({
  whatsappNumber,
  videoReady,
  isDev,
}: {
  whatsappNumber: string | null;
  videoReady: boolean;
  isDev: boolean;
}) {
  const hydrated = useHydrated();
  const state = useSaathi();
  const router = useRouter();
  const profile = state.profiles.find((p) => p.id === state.activeId) ?? state.profiles[0];
  const intake = profile ? state.intakes[profile.id] : undefined;
  const hasNotes = !!intake && intake.concern.trim().length >= 3;

  useEffect(() => {
    if (profile && hasNotes) actions.ensureRef(profile.id);
  }, [profile, hasNotes]);

  if (!hydrated) return <PageSkeleton />;

  if (!profile || !intake || !hasNotes) {
    return (
      <Frame>
        <div className="mx-auto max-w-lg px-6 py-24 text-center">
          <AnimatedText
            as="h1"
            text="Start with your notes."
            className="font-display tracking-display text-4xl leading-tight text-gray-900 md:text-5xl"
          />
          <AnimatedText
            delay={0.3}
            stagger={0.04}
            text="Saathi needs to know who the consult is for and what’s wrong before you call."
            className="mt-4 leading-relaxed text-gray-600"
          />
          <motion.div {...rise(0.7)}>
            <Link
              href="/dashboard"
              className="bg-brand mt-8 inline-flex items-center gap-2 rounded-lg px-6 py-3.5 font-medium text-white"
            >
              Go to my dashboard <ArrowRight className="size-4" />
            </Link>
          </motion.div>
        </div>
      </Frame>
    );
  }

  const brief = buildBrief(profile, intake);
  const emergency = intake.redFlags.length > 0;
  const chatHref = whatsappNumber ? waChatLink(whatsappNumber, brief) : null;
  const callHref = whatsappNumber ? waCallLink(whatsappNumber) : null;
  const qrValue =
    whatsappNumber &&
    (chatHref!.length <= QR_MAX_LENGTH
      ? chatHref!
      : waChatLink(whatsappNumber, `Saathi consult ${intake.ref}`));

  return (
    <Frame>
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-12 md:py-14">
        {emergency && (
          <motion.div
            {...rise(0)}
            role="alert"
            className="bg-danger mb-8 flex gap-4 rounded-2xl p-5 text-white"
          >
            <Siren className="mt-0.5 size-6 shrink-0" />
            <p className="leading-relaxed">
              <strong className="font-semibold">You marked an emergency sign.</strong> Call your
              local emergency number or go to the nearest emergency department now. Saathi can’t
              treat an emergency over a call.
            </p>
          </motion.div>
        )}

        <div className="grid items-start gap-10 lg:grid-cols-[1fr_minmax(0,420px)] lg:gap-16">
          <div>
            <AnimatedText
              as="h1"
              text={
                profile.relation === 'self'
                  ? `You’re ready, ${firstName(profile.name)}.`
                  : `${firstName(profile.name)}’s notes are ready.`
              }
              className="font-display tracking-display text-4xl leading-[1.05] text-gray-900 md:text-6xl"
            />

            {whatsappNumber ? (
              <>
                <AnimatedText
                  delay={0.35}
                  stagger={0.03}
                  text="Send the notes first so Saathi has read them when it picks up, then start the call. Keep your token handy in case Saathi asks for it."
                  className="mt-5 max-w-xl leading-relaxed text-gray-600"
                />

                <ol className="mt-10 flex flex-col gap-3">
                  <Step
                    n={1}
                    delay={0.5}
                    title="Send your notes"
                    body="Opens a WhatsApp chat with Saathi with your notes already typed. Press send."
                  >
                    <a
                      href={chatHref!}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => actions.logConsult(profile.id, 'whatsapp-chat')}
                      className="border-wa-ink/70 text-wa-ink hover:bg-wa/10 inline-flex items-center gap-2 rounded-lg border px-5 py-3 font-medium transition-colors"
                    >
                      <MessageCircle className="size-4" /> Open chat with notes
                    </a>
                  </Step>
                  <Step
                    n={2}
                    delay={0.62}
                    title="Call Saathi"
                    body="Starts a WhatsApp voice call. On a computer, scan the code below with your phone instead."
                  >
                    <a
                      href={callHref!}
                      onClick={() => actions.logConsult(profile.id, 'whatsapp-call')}
                      className="bg-wa inline-flex items-center gap-2 rounded-lg px-6 py-3.5 font-semibold text-[#06301a] transition-transform hover:-translate-y-0.5"
                    >
                      <Phone className="size-4 fill-current" /> Call Saathi on WhatsApp
                    </a>
                  </Step>
                </ol>

                <motion.div
                  {...rise(0.75)}
                  className="mt-4 hidden items-center gap-6 rounded-2xl border border-gray-200 bg-white p-6 md:flex"
                >
                  <QR
                    value={qrValue!}
                    label="QR code that opens a WhatsApp chat with Saathi"
                    className="size-44 shrink-0 [&_svg]:size-full [&_svg]:[shape-rendering:crispEdges]"
                  />
                  <div>
                    <p className="font-display tracking-display-sm text-xl text-gray-900">
                      On a computer? Use your phone.
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                      Point your phone camera at the code. WhatsApp opens with your notes typed in.
                      Send them, then tap the call icon at the top of the chat.
                    </p>
                    <p className="mt-3 text-xs text-gray-500 tabular-nums">
                      Saathi’s number: +{whatsappNumber.replace(/\D/g, '')}
                    </p>
                  </div>
                </motion.div>
              </>
            ) : (
              <motion.div
                {...rise(0.4)}
                className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white p-6"
              >
                <p className="font-medium text-gray-900">
                  Saathi’s WhatsApp line isn’t connected yet.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  You can still talk to Saathi now in a video consult in your browser.
                </p>
                {isDev && (
                  <p className="mt-3 text-xs text-gray-500">
                    Set SAATHI_WHATSAPP_NUMBER in .env.local to the business number that routes to
                    the agent.
                  </p>
                )}
              </motion.div>
            )}

            <motion.div
              {...rise(0.85)}
              className="bg-brand mt-6 flex flex-col gap-5 rounded-2xl p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-7"
            >
              <div className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10">
                  <Video className="size-5" />
                </span>
                <div>
                  <p className="font-display tracking-display-sm text-xl">
                    Saathi needs to see it?
                  </p>
                  <p className="mt-1 max-w-sm text-sm leading-relaxed text-gray-300">
                    WhatsApp calls are voice only. Start a video consult here and hold the problem
                    up to your camera.
                  </p>
                </div>
              </div>
              {videoReady ? (
                <Link
                  href="/consult/video"
                  className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 font-medium text-gray-900 transition-transform hover:-translate-y-0.5"
                >
                  Start video consult
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ) : (
                <p className="max-w-[16rem] text-sm text-gray-300">
                  Video consults aren’t available right now.
                  {isDev && ' Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.'}
                </p>
              )}
            </motion.div>

            <motion.div {...rise(1)} className="mt-10 border-t border-gray-100 pt-6">
              <button
                type="button"
                onClick={() => {
                  actions.closeIntake(profile.id);
                  router.push('/dashboard');
                }}
                className="text-sm text-gray-500 underline-offset-4 hover:text-gray-900 hover:underline"
              >
                Finished with this consult? Clear the notes and go back
              </button>
            </motion.div>
          </div>

          <motion.div {...rise(0.3)} className="lg:sticky lg:top-24">
            <TokenCard profile={profile} intake={intake} />
            <details className="group mt-4 rounded-xl border border-gray-200 bg-white px-5 py-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-gray-900">
                <span className="mr-2 inline-block transition-transform group-open:rotate-90">
                  ›
                </span>
                See exactly what Saathi receives
              </summary>
              <pre className="mt-4 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-gray-600">
                {brief}
              </pre>
            </details>
          </motion.div>
        </div>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-gradient-to-b from-white to-[#f3f5f4]">
      <AppHeader>
        <Wordmark />
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="size-4" /> Dashboard
        </Link>
      </AppHeader>
      <main>{children}</main>
    </div>
  );
}

function Step({
  n,
  title,
  body,
  delay,
  children,
}: {
  n: number;
  title: string;
  body: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <motion.li
      {...rise(delay)}
      className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-lg hover:shadow-gray-900/5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex gap-4">
        <span className="font-display bg-brand grid size-9 shrink-0 place-items-center rounded-full text-lg text-white">
          {n}
        </span>
        <div>
          <p className="font-display tracking-display-sm text-xl text-gray-900">{title}</p>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-gray-600">{body}</p>
        </div>
      </div>
      <div className="shrink-0 pl-13 sm:pl-0">{children}</div>
    </motion.li>
  );
}
