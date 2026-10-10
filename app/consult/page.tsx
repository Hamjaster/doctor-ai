import type { Metadata } from 'next';
import { Handoff } from '@/components/saathi/consult/handoff';

export const metadata: Metadata = { title: 'Call Saathi · Saathi' };

// Read env at request time so the number can change without a rebuild.
export const dynamic = 'force-dynamic';

export default function ConsultPage() {
  return (
    <Handoff
      whatsappNumber={process.env.SAATHI_WHATSAPP_NUMBER?.trim() || null}
      videoReady={
        !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)
      }
      isDev={process.env.NODE_ENV !== 'production'}
    />
  );
}
