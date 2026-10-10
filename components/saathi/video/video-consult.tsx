'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LocalVideoTrack, TokenSource, Track } from 'livekit-client';
import {
  ArrowLeft,
  ArrowUp,
  Camera,
  CameraOff,
  Keyboard,
  Mic,
  MicOff,
  PhoneOff,
  SwitchCamera,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  type ReceivedMessage,
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
import {
  type Intake,
  type Profile,
  actions,
  emptyIntake,
  useHydrated,
  useSaathi,
} from '@/lib/saathi-store';

const AvatarStage = dynamic(() => import('@/components/saathi/three/avatar-stage'), {
  ssr: false,
  loading: () => null,
});

export function VideoConsult({ agentName }: { agentName?: string }) {
  const hydrated = useHydrated();
  const state = useSaathi();
  const profile = state.profiles.find((p) => p.id === state.activeId) ?? state.profiles[0];
  const stored = profile ? state.intakes[profile.id] : undefined;

  // Every consult needs a token; onboarding creates one, but older profiles may not have it.
  useEffect(() => {
    if (profile && !stored?.ref) actions.ensureRef(profile.id);
  }, [profile, stored?.ref]);

  if (!hydrated) return <PageSkeleton />;

  // Only the patient's details are needed; doctor.ai asks about today's problem on the call.
  const intake = stored ?? emptyIntake();
  if (!profile) {
    return (
      <div className="grid min-h-svh place-items-center bg-white px-6 text-center">
        <div>
          <AnimatedText
            as="h1"
            text="First, tell us who you are."
            className="font-display tracking-display text-4xl text-gray-900 md:text-5xl"
          />
          <p className="mt-3 text-gray-600">
            Your name, number and one line about your health. It takes ten seconds.
          </p>
          <Link
            href="/start?next=video"
            className="bg-brand mt-8 inline-flex rounded-lg px-6 py-3.5 font-medium text-white"
          >
            Add my details
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
    // Only pass agentName when it's set. livekit-client copies every key it's given, and an
    // undefined agentName can't be encoded, so the token request fails before it's sent.
    ...(agentName ? { agentName } : {}),
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
          ? 'doctor.ai needs your camera and microphone. Allow them in your browser settings, then try again.'
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
        'doctor.ai couldn’t join the call. Try again in a minute.' +
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
  return <Live profile={profile} intake={intake} onEnd={end} />;
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
          href="/start?next=whatsapp"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>
      </header>
      <main className="mx-auto grid max-w-6xl items-center gap-6 px-6 pb-16 md:px-12 lg:grid-cols-[1fr_0.9fr]">
        <div className="order-2 lg:order-1">
          <AnimatedText
            as="h1"
            text="doctor.ai will see what your camera sees."
            className="font-display tracking-display text-4xl leading-[1.05] text-gray-900 md:text-6xl"
          />
          <ul className="mt-8 flex flex-col gap-3 text-gray-700">
            {[
              'Sit near a window or a bright light. Daylight shows colour best.',
              'Keep any medicines or reports you want to ask about within reach.',
              `doctor.ai has read ${
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
            Token {intake.ref}. Your browser will ask for camera and microphone access. doctor.ai is
            an AI, not a doctor who can examine you.
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
  connecting: 'doctor.ai is joining',
  initializing: 'doctor.ai is joining',
  'pre-connect-buffering': 'doctor.ai is joining',
  idle: 'doctor.ai is joining',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  disconnected: 'Call ended',
  failed: 'doctor.ai couldn’t join',
};

const glass = 'bg-white/[0.06] ring-1 ring-white/10 backdrop-blur-xl';

function Live({ profile, intake, onEnd }: { profile: Profile; intake: Intake; onEnd: () => void }) {
  const session = useSessionContext();
  const chat = useSessionMessages(session);
  const agent = useAgent();
  const volume = useTrackVolume(agent.microphoneTrack);
  const cameraRef = session.local.cameraTrack;
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const micLevel = useTrackVolume(session.local.microphoneTrack);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  // The doctor fills the screen; tap your camera tile to swap when showing something up close.
  const [showingMe, setShowingMe] = useState(false);
  const [typing, setTyping] = useState(false);
  const cameraOn = cam.enabled && !!cameraRef && !cameraRef.publication?.isMuted;
  const meBig = showingMe && cameraOn;

  const flip = async () => {
    const track = cameraRef?.publication?.track;
    if (!(track instanceof LocalVideoTrack)) return;
    const next = facing === 'user' ? 'environment' : 'user';
    try {
      await track.restartTrack({ facingMode: next });
      setFacing(next);
      if (next === 'environment') setShowingMe(true);
    } catch {
      // Devices with one camera reject the switch; nothing to do.
    }
  };

  const me = cameraOn && cameraRef && (
    <VideoTrack
      trackRef={cameraRef}
      className={cn('h-full w-full object-cover', facing === 'user' && '-scale-x-100')}
    />
  );

  return (
    <div className="relative isolate h-svh overflow-hidden bg-[#141a19] text-white">
      {/* Main stage: the doctor, or your camera when you're showing it something. */}
      <div className="absolute inset-0">
        {meBig ? (
          <div className="relative h-full w-full">
            {me}
            <Viewfinder scanning />
          </div>
        ) : (
          <DoctorStage volume={volume} state={agent.state} joining={!agent.isConnected} />
        )}
      </div>

      {/* Scrims keep text legible on any video. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/50 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/75 via-black/30 to-transparent"
      />

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="font-display tracking-display-sm text-2xl leading-none font-bold">
            doctor<span className="text-white/55">.ai</span>
          </span>
          <LiveBadge />
        </div>
        <span
          className={cn(glass, 'hidden rounded-full px-3 py-1.5 text-xs text-white/70 sm:inline')}
        >
          An AI, not a doctor who can examine you
          {intake.ref && <span className="ml-2 text-white/45 tabular-nums">{intake.ref}</span>}
        </span>
      </header>

      {/* Your camera, picture-in-picture. Tap to swap with the main view. */}
      <motion.button
        type="button"
        onClick={() => cameraOn && setShowingMe((v) => !v)}
        aria-label={meBig ? 'Show doctor.ai full screen' : 'Show your camera full screen'}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.2 }}
        className="absolute top-20 right-4 z-10 aspect-[3/4] w-28 overflow-hidden rounded-2xl bg-[#1c2322] shadow-2xl ring-1 ring-white/15 sm:right-6 sm:w-40 lg:w-48"
      >
        {meBig ? (
          <DoctorStage volume={volume} state={agent.state} joining={!agent.isConnected} compact />
        ) : cameraOn ? (
          me
        ) : (
          <span className="grid h-full place-items-center">
            <CameraOff className="size-6 text-white/50" />
          </span>
        )}
        <span className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white/85 backdrop-blur">
          {meBig ? 'doctor.ai' : firstName(profile.name) || 'You'}
        </span>
      </motion.button>

      <SourcesCard messages={chat.messages} />

      {/* Bottom: who's talking, what doctor.ai is saying right now, and the controls. */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-5 px-4 pb-6 sm:pb-8">
        <AgentStatus state={agent.state} volume={volume} joining={!agent.isConnected} />
        <LiveWords messages={chat.messages} speaking={agent.state === 'speaking'} />

        <AnimatePresence>
          {typing && <TypeBox chat={chat} onClose={() => setTyping(false)} />}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.3 }}
          className={cn(
            glass,
            'flex items-center gap-1.5 rounded-full bg-black/40 p-1.5 sm:gap-2 sm:p-2'
          )}
        >
          <ControlButton
            label={mic.enabled ? 'Mute microphone' : 'Unmute microphone'}
            active={mic.enabled}
            pending={mic.pending}
            level={mic.enabled ? micLevel : 0}
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
          <ControlButton
            label={typing ? 'Close keyboard' : 'Type a message'}
            active={!typing}
            onClick={() => setTyping((v) => !v)}
          >
            <Keyboard className="size-5" />
          </ControlButton>
          <span aria-hidden className="mx-1 h-7 w-px bg-white/15" />
          <button
            type="button"
            onClick={onEnd}
            aria-label="End"
            className="bg-danger grid size-11 place-items-center rounded-full text-white shadow-[0_10px_30px_-10px_rgb(194_65_45/0.8)] transition-[transform,filter] hover:-translate-y-0.5 hover:brightness-110 sm:size-12"
          >
            <PhoneOff className="size-5" />
          </button>
        </motion.div>
      </div>

      <StartAudio
        label="Tap to hear doctor.ai"
        className="fixed inset-x-0 top-1/2 z-20 mx-auto w-fit rounded-full bg-white px-5 py-3 font-medium text-gray-900 shadow-2xl shadow-black/40"
      />
    </div>
  );
}

const AGENT_MOOD: Record<string, AvatarMood> = {
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
};

/** doctor.ai on the main stage: the rigged avatar, with a halo that breathes with its voice. */
function DoctorStage({
  volume,
  state,
  joining,
  compact = false,
}: {
  volume: number;
  state: string;
  joining: boolean;
  compact?: boolean;
}) {
  const drive = useRef<AvatarDrive>({ level: 0, mood: 'idle' });
  useEffect(() => {
    drive.current.mood = AGENT_MOOD[state] ?? 'idle';
  }, [state]);
  useEffect(() => {
    drive.current.level = volume;
  }, [volume]);
  useEffect(() => {
    if (!joining) drive.current.waveAt = performance.now();
  }, [joining]);
  const v = Math.min(volume, 1);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#3a4746_0%,#1c2322_55%,#141a19_100%)]">
      <div
        aria-hidden
        className="absolute inset-0 transition-[transform,opacity] duration-150"
        style={{ transform: `scale(${1 + v * 0.18})`, opacity: 0.5 + v * 0.5 }}
      >
        <div className="absolute top-[12%] left-1/2 aspect-square w-[min(70vw,560px)] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(122_158_150/0.5),transparent)]" />
      </div>
      <AvatarStage
        drive={drive}
        framing={compact ? 'call' : 'hero'}
        className={cn('absolute inset-0', !compact && 'lg:inset-x-[18%]')}
      />
    </div>
  );
}

/** One line: what doctor.ai is doing right now. */
function AgentStatus({
  state,
  volume,
  joining,
}: {
  state: string;
  volume: number;
  joining: boolean;
}) {
  return (
    <p
      className={cn(
        glass,
        'inline-flex items-center gap-2 rounded-full bg-black/30 px-3.5 py-1.5 text-sm text-white/80',
        joining && 'animate-pulse'
      )}
    >
      <StateGlyph state={state} level={volume} />
      {STATE_LABEL[state] ?? state}
    </p>
  );
}

/** The end of a long line, so live words stay at most a few lines tall. */
function captionTail(text: string, max = 180) {
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(-max);
  return `…${cut.slice(cut.indexOf(' ') + 1)}`;
}

/**
 * Only what doctor.ai is saying, as it says it. No history: the words appear while it speaks
 * and fade a moment after it stops, like subtitles on a live call.
 */
function LiveWords({ messages, speaking }: { messages: ReceivedMessage[]; speaking: boolean }) {
  const reduce = useReducedMotion();
  const last = messages.findLast((m) => m.type === 'agentTranscript');
  const [linger, setLinger] = useState(false);

  useEffect(() => {
    if (speaking) {
      setLinger(true);
      return;
    }
    const t = setTimeout(() => setLinger(false), 2200);
    return () => clearTimeout(t);
  }, [speaking]);

  const text = last ? captionTail(last.message) : '';
  const show = (speaking || linger) && !!text;

  return (
    <div
      aria-live="polite"
      className="flex min-h-[6.5rem] w-full max-w-3xl items-end justify-center"
    >
      <AnimatePresence mode="wait">
        {show && last && (
          <motion.p
            key={last.id}
            initial={reduce ? false : { opacity: 0, y: 12, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduce ? undefined : { opacity: 0, y: -8, filter: 'blur(8px)' }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="font-display text-center text-2xl leading-snug text-white [text-shadow:0_2px_24px_rgb(0_0_0/0.7)] md:text-[2rem]"
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Sources doctor.ai looked up, shown briefly as a card instead of in a chat log. */
function SourcesCard({ messages }: { messages: ReceivedMessage[] }) {
  const latest = messages.findLast(
    (m) => m.type === 'chatMessage' && !m.from?.isLocal && /\]\(https?:\/\//.test(m.message)
  );
  const [hidden, setHidden] = useState<string | null>(null);

  useEffect(() => {
    if (!latest) return;
    const t = setTimeout(() => setHidden(latest.id), 30_000);
    return () => clearTimeout(t);
  }, [latest]);

  const show = !!latest && hidden !== latest.id;
  return (
    <AnimatePresence>
      {show && latest && (
        <motion.aside
          key={latest.id}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
          className={cn(
            glass,
            'absolute top-20 left-4 z-10 max-w-[min(22rem,calc(100vw-10rem))] rounded-2xl bg-black/40 p-4 text-sm leading-relaxed sm:left-6'
          )}
        >
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-xs font-medium tracking-wide text-white/55 uppercase">
              Sources
            </span>
            <button
              type="button"
              onClick={() => setHidden(latest.id)}
              aria-label="Hide sources"
              className="text-white/50 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
          <AgentText text={latest.message.replace(/^\*\*[^*]+\*\*\s*/, '')} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/** Optional typing, for when speaking isn't possible. Messages aren't kept on screen. */
function TypeBox({
  chat,
  onClose,
}: {
  chat: ReturnType<typeof useSessionMessages>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <motion.form
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      onSubmit={async (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text) return;
        setDraft('');
        await chat.send(text);
        onClose();
      }}
      className={cn(
        glass,
        'flex w-full max-w-md items-center gap-2 rounded-full bg-black/40 p-1.5 pl-4'
      )}
    >
      <label htmlFor="typed-message" className="sr-only">
        Type a message to doctor.ai
      </label>
      <input
        id="typed-message"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        placeholder="Type instead of speaking"
        className="h-9 min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
      />
      <motion.button
        type="submit"
        aria-label="Send message"
        disabled={!draft.trim() || chat.isSending}
        whileTap={{ scale: 0.9 }}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-gray-900 transition-opacity disabled:opacity-30"
      >
        <ArrowUp className="size-4" />
      </motion.button>
    </motion.form>
  );
}

/** "Live" with a running call clock. */
function LiveBadge() {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor((now - startedAt) / 1000);
  const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <span
      className={cn(
        glass,
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium tabular-nums'
      )}
    >
      <span className="relative flex size-2">
        <span className="bg-danger absolute inset-0 animate-ping rounded-full opacity-60" />
        <span className="bg-danger relative size-2 rounded-full" />
      </span>
      Live <span className="text-white/55">{clock}</span>
    </span>
  );
}

function ControlButton({
  label,
  active,
  pending,
  disabled,
  level = 0,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  pending?: boolean;
  disabled?: boolean;
  /** 0..1 input level; draws a ring that swells while the patient talks. */
  level?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled || pending}
      whileTap={{ scale: 0.92 }}
      className={cn(
        'relative grid size-11 place-items-center rounded-full transition-colors disabled:opacity-40 sm:size-12',
        active ? 'bg-white/10 hover:bg-white/20' : 'bg-white text-gray-900 hover:bg-gray-100'
      )}
    >
      {level > 0.02 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/50 transition-transform duration-100"
          style={{ transform: `scale(${1 + Math.min(level, 1) * 0.35})`, opacity: 0.4 + level }}
        />
      )}
      {children}
    </motion.button>
  );
}

/** Corner brackets: the frame is the exam light, not decoration. */
function Viewfinder({ scanning }: { scanning: boolean }) {
  const reduce = useReducedMotion();
  const corner = 'absolute size-10 border-white/60';
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-6 top-16 bottom-6 sm:inset-x-10 sm:top-16 sm:bottom-10"
    >
      <span className={cn(corner, 'top-0 left-0 rounded-tl-2xl border-t-2 border-l-2')} />
      <span className={cn(corner, 'top-0 right-0 rounded-tr-2xl border-t-2 border-r-2')} />
      <span className={cn(corner, 'bottom-0 left-0 rounded-bl-2xl border-b-2 border-l-2')} />
      <span className={cn(corner, 'right-0 bottom-0 rounded-br-2xl border-r-2 border-b-2')} />
      {scanning && !reduce && (
        <div className="absolute inset-x-3 top-0 h-[60%] opacity-60">
          <div className="animate-scan h-px w-full bg-gradient-to-r from-transparent via-white/70 to-transparent shadow-[0_0_24px_4px_rgb(255_255_255/0.2)]" />
        </div>
      )}
    </div>
  );
}

/** A small live sign for what doctor.ai is doing: bars when speaking, dots when thinking. */
function StateGlyph({ state, level }: { state: string; level: number }) {
  const reduce = useReducedMotion();
  if (state === 'speaking') {
    return (
      <span aria-hidden className="flex h-3.5 items-center gap-[3px]">
        {[0.6, 1, 0.75, 0.45].map((k, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-white transition-[height] duration-100"
            style={{ height: `${Math.max(3, Math.min(14, 3 + level * 22 * k))}px` }}
          />
        ))}
      </span>
    );
  }
  if (state === 'thinking') {
    return (
      <span aria-hidden className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1 rounded-full bg-white"
            animate={reduce ? undefined : { opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
      </span>
    );
  }
  if (state === 'listening') {
    return (
      <span aria-hidden className="relative flex size-2">
        <span className="bg-wa absolute inset-0 animate-ping rounded-full opacity-50" />
        <span className="bg-wa relative size-2 rounded-full" />
      </span>
    );
  }
  return <span aria-hidden className="size-2 rounded-full bg-white/40" />;
}

// doctor.ai posts its sources as Markdown links in the chat. Render those, and bare
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
              router.push('/');
            }}
            className="bg-brand w-full rounded-lg px-6 py-3.5 font-medium text-white sm:w-auto"
          >
            Done
          </button>
          <Link
            href="/start?next=whatsapp"
            className="text-sm text-gray-500 underline-offset-4 hover:underline"
          >
            Continue on WhatsApp instead
          </Link>
        </div>
      </div>
    </div>
  );
}
