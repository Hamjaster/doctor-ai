'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LocalVideoTrack, TokenSource, Track } from 'livekit-client';
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  PhoneOff,
  SendHorizontal,
  SwitchCamera,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  RoomAudioRenderer,
  SessionProvider,
  StartAudio,
  VideoTrack,
  useAgent,
  useSession,
  useSessionContext,
  useSessionMessages,
  useTrackToggle,
  useTrackVolume,
} from '@livekit/components-react';
import { AnimatedText, EASE_OUT, PageSkeleton } from '@/components/saathi/motion';
import type { AvatarDrive, AvatarMood } from '@/components/saathi/three/types';
import { Wordmark } from '@/components/saathi/wordmark';
import { buildBrief, firstName } from '@/lib/brief';
import { cn } from '@/lib/cn';
import { type Intake, type Profile, actions, useHydrated, useSaathi } from '@/lib/saathi-store';

const AvatarStage = dynamic(() => import('@/components/saathi/three/avatar-stage'), {
  ssr: false,
  loading: () => null,
});

export function VideoConsult({ agentName }: { agentName?: string }) {
  const hydrated = useHydrated();
  const state = useSaathi();
  const profile = state.profiles.find((p) => p.id === state.activeId) ?? state.profiles[0];
  const intake = profile ? state.intakes[profile.id] : undefined;

  if (!hydrated) return <PageSkeleton />;

  if (!profile || !intake || intake.concern.trim().length < 3) {
    return (
      <div className="grid min-h-svh place-items-center bg-white px-6 text-center">
        <div>
          <AnimatedText
            as="h1"
            text="Start with your notes."
            className="font-display tracking-display text-4xl text-gray-900 md:text-5xl"
          />
          <p className="mt-3 text-gray-600">Saathi reads them before the video consult begins.</p>
          <Link
            href="/dashboard"
            className="bg-brand mt-8 inline-flex rounded-lg px-6 py-3.5 font-medium text-white"
          >
            Go to my dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <ConsultSession profile={profile} intake={intake} agentName={agentName} />;
}

function ConsultSession({
  profile,
  intake,
  agentName,
}: {
  profile: Profile;
  intake: Intake;
  agentName?: string;
}) {
  const tokenSource = useMemo(() => TokenSource.endpoint('/api/token'), []);
  // Freeze the brief at mount so typing elsewhere can't change it mid-call.
  const [brief] = useState(() => buildBrief(profile, intake));
  const session = useSession(tokenSource, {
    agentName,
    participantName: profile.name,
    participantAttributes: { 'saathi.brief': brief, 'saathi.ref': intake.ref },
    agentConnectTimeoutMilliseconds: 25_000,
  });

  return (
    <SessionProvider session={session}>
      <Stage profile={profile} intake={intake} />
      <RoomAudioRenderer />
    </SessionProvider>
  );
}

type Phase = 'ready' | 'live' | 'ended';

function Stage({ profile, intake }: { profile: Profile; intake: Intake }) {
  const session = useSessionContext();
  const agent = useAgent();
  const [phase, setPhase] = useState<Phase>('ready');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      actions.ensureRef(profile.id);
      await session.start({
        tracks: { microphone: { enabled: true }, camera: { enabled: true } },
      });
      actions.logConsult(profile.id, 'video');
      setPhase('live');
    } catch (e) {
      setError(
        e instanceof Error && /permission|denied|notallowed/i.test(e.message + e.name)
          ? 'Saathi needs your camera and microphone. Allow them in your browser settings, then try again.'
          : 'The consult could not start. Check your connection and try again.'
      );
    } finally {
      setStarting(false);
    }
  };

  const end = async () => {
    await session.end();
    setPhase('ended');
  };

  // Agent never joined, or dropped: end the call and say so.
  useEffect(() => {
    if (phase === 'live' && agent.state === 'failed') {
      setError(
        'Saathi couldn’t join the call. Try again in a minute.' +
          (process.env.NODE_ENV !== 'production'
            ? ` (${agent.failureReasons?.join('; ') || 'agent did not connect'}. Is the agent worker running? cd agent && uv run agent.py dev)`
            : '')
      );
      session.end();
      setPhase('ready');
    }
  }, [phase, agent.state, agent.failureReasons, session]);

  if (phase === 'ended') return <Ended profile={profile} intake={intake} />;
  if (phase === 'ready' || !session.isConnected) {
    return (
      <Lobby
        profile={profile}
        intake={intake}
        starting={starting || phase === 'live'}
        error={error}
        onStart={start}
      />
    );
  }
  return <Live profile={profile} onEnd={end} />;
}

