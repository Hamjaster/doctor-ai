import type { Metadata } from 'next';
import { Start, type StartNext } from '@/components/saathi/start/start';

export const metadata: Metadata = { title: 'Start a consult · doctor.ai' };

// Read env at request time so the number can change without a rebuild.
export const dynamic = 'force-dynamic';

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <Start
      whatsappNumber={process.env.SAATHI_WHATSAPP_NUMBER?.trim() || null}
      videoReady={
        !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)
      }
      next={next === 'video' || next === 'whatsapp' ? (next as StartNext) : null}
    />
  );
}
