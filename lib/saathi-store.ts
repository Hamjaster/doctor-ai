'use client';

import { useSyncExternalStore } from 'react';

/*
 * Patient data lives in this browser only (localStorage). Nothing leaves the device until the
 * patient sends their notes on WhatsApp or starts a video consult, where the brief built in
 * `lib/brief.ts` is handed to the agent.
 */

export type Relation = 'self' | 'parent' | 'child' | 'spouse' | 'other';
export type Sex = 'female' | 'male' | 'other' | '';
export type Since = 'today' | 'few-days' | 'this-week' | 'longer' | '';
export type Channel = 'whatsapp-chat' | 'whatsapp-call' | 'video';

export interface Profile {
  id: string;
  name: string;
  relation: Relation;
  age: string;
  sex: Sex;
  phone: string;
  conditions: string;
  medications: string;
  allergies: string;
}

export interface Intake {
  concern: string;
  areas: string[];
  since: Since;
  severity: number | null;
  redFlags: string[];
  ref: string;
  updatedAt: number;
}

export interface Consult {
  id: string;
  profileId: string;
  ref: string;
  channel: Channel;
  concern: string;
  at: number;
}

export interface SaathiState {
  profiles: Profile[];
  activeId: string | null;
  intakes: Record<string, Intake>;
  consults: Consult[];
}

const KEY = 'saathi:v1';
const EMPTY: SaathiState = { profiles: [], activeId: null, intakes: {}, consults: [] };

let cache: SaathiState | null = null;
const listeners = new Set<() => void>();

function read(): SaathiState {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as SaathiState) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: SaathiState) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be blocked (private mode); the session still works in memory.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useSaathi() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** False during SSR and hydration, true once the browser store has been read. */
export function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function emptyIntake(): Intake {
  return { concern: '', areas: [], since: '', severity: null, redFlags: [], ref: '', updatedAt: 0 };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// No 0/O or 1/I so a token can be read aloud over a call.
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRef() {
  let s = '';
  for (let i = 0; i < 4; i++) s += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  return `DA-${s}`;
}

export const actions = {
  saveProfile(profile: Omit<Profile, 'id'> & { id?: string }) {
    const s = read();
    const id = profile.id ?? uid();
    const exists = s.profiles.some((p) => p.id === id);
    const nextProfile = { ...profile, id } as Profile;
    write({
      ...s,
      profiles: exists
        ? s.profiles.map((p) => (p.id === id ? nextProfile : p))
        : [...s.profiles, nextProfile],
      activeId: id,
    });
    return id;
  },
  removeProfile(id: string) {
    const s = read();
    const profiles = s.profiles.filter((p) => p.id !== id);
    const intakes = { ...s.intakes };
    delete intakes[id];
    write({
      ...s,
      profiles,
      intakes,
      activeId: s.activeId === id ? (profiles[0]?.id ?? null) : s.activeId,
    });
  },
  setActive(id: string) {
    write({ ...read(), activeId: id });
  },
  updateIntake(profileId: string, patch: Partial<Intake>) {
    const s = read();
    const current = s.intakes[profileId] ?? emptyIntake();
    write({
      ...s,
      intakes: { ...s.intakes, [profileId]: { ...current, ...patch, updatedAt: Date.now() } },
    });
  },
  /** Gives the intake a token number the first time it is handed off. */
  ensureRef(profileId: string) {
    const s = read();
    const current = s.intakes[profileId] ?? emptyIntake();
    if (current.ref) return current.ref;
    const ref = newRef();
    write({ ...s, intakes: { ...s.intakes, [profileId]: { ...current, ref } } });
    return ref;
  },
  logConsult(profileId: string, channel: Channel) {
    const s = read();
    const intake = s.intakes[profileId];
    if (!intake) return;
    const last = s.consults[0];
    // Tapping the same hand-off twice in a row is one consult, not two.
    if (last && last.ref === intake.ref && last.channel === channel) return;
    write({
      ...s,
      consults: [
        {
          id: uid(),
          profileId,
          ref: intake.ref,
          channel,
          concern: intake.concern,
          at: Date.now(),
        },
        ...s.consults,
      ].slice(0, 50),
    });
  },
  /** Clears today's concern after a consult so the next one starts fresh. */
  closeIntake(profileId: string) {
    const s = read();
    write({ ...s, intakes: { ...s.intakes, [profileId]: emptyIntake() } });
  },
};