/* ───────────────────────── Lobby ───────────────────────── */

function Lobby({
  profile,
  intake,
  starting,
  error,
  onStart,
}: {
  profile: Profile;
  intake: Intake;
  starting: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const drive = useRef<AvatarDrive>({ level: 0, mood: 'idle', synthetic: true });
  return (
    <div className="min-h-svh bg-gradient-to-b from-white to-[#e6ebe9]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 md:px-12">
        <Wordmark />
        <Link
          href="/consult"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>
      </header>
      <main className="mx-auto grid max-w-6xl items-center gap-6 px-6 pb-16 md:px-12 lg:grid-cols-[1fr_0.9fr]">
        <div className="order-2 lg:order-1">
          <AnimatedText
            as="h1"
            text="Saathi will see what your camera sees."
            className="font-display tracking-display text-4xl leading-[1.05] text-gray-900 md:text-6xl"
          />
          <ul className="mt-8 flex flex-col gap-3 text-gray-700">
            {[
              'Sit near a window or a bright light. Daylight shows colour best.',
              'Keep any medicines or reports you want to ask about within reach.',
              `Saathi has read ${
                profile.relation === 'self' ? 'your' : `${firstName(profile.name)}’s`
              } notes, so you can start with what’s changed.`,
            ].map((t, i) => (
              <motion.li
                key={t}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.5 + i * 0.1 }}
                className="flex gap-3"
              >
                <span className="bg-brand mt-2 size-1.5 shrink-0 rounded-full" />
                {t}
              </motion.li>
            ))}
          </ul>
          {error && (
            <p
              role="alert"
              className="bg-danger mt-8 rounded-xl px-5 py-4 text-sm leading-relaxed text-white"
            >
              {error}
            </p>
          )}
          <motion.button
            type="button"
            onClick={onStart}
            disabled={starting}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.9 }}
            className="bg-brand hover:bg-brand-2 mt-10 inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-4 text-lg font-medium text-white transition-colors disabled:opacity-70 sm:w-auto"
          >
            <Camera className="size-5" />
            {starting ? 'Connecting…' : 'Start video consult'}
          </motion.button>
          <p className="mt-5 text-xs leading-relaxed text-gray-500">
            Token {intake.ref}. Your browser will ask for camera and microphone access. Saathi is an
            AI, not a doctor who can examine you.
          </p>
        </div>
        <div className="relative order-1 h-[38svh] min-h-[260px] lg:order-2 lg:h-[min(70vh,640px)]">
          <AvatarStage
            drive={drive}
            framing="call"
            onPoke={() => (drive.current.waveAt = performance.now())}
            className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_75%,transparent)]"
          />
        </div>
      </main>
    </div>
  );
}

/* ───────────────────────── Live ───────────────────────── */

const STATE_LABEL: Record<string, string> = {
  connecting: 'Saathi is joining',
  initializing: 'Saathi is joining',
  'pre-connect-buffering': 'Saathi is joining',
  idle: 'Saathi is joining',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  disconnected: 'Call ended',
  failed: 'Saathi couldn’t join',
};

