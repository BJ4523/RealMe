// @ts-nocheck
/* eslint-disable */
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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

  // The landing is static, so auth state is detected client-side: hides the
  // "Sign in" button for users who already have a session (it lied to them).
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
  }, []);

  return (
    <div className="realme-surface" data-screen-label="01 Landing">
      <TopNav onOpenApp={onOpenApp} onOpenLive={onOpenLive} authed={authed} />
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
