// @ts-nocheck
/* eslint-disable */
"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { AGENT, LISTINGS, POSTS_WEEK, LEADS, STAGES, CheckIcon, listingBg, priceShort, useCount, PlatformIcon, ListingThumb, useIsMobile } from "@/components/site/shared";
import { Star } from "lucide-react";

// REAL ME AI — Landing page lower sections

// ====== CALENDAR PREVIEW — auto-filling moment ======
export function CalendarPreview() {
  const isMobile = useIsMobile();
  const ref = useRef(null);
  const [filled, setFilled] = useState(0); // index of last filled item
  const [running, setRunning] = useState(false);

  // Flatten all items into an order
  const allItems = useMemo(() => {
    const out = [];
    POSTS_WEEK.forEach((day, di) => {
      day.items.forEach((it, ii) => out.push({ di, ii, item: it }));
    });
    return out;
  }, []);

  // Start auto-fill when visible
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !running) {
          setRunning(true);
        }
      });
    }, { threshold: 0.3 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [running]);

  useEffect(() => {
    if (!running) return;
    setFilled(0);
    let n = 0;
    const tick = setInterval(() => {
      n++;
      setFilled(n);
      if (n > allItems.length + 3) {
        // restart loop
        n = 0;
        setFilled(0);
      }
    }, 380);
    return () => clearInterval(tick);
  }, [running]);

  return (
    <section id="calendar" ref={ref} style={{
      maxWidth: 1400, margin: "0 auto", padding: isMobile ? "80px 20px 60px" : "140px 32px 100px",
    }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "start" : "end", justifyContent: "space-between", marginBottom: isMobile ? 32 : 56, gap: isMobile ? 20 : 40 }}>
        <h2 className="display" style={{ fontSize: isMobile ? "clamp(38px, 11vw, 64px)" : "clamp(56px, 8vw, 128px)", margin: 0, lineHeight: 0.92, maxWidth: 880 }}>
          Watch a week<br />of content fill itself.
        </h2>
        <div style={{ maxWidth: isMobile ? "100%" : 360, fontSize: 16, color: "var(--ink-soft)", lineHeight: 1.5 }}>
          Pick a cadence. REAL ME AI drafts the mix — walkthroughs, neighborhood
          stories, just-listed pops — across every channel you connect.
          You approve, or you don't even open the app.
        </div>
      </div>

      <CalendarVisual filled={filled} allItems={allItems} isMobile={isMobile} />

      <div style={{ marginTop: 28, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center", paddingTop: 24, borderTop: "4px solid var(--ink)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink-soft)" }}>
          <span style={{ color: "var(--ink)", fontWeight: 600 }}>{Math.min(filled, allItems.length)}</span> / {allItems.length} posts scheduled
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>Estimated reach <strong className="mono" style={{ color: "var(--ink)" }}>184,200</strong> impressions this week</div>
      </div>
    </section>
  );
}

