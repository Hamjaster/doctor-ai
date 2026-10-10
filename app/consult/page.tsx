import { redirect } from 'next/navigation';

// The WhatsApp hand-off is part of /start now; keep old links working.
export default function ConsultPage() {
  redirect('/start?next=whatsapp');
}
