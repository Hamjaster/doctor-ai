import type { Metadata, Viewport } from 'next';
import { Inria_Serif } from 'next/font/google';
import '@/styles/globals.css';

const inria = Inria_Serif({
  weight: ['300', '400', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-inria',
});

export const metadata: Metadata = {
  title: 'Saathi: a doctor on WhatsApp',
  description:
    'Saathi is an AI doctor you can call on WhatsApp. Tell it what is wrong, show it on video, and leave knowing your next step.',
};

export const viewport: Viewport = {
  themeColor: '#2b3534',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inria.variable} font-sans antialiased`}>
      <body>{children}</body>
    </html>
  );
}
