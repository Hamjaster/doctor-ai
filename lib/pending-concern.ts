'use client';

/*
 * What a visitor types into the home page box, carried to the dashboard. It lives in
 * sessionStorage until a profile exists to attach it to, then becomes that profile's concern.
 */

const KEY = 'saathi:pending-concern';

export function savePendingConcern(text: string) {
  try {
    window.sessionStorage.setItem(KEY, text.trim());
  } catch {
    // Storage blocked: the dashboard simply starts empty.
  }
}

/** Returns the pending concern once and clears it. */
export function takePendingConcern(): string | null {
  try {
    const v = window.sessionStorage.getItem(KEY);
    if (v) window.sessionStorage.removeItem(KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function peekPendingConcern(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
