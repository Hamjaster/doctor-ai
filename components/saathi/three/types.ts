export type AvatarMood = 'idle' | 'listening' | 'thinking' | 'speaking';

/**
 * Written by the page, read by the avatar every frame. Mutate `drive.current` directly;
 * it is a ref, so changes never re-render React.
 */
export interface AvatarDrive {
  /** 0..1 speech loudness (e.g. agent audio volume). Ignored when `synthetic` is true. */
  level: number;
  mood: AvatarMood;
  /** Generate speech-like mouth movement instead of reading `level` (marketing pages). */
  synthetic?: boolean;
  /** Set to performance.now() to trigger a wave. */
  waveAt?: number;
  /** Set to performance.now() to trigger a nod. */
  nodAt?: number;
}

export interface AvatarStageProps {
  drive: React.RefObject<AvatarDrive>;
  /** Called when the visitor clicks/taps the doctor (he also waves). */
  onPoke?: () => void;
  /** 'hero' frames the doctor from the waist up; 'call' is a head-and-shoulders close-up. */
  framing?: 'hero' | 'call';
  className?: string;
}
