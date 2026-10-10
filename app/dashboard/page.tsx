import type { Metadata } from 'next';
import { Dashboard } from '@/components/saathi/dashboard/dashboard';

export const metadata: Metadata = { title: 'Your dashboard · doctor.ai' };

export default function DashboardPage() {
  return <Dashboard />;
}
