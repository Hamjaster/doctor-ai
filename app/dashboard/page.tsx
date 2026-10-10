import { redirect } from 'next/navigation';

// Onboarding now lives on /start; keep old links working.
export default function DashboardPage() {
  redirect('/start');
}
