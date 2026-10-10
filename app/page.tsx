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

export default function LandingPage() {
  return (
    <>
      <SmoothScroll />
      <SiteNav />
      <main>
        <Hero />
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