function Live({ profile, onEnd }: { profile: Profile; onEnd: () => void }) {
  const session = useSessionContext();
  const cameraRef = session.local.cameraTrack;
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const cameraOn = cam.enabled && !!cameraRef && !cameraRef.publication?.isMuted;

  const flip = async () => {
    const track = cameraRef?.publication?.track;
    if (!(track instanceof LocalVideoTrack)) return;
    const next = facing === 'user' ? 'environment' : 'user';
    try {
      await track.restartTrack({ facingMode: next });
      setFacing(next);
    } catch {
      // Devices with one camera reject the switch; nothing to do.
    }
  };

  return (
    <div className="bg-brand flex h-svh flex-col text-white lg:grid lg:grid-cols-[1fr_400px]">
      {/* What Saathi sees */}
      <section aria-label="Your camera" className="relative min-h-0 flex-1 p-3 sm:p-4">
        <div className="relative h-full overflow-hidden rounded-2xl bg-[#1f2726]">
          {cameraOn && cameraRef ? (
            <VideoTrack
              trackRef={cameraRef}
              className={cn('h-full w-full object-cover', facing === 'user' && '-scale-x-100')}
            />
          ) : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <CameraOff className="mx-auto size-8 text-white/50" />
                <p className="mt-4 text-white/75">Your camera is off.</p>
                <p className="mt-1 text-sm text-white/50">Turn it on to show Saathi the problem.</p>
              </div>
            </div>
          )}
          <Viewfinder />
          <p className="absolute top-4 left-4 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium backdrop-blur">
            What Saathi sees
          </p>
        </div>
      </section>

      {/* Saathi + transcript */}
      <aside className="flex max-h-[44svh] min-h-0 flex-col border-t border-white/10 lg:max-h-none lg:border-t-0 lg:border-l">
        <Presence />
        <Transcript patientName={firstName(profile.name)} />
      </aside>

      {/* Controls */}
      <div className="bg-brand flex items-center justify-center gap-3 border-t border-white/10 px-4 py-4 lg:col-span-2">
        <ControlButton
          label={mic.enabled ? 'Mute microphone' : 'Unmute microphone'}
          active={mic.enabled}
          pending={mic.pending}
          onClick={() => mic.toggle()}
        >
          {mic.enabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </ControlButton>
        <ControlButton
          label={cam.enabled ? 'Turn camera off' : 'Turn camera on'}
          active={cam.enabled}
          pending={cam.pending}
          onClick={() => cam.toggle()}
        >
          {cam.enabled ? <Camera className="size-5" /> : <CameraOff className="size-5" />}
        </ControlButton>
        <ControlButton label="Switch camera" active onClick={flip} disabled={!cameraOn}>
          <SwitchCamera className="size-5" />
        </ControlButton>
        <button
          type="button"
          onClick={onEnd}
          className="bg-danger ml-2 inline-flex h-12 items-center gap-2 rounded-lg px-6 font-medium text-white transition-transform hover:-translate-y-0.5"
        >
          <PhoneOff className="size-5" /> End
        </button>
      </div>

      <StartAudio
        label="Tap to hear Saathi"
        className="fixed inset-x-0 bottom-24 mx-auto w-fit rounded-lg bg-white px-5 py-3 font-medium text-gray-900 shadow-xl"
      />
    </div>
  );
}

function ControlButton({
  label,
  active,
  pending,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  pending?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled || pending}
      className={cn(
        'grid size-12 place-items-center rounded-full transition-colors disabled:opacity-40',
        active ? 'bg-white/10 hover:bg-white/20' : 'bg-white text-gray-900 hover:bg-gray-100'
      )}
    >
      {children}
    </button>
  );
}

/** Corner brackets: the frame is the exam light, not decoration. */
function Viewfinder() {
  const corner = 'absolute size-10 border-white/60';
  return (
    <div aria-hidden className="pointer-events-none absolute inset-6 sm:inset-10">
      <span className={cn(corner, 'top-0 left-0 rounded-tl-2xl border-t-2 border-l-2')} />
      <span className={cn(corner, 'top-0 right-0 rounded-tr-2xl border-t-2 border-r-2')} />
      <span className={cn(corner, 'bottom-0 left-0 rounded-bl-2xl border-b-2 border-l-2')} />
      <span className={cn(corner, 'right-0 bottom-0 rounded-br-2xl border-r-2 border-b-2')} />
    </div>
  );
}

const AGENT_MOOD: Record<string, AvatarMood> = {
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
};

