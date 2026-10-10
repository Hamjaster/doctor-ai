import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { VideoConsult } from '@/components/saathi/video/video-consult';

export const metadata: Metadata = { title: 'Video consult · doctor.ai' };
export const dynamic = 'force-dynamic';

export default function VideoConsultPage() {
  const configured =
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET;
  if (!configured) redirect('/consult');

  // Leave AGENT_NAME blank: the doctor.ai agent registers without a name and uses automatic dispatch.
  return <VideoConsult agentName={process.env.AGENT_NAME || undefined} />;
}
