import { Hero } from '@/components/saathi/landing/hero';
import { ProductFilm } from '@/components/saathi/landing/product-film';
import {
  Closing,
  Families,
  Faq,
  HowItWorks,
  Safety,
  ShowOnVideo,
  Statement,
} from '@/components/saathi/landing/sections';
import { SmoothScroll } from '@/components/saathi/motion';
import { SiteNav } from '@/components/saathi/site-nav';

// Read the WhatsApp number at request time so it can change without a rebuild.
export const dynamic = 'force-dynamic';

export default function LandingPage() {
  return (
    <>
      <SmoothScroll />
      <SiteNav />
      <main>
        <Hero whatsappNumber={process.env.SAATHI_WHATSAPP_NUMBER?.trim() || null} />
        <ProductFilm />
        <Statement />
        <HowItWorks />
        <ShowOnVideo />
        <Safety />
        <Families />
        <Faq />
      </main>
      <Closing />
    </>
  );
}