/** Saathi's face for the call: the rigged avatar, driven by the agent's state and voice. */
function Presence() {
  const agent = useAgent();
  const volume = useTrackVolume(agent.microphoneTrack);
  const drive = useRef<AvatarDrive>({ level: 0, mood: 'idle' });
  const label = STATE_LABEL[agent.state] ?? agent.state;
  const joining = !agent.isConnected;

  useEffect(() => {
    drive.current.mood = AGENT_MOOD[agent.state] ?? 'idle';
  }, [agent.state]);
  useEffect(() => {
    drive.current.level = volume;
  }, [volume]);
  // Wave hello once Saathi has joined.
  useEffect(() => {
    if (!joining) drive.current.waveAt = performance.now();
  }, [joining]);

  return (
    <div className="flex items-center gap-4 border-b border-white/10 p-3 lg:flex-col lg:items-stretch lg:p-6">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-white/10 to-white/0 lg:h-64 lg:w-full">
        <AvatarStage drive={drive} framing="call" className="absolute inset-0" />
      </div>
      <div className="flex items-center justify-between gap-3 lg:mt-1">
        <div>
          <p className="font-display tracking-display-sm text-2xl leading-none">Saathi</p>
          <p className={cn('mt-1.5 text-sm text-white/65', joining && 'animate-pulse')}>{label}</p>
        </div>
      </div>
    </div>
  );
}

// Saathi posts its sources as Markdown links in the chat. Render those, and bare
// http(s) URLs, as links; everything else stays plain text.
const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)/g;

function AgentText({ text }: { text: string }) {
  const plain = text.replace(/\*\*(.+?)\*\*/g, '$1');
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of plain.matchAll(LINK_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(plain.slice(last, index));
    const href = match[2] ?? match[3];
    parts.push(
      <a
        key={index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-white/40 underline-offset-2 hover:decoration-white"
      >
        {match[1] ?? href}
      </a>
    );
    last = index + match[0].length;
  }
  if (last < plain.length) parts.push(plain.slice(last));
  return <span className="whitespace-pre-line text-white">{parts}</span>;
}

function Transcript({ patientName }: { patientName: string }) {
  const session = useSessionContext();
  const { messages, send, isSending } = useSessionMessages(session);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-6" aria-live="polite">
        {messages.length === 0 ? (
          <p className="text-sm leading-relaxed text-white/50">
            Captions appear here as you and Saathi talk.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {messages.map((m) => {
                const mine = m.from?.isLocal === true;
                return (
                  <motion.li
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[15px] leading-relaxed"
                  >
                    <span
                      className={cn(
                        'mb-0.5 block text-xs font-medium',
                        mine ? 'text-white/45' : 'text-white'
                      )}
                    >
                      {mine ? patientName : 'Saathi'}
                    </span>
                    {mine ? (
                      <span className="text-white/70">{m.message}</span>
                    ) : (
                      <AgentText text={m.message} />
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-center gap-2 border-t border-white/10 p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setDraft('');
          await send(text);
        }}
      >
        <label htmlFor="typed-message" className="sr-only">
          Type a message to Saathi
        </label>
        <input
          id="typed-message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type instead of speaking"
          className="h-11 min-w-0 flex-1 rounded-lg bg-white/[0.07] px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!draft.trim() || isSending}
          className="grid size-11 shrink-0 place-items-center rounded-lg bg-white text-gray-900 disabled:opacity-40"
        >
          <SendHorizontal className="size-4" />
        </button>
      </form>
    </div>
  );
}

/* ───────────────────────── Ended ───────────────────────── */

function Ended({ profile, intake }: { profile: Profile; intake: Intake }) {
  const router = useRouter();
  return (
    <div className="grid min-h-svh place-items-center bg-gradient-to-b from-white to-[#eef1f0] px-6 py-16">
      <div className="w-full max-w-md text-center">
        <AnimatedText
          as="h1"
          text={`Take care, ${firstName(profile.name)}.`}
          className="font-display tracking-display text-4xl leading-[1.05] text-gray-900 md:text-6xl"
        />
        <p className="mt-4 leading-relaxed text-gray-600">
          Your token was {intake.ref}. If things get worse, or anything new appears, start another
          consult. If it becomes an emergency, call your local emergency number.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => {
              actions.closeIntake(profile.id);
              router.push('/dashboard');
            }}
            className="bg-brand w-full rounded-lg px-6 py-3.5 font-medium text-white sm:w-auto"
          >
            Done, back to my dashboard
          </button>
          <Link
            href="/consult"
            className="text-sm text-gray-500 underline-offset-4 hover:underline"
          >
            Continue on WhatsApp instead
          </Link>
        </div>
      </div>
    </div>
  );
}
