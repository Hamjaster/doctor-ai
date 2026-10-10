import type { Metadata } from 'next';
import { Dashboard } from '@/components/saathi/dashboard/dashboard';

export const metadata: Metadata = { title: 'Your dashboard · Saathi' };

export default function DashboardPage() {
  return <Dashboard />;
}
