// @ts-nocheck
/* eslint-disable */
"use client";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/components/site/shared";
import { TopNav, Hero, TrustMarquee, HowItWorks, MobileActionBar } from "./top";
import {
  LiveDemoSection,
  CalendarPreview,
  EmailSection,
  LeadsSection,
  Pricing,
  FinalCTA,
  Footer,
} from "./lower";
import { RentalsAndLiveSection } from "./rentals-section";

export function LandingPageClient() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const onOpenApp = () => router.push("/app");
  const onOpenRent = () => router.push("/app?mode=rentals");
  const onOpenLive = () => router.push("/live");

  return (
    <div className="realme-surface" data-screen-label="01 Landing">
      <TopNav onOpenApp={onOpenApp} onOpenLive={onOpenLive} />
      <Hero onOpenApp={onOpenApp} />
      <TrustMarquee />
      <HowItWorks />
      <LiveDemoSection onOpenApp={onOpenApp} />
      <CalendarPreview />
      <EmailSection />
      <LeadsSection />
      <RentalsAndLiveSection onOpenApp={onOpenRent} onOpenLive={onOpenLive} />
      <Pricing onOpenApp={onOpenApp} />
      <FinalCTA onOpenApp={onOpenApp} />
      <Footer />
      {isMobile && <div style={{ height: 76 }} aria-hidden />}
      <MobileActionBar onOpenApp={onOpenApp} onOpenLive={onOpenLive} />
    </div>
  );
}
