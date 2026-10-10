import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { FromWhatsApp, type WhatsAppContext } from '@/components/saathi/video/from-whatsapp';

export const metadata: Metadata = { title: 'Video consult · doctor.ai' };
export const dynamic = 'force-dynamic';

/**
 * The link the WhatsApp bot sends: /video?t=<token>. The token is looked up on the bot, server to
 * server, so the chat never travels in the URL. Without a valid token, fall back to /start.
 */
export default async function VideoFromWhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const context = t ? await fetchContext(t) : null;
  if (!context) redirect('/start?next=video');
  return <FromWhatsApp context={context} />;
}

async function fetchContext(token: string): Promise<WhatsAppContext | null> {
  const bot = process.env.WHATSAPP_BOT_URL || 'http://localhost:8000';
  const secret = process.env.HANDOFF_SECRET;
  if (!secret || !/^[\w-]{8,64}$/.test(token)) return null;
  try {
    const res = await fetch(`${bot}/handoff/${token}`, {
      headers: { 'X-Handoff-Key': secret },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as WhatsAppContext;
  } catch {
    return null;
  }
}
