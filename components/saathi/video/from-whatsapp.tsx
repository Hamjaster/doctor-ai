'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageSkeleton } from '@/components/saathi/motion';
import { actions, useHydrated, useSaathi } from '@/lib/saathi-store';

export type WhatsAppContext = {
  name: string;
  phone: string;
  messages: { from: 'patient' | 'doctor'; text: string }[];
};

// Keep the brief within the token route's attribute limit.
const MAX_CHAT_CHARS = 2500;

function transcript(messages: WhatsAppContext['messages']) {
  const text = messages
    .map((m) => `${m.from === 'patient' ? 'Patient' : 'doctor.ai'}: ${m.text.replace(/\s+/g, ' ')}`)
    .join('\n');
  return text.length <= MAX_CHAT_CHARS ? text : `…${text.slice(-MAX_CHAT_CHARS)}`;
}

const digits = (s: string) => s.replace(/\D/g, '');

/** Saves who the patient is and what they said on WhatsApp, then opens the video consult. */
export function FromWhatsApp({ context }: { context: WhatsAppContext }) {
  const hydrated = useHydrated();
  const state = useSaathi();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    const phone = digits(context.phone);
    // Same patient on this browser before: keep their details, refresh name and number.
    const existing =
      state.profiles.find((p) => phone && digits(p.phone) === phone) ??
      (!phone ? state.profiles.find((p) => p.id === state.activeId) : undefined);
    const name = context.name.trim() || existing?.name || '';
    if (!name) {
      // No name from WhatsApp and nothing saved: ask for it, then continue to video.
      router.replace('/start?next=video');
      return;
    }
    const id = actions.saveProfile({
      relation: 'self',
      age: '',
      sex: '',
      medications: '',
      allergies: '',
      conditions: '',
      ...existing,
      name,
      phone: context.phone || existing?.phone || '',
    });
    actions.closeIntake(id); // a fresh consult, not yesterday's notes
    actions.updateIntake(id, { whatsapp: transcript(context.messages) });
    actions.ensureRef(id);
    router.replace('/consult/video');
    // Run once per link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  return <PageSkeleton />;
}