function CalendarVisual({ filled, allItems, isMobile }) {
  return (
    <div style={{ background: "var(--bg-warm)", borderRadius: 18, padding: isMobile ? 14 : 20, border: "1px solid var(--rule)", maxWidth: "100%", overflowX: isMobile ? "auto" : "visible" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--rule)", minWidth: isMobile ? 700 : 0 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)", letterSpacing: "0.1em" }}>WEEK OF</div>
          <div className="display" style={{ fontSize: 28 }}>May 13 – 19, 2026</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--lime)", animation: "pulse 1.5s infinite" }} />
            AUTO-FILLING
          </span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, minWidth: isMobile ? 700 : 0 }}>
        {POSTS_WEEK.map((day, di) => (
          <div key={di} style={{
            background: "var(--bg-card)", borderRadius: 10, padding: 10,
            border: "1px solid var(--rule)", minHeight: 240,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 6, borderBottom: "1px solid var(--rule-soft)" }}>
              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{day.label}</div>
              <div className="display" style={{ fontSize: 22 }}>{day.date}</div>
            </div>
            {day.items.map((item, ii) => {
              const globalIdx = allItems.findIndex(x => x.di === di && x.ii === ii);
              const isFilled = globalIdx < filled;
              const isAppearing = globalIdx === filled - 1;
              const listing = LISTINGS.find(l => l.id === item.listing);
              if (!isFilled) {
                return (
                  <div key={ii} style={{
                    height: 84, borderRadius: 6,
                    border: "1.5px dashed var(--rule)",
                    background: "rgba(0,0,0,0.015)",
                  }} />
                );
              }
              return (
                <div key={ii} style={{
                  border: "1px solid var(--rule)",
                  borderRadius: 6,
                  overflow: "hidden",
                  animation: isAppearing ? "fillIn 0.35s ease-out" : "none",
                  background: "var(--bg-warm)",
                }}>
                  <div style={{ height: 40, ...listingBg(listing), position: "relative" }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,0.5))" }} />
                    <div style={{ position: "absolute", top: 4, right: 4 }}>
                      <PlatformIcon p={item.platform} size={12} />
                    </div>
                  </div>
                  <div style={{ padding: "6px 8px" }}>
                    <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{item.time}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {listing.address.split(" ").slice(0, 3).join(" ")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ====== EMAIL ======
export function EmailSection() {
  const isMobile = useIsMobile();
  return (
    <section id="email" style={{
      background: "var(--bg-warm)", padding: isMobile ? "72px 0" : "120px 0",
      borderTop: "8px solid var(--ink)",
    }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "0 20px" : "0 32px",
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.3fr 1fr", gap: isMobile ? 48 : 80, alignItems: "start" }}>
        <div>
          <EmailMockup />
        </div>
        <div style={{ position: isMobile ? "static" : "sticky", top: 100 }}>
          <span className="eyebrow">Email & SMS in lockstep</span>
          <h2 className="display" style={{ fontSize: isMobile ? "clamp(36px, 9vw, 56px)" : "clamp(56px, 6.5vw, 96px)", margin: "16px 0 24px", lineHeight: 0.92 }}>
            The reel posts. The blast goes out 4 minutes later.
          </h2>
          <p style={{ fontSize: 17, color: "var(--ink-soft)", maxWidth: 480, lineHeight: 1.5 }}>
            Your sphere doesn't all live on Instagram. REAL ME AI pulls the same listing into a
            beautiful email — segmented to your buyers' price range and area — and sends it
            without you opening Mailchimp.
          </p>
          <div style={{ marginTop: 32, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, maxWidth: 460, borderTop: "1px solid var(--rule)" }}>
            <BigStat n={51} suffix="%" label="avg open rate" />
            <BigStat n={18} suffix="%" label="click-through to listing" border />
            <BigStat n={1840} label="buyers in your sphere" />
            <BigStat n={47} prefix="$" label="cost per booked showing" border />
          </div>
        </div>
      </div>
    </section>
  );
}

function BigStat({ n, prefix = "", suffix = "", label, border }) {
  const v = useCount(n, 1400);
  return (
    <div style={{
      padding: "18px 0 18px 0",
      paddingLeft: border ? 18 : 0,
      borderLeft: border ? "1px solid var(--rule)" : "none",
      borderBottom: "1px solid var(--rule)",
    }}>
      <div className="display" style={{ fontSize: 44, lineHeight: 1 }}>
        {prefix}{v.toLocaleString()}{suffix}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6, fontFamily: "var(--font-mono)" }}>{label}</div>
    </div>
  );
}

function EmailMockup() {
  return (
    <div style={{ position: "relative" }}>
      <div className="card" style={{ padding: 0, overflow: "hidden", background: "#fff" }}>
        {/* email chrome */}
        <div style={{ padding: "10px 14px", background: "var(--bg)", borderBottom: "1px solid var(--rule)", display: "flex", gap: 8, alignItems: "center", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#FF5F57" }} />
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#FEBC2E" }} />
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#28C840" }} />
          <span style={{ marginLeft: 12 }}>jordan@bayline.com → 1,840 buyers in &gt;$1.5M segment</span>
        </div>
        <div style={{ padding: "22px 26px 14px", borderBottom: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>FROM JORDAN @ BAYLINE · TODAY 9:04 AM</div>
          <div style={{ fontSize: 22, fontFamily: "var(--font-display)", fontWeight: 700, marginTop: 4, letterSpacing: "-0.02em" }}>
            New in Berkeley Hills — 1471 Sunset Ridge, $2.495M
          </div>
        </div>
        <div style={{ padding: 26 }}>
          <ListingThumb listing={LISTINGS[0]} height={220} />
          <div style={{ marginTop: 18, fontSize: 14, lineHeight: 1.6, color: "var(--ink)" }}>
            Hey Priya — just listed a mid-century four-bedroom up on Sunset Ridge that I
            think hits everything on your wishlist. Walnut paneling, original tilework, and
            a primary suite with a view all the way to the Bay.
          </div>
          <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
            <button className="btn btn-primary btn-sm">Watch 32-second tour</button>
            <button className="btn btn-outline btn-sm">Book a private showing</button>
          </div>
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--rule)", fontSize: 11, color: "var(--ink-soft)", display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)" }}>
            <span>Generated by REAL ME AI · 0 manual edits</span>
            <span>SENT 9:04 AM</span>
          </div>
        </div>
      </div>

      {/* floating segment chip */}
      <div style={{
        position: "absolute", top: -14, right: -14,
        background: "var(--ink)", color: "var(--bg-warm)",
        padding: "8px 14px",
        borderRadius: 999, fontSize: 12, fontWeight: 500,
        boxShadow: "var(--shadow-pop)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--lime)" }} />
        Auto-segmented · 1,840 of 4,201 contacts
      </div>
    </div>
  );
}

// ====== LEADS / PIPELINE ======
export function LeadsSection() {
  const isMobile = useIsMobile();
  return (
    <section id="leads" style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "80px 20px 60px" : "140px 32px 100px" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "start" : "end", marginBottom: isMobile ? 32 : 56, gap: isMobile ? 20 : 40 }}>
        <h2 className="display" style={{ fontSize: isMobile ? "clamp(38px, 11vw, 56px)" : "clamp(56px, 7vw, 108px)", margin: 0, lineHeight: 0.92, maxWidth: 1000 }}>
          Every reel is a<br />lead-gen machine.
        </h2>
        <div style={{ maxWidth: isMobile ? "100%" : 360, color: "var(--ink-soft)", fontSize: 15, lineHeight: 1.5 }}>
          DM replies, comments, email clicks, website visits — all pulled into one pipeline.
          REAL ME AI scores each lead and tells you who to call before noon.
        </div>
      </div>

      <PipelineMini isMobile={isMobile} />
    </section>
  );
}

function PipelineMini({ isMobile }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(5, minmax(180px, 1fr))" : "repeat(5, 1fr)", gap: 14, maxWidth: "100%", overflowX: isMobile ? "auto" : "visible" }}>
      {STAGES.map(stage => {
        const items = LEADS.filter(l => l.stage === stage.id);
        return (
          <div key={stage.id} className="card" style={{ padding: 14, minHeight: 320, background: "var(--bg-card)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{stage.label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-soft)" }}>{items.length} {items.length === 1 ? "lead" : "leads"}</div>
              </div>
              <div style={{ width: 10, height: 10, background: stage.tint, borderRadius: 3, border: "1px solid var(--rule)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map(l => {
                const listing = LISTINGS.find(li => li.id === l.interest);
                return (
                  <div key={l.id} style={{
                    border: "1px solid var(--rule)", borderRadius: 10, padding: 10,
                    background: "var(--bg-warm)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{l.name}</div>
                      {l.hot && <span style={{ fontSize: 9, color: "var(--coral)", fontFamily: "var(--font-mono)" }}>● HOT</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--ink-soft)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                      {l.source}
                    </div>
                    <div style={{ marginTop: 6, height: 16, borderRadius: 3, ...listingBg(listing) }} />
                    <div style={{ marginTop: 6, fontSize: 10, fontFamily: "var(--font-mono)", display: "flex", justifyContent: "space-between" }}>
                      <span>{priceShort(l.budget)}</span>
                      <span style={{ color: l.score >= 85 ? "var(--coral)" : "var(--ink-soft)" }}>{l.score}/100</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ====== PRICING ======
export function Pricing({ onOpenApp }) {
  const tiers = [
    {
      name: "Solo",
      price: 149,
      blurb: "For one agent listing fewer than 20 homes a year.",
      features: ["1 AI agent twin", "Up to 15 reels per month", "1 connected MLS", "Email blasts to 1,000 contacts", "All 6 video templates"],
      cta: "Start 14-day trial",
    },
    {
      name: "Growth",
      price: 349,
      featured: true,
      tag: "Top producers pick this",
      blurb: "For agents running 40+ listings and a full sphere.",
      features: ["1 AI agent twin", "Unlimited reels", "MLS + IDX + CRM sync", "Email + SMS to 10k contacts", "Custom voice cloning", "Priority render queue", "Showings auto-booked to calendar"],
      cta: "Start 14-day trial",
    },
    {
      name: "Team",
      price: 899,
      blurb: "For brokerages of 4+ agents with a marketing lead.",
      features: ["Up to 8 AI twins", "Unlimited reels & email", "Shared brand kit & templates", "Roles + approval workflow", "Dedicated success manager", "Custom landing pages per agent"],
      cta: "Book a walkthrough",
    },
  ];
  const isMobile = useIsMobile();
  return (
    <section id="pricing" style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "80px 20px 60px" : "140px 32px 80px" }}>
      <div style={{ marginBottom: isMobile ? 36 : 56 }}>
        <span className="eyebrow">Pricing</span>
        <h2 className="display" style={{ fontSize: isMobile ? "clamp(40px, 11vw, 64px)" : "clamp(64px, 8vw, 128px)", margin: "16px 0 16px", lineHeight: 0.92 }}>
          One reel pays for the month.
        </h2>
        <p style={{ fontSize: 17, color: "var(--ink-soft)", maxWidth: 600 }}>
          Every plan includes a 14-day trial. No card up front. Cancel any time.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.2fr 1fr", gap: 0, alignItems: "stretch", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
        {tiers.map((t, i) => (
          <div key={t.name} style={{
            padding: t.featured ? "44px 32px 36px" : "44px 28px 36px",
            position: "relative",
            background: t.featured ? "var(--ink)" : "transparent",
            color: t.featured ? "var(--bg-warm)" : "var(--ink)",
            borderLeft: !isMobile && i > 0 ? "1px solid var(--rule)" : "none",
            borderTop: isMobile && i > 0 ? "1px solid var(--rule)" : "none",
            display: "flex", flexDirection: "column",
            minHeight: isMobile ? 0 : 540,
          }}>
            {t.featured && (
              <div style={{
                position: "absolute", top: -14, left: 32,
                background: "var(--lime)", color: "var(--ink)",
                padding: "6px 14px",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                fontFamily: "var(--font-mono)", textTransform: "uppercase",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}><Star size={11} fill="currentColor" /> {t.tag}</div>
            )}
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: t.featured ? "rgba(246,242,234,0.55)" : "var(--ink-soft)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {t.name}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8, marginBottom: 12 }}>
              <span className="display" style={{ fontSize: t.featured ? 92 : 72, lineHeight: 1 }}>${t.price}</span>
              <span style={{ color: t.featured ? "rgba(246,242,234,0.55)" : "var(--ink-soft)", fontSize: 14 }}>/mo</span>
            </div>
            <p style={{ fontSize: 14, color: t.featured ? "rgba(246,242,234,0.7)" : "var(--ink-soft)", lineHeight: 1.5, margin: "0 0 28px", maxWidth: 320 }}>{t.blurb}</p>

            <ul className="clean" style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, marginBottom: 24 }}>
              {t.features.map((f, j) => (
                <li key={j} style={{ display: "flex", alignItems: "start", gap: 10, fontSize: 14, paddingBottom: 8, borderBottom: j < t.features.length - 1 ? "1px solid " + (t.featured ? "rgba(246,242,234,0.1)" : "var(--rule-soft)") : "none" }}>
                  <span style={{ marginTop: 6, opacity: 0.4, fontSize: 11, fontFamily: "var(--font-mono)", flexShrink: 0 }}>{String(j + 1).padStart(2, "0")}</span>
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={onOpenApp} className={t.featured ? "btn btn-lime" : "btn btn-outline"} style={{ width: "100%", justifyContent: "center", padding: "14px 18px" }}>
              {t.cta} →
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ====== FINAL CTA + FOOTER ======
export function FinalCTA({ onOpenApp }) {
  const isMobile = useIsMobile();
  return (
    <section style={{
      background: "var(--lime)",
      padding: isMobile ? "80px 0" : "140px 0 140px",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "0 20px" : "0 32px", textAlign: "center", position: "relative", zIndex: 2 }}>
        <span className="eyebrow">Your move</span>
        <h2 className="display" style={{
          fontSize: isMobile ? "clamp(48px, 14vw, 72px)" : "clamp(72px, 10vw, 160px)",
          margin: "16px auto 24px",
          maxWidth: 1100,
        }}>
          Stop posting.<br />Start closing.
        </h2>
        <p style={{ fontSize: 19, color: "var(--ink)", maxWidth: 560, margin: "0 auto 36px", lineHeight: 1.4 }}>
          Connect your MLS in 60 seconds. Your first reel is ready before your coffee.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onOpenApp} className="btn btn-primary" style={{ padding: "16px 26px", fontSize: 16 }}>
            Open dashboard →
          </button>
          <button className="btn btn-outline" style={{ padding: "16px 26px", fontSize: 16 }}>
            Book a 15-min walkthrough
          </button>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const isMobile = useIsMobile();
  return (
    <footer style={{ background: "var(--ink)", color: "var(--bg-warm)", padding: isMobile ? "64px 0 40px" : "100px 0 40px", overflow: "hidden" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "0 20px" : "0 32px" }}>
        {/* Massive wordmark */}
        <div className="display" style={{
          fontSize: isMobile ? "clamp(72px, 26vw, 120px)" : "clamp(120px, 22vw, 360px)",
          lineHeight: 0.85,
          letterSpacing: "-0.05em",
          marginBottom: -20,
        }}>
          Real<span style={{ color: "var(--lime)" }}>Me.</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 40, paddingTop: 40, paddingBottom: 40, borderBottom: "1px solid rgba(246,242,234,0.15)", flexWrap: "wrap" }}>
          <div style={{ maxWidth: 480, fontSize: 17, lineHeight: 1.5, color: "rgba(246,242,234,0.85)" }}>
            The AI marketing agent for real estate agents.
            Generate every reel, every email, every post — without lifting a finger.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-lime" style={{ padding: "14px 22px", fontSize: 14 }}>Start free trial →</button>
            <button className="btn btn-ghost" style={{ color: "var(--bg-warm)", border: "1px solid rgba(246,242,234,0.25)", padding: "14px 22px", fontSize: 14 }}>Book a walkthrough</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 28 : 40, paddingTop: 40 }}>
          <FooterCol title="Product" links={["AI Reels", "Calendar", "Email", "Pipeline", "Integrations"]} />
          <FooterCol title="For" links={["Solo agents", "Top producers", "Brokerages", "Property managers"]} />
          <FooterCol title="Company" links={["About", "Customers", "Careers", "Press"]} />
          <FooterCol title="Legal" links={["Privacy", "Terms", "MLS compliance", "AI policy"]} />
        </div>

        <div style={{ marginTop: 48, paddingTop: 20, borderTop: "1px solid rgba(246,242,234,0.1)", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", fontSize: 11, color: "rgba(246,242,234,0.45)", fontFamily: "var(--font-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          <span>© 2026 REAL ME AI Labs · MLS compliant in 47 states</span>
          <span>Made in Oakland · 100% on-device avatar training</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(246,242,234,0.4)", paddingBottom: 12, borderBottom: "1px solid rgba(246,242,234,0.1)" }}>{title}</div>
      <ul className="clean" style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {links.map(l => <li key={l}><a href="#" style={{ color: "rgba(246,242,234,0.85)", fontSize: 14 }}>{l}</a></li>)}
      </ul>
    </div>
  );
}
