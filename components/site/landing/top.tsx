// @ts-nocheck
/* eslint-disable */
"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { AGENT, LISTINGS, CheckIcon, listingBg, priceShort, useCount, useIsMobile } from "@/components/site/shared";
import { Heart, MessageCircle, ArrowUpRight } from "lucide-react";

// RealMe — Landing page

export function Logo({ size = 22, href = "/" }) {
  return (
    <a
      href={href}
      aria-label="RealMe home"
      style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}
    >
      <div style={{
        width: size, height: size, borderRadius: 6,
        background: "var(--ink)", color: "var(--lime)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-display)", fontWeight: 800,
        fontSize: size * 0.6, letterSpacing: "-0.05em",
      }}>R</div>
      <span style={{
        fontFamily: "var(--font-display)", fontWeight: 800, fontSize: size * 0.85,
        letterSpacing: "-0.03em", color: "var(--ink)",
      }}>RealMe</span>
    </a>
  );
}

export function TopNav({ onOpenApp, onOpenLive, authed = false }) {
  const isMobile = useIsMobile();
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(242,238,229,0.85)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--rule-soft)",
      maxWidth: "100%", overflowX: "hidden",
    }}>
      <div style={{
        maxWidth: 1400, margin: "0 auto", padding: isMobile ? "12px 20px" : "14px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: isMobile ? 10 : 0,
      }}>
        <Logo size={26} />
        {!isMobile && (
          <div style={{ display: "flex", gap: 24, alignItems: "center", fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>
            <a href="#how">How it works</a>
            <a href="#demo">Live demo</a>
            <a href="#calendar">Calendar</a>
            <a href="#email">Email</a>
            <a href="#rentals" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Rentals
              <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", padding: "2px 5px", borderRadius: 4, background: "var(--coral)", color: "#fff", fontWeight: 700, letterSpacing: "0.04em" }}>NEW</span>
            </a>
            <a href="#pricing">Pricing</a>
          </div>
        )}
        <div style={{ display: "flex", gap: isMobile ? 8 : 10, alignItems: "center" }}>
          {onOpenLive && !isMobile && (
            <button className="btn btn-ghost btn-sm" onClick={onOpenLive} style={{ fontFamily: "var(--font-mono)", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
              realme.live <ArrowUpRight size={14} />
            </button>
          )}
          {/* Signed-in users already have the "Open dashboard" CTA — a "Sign in"
              button next to it reads as "you're signed out" and confuses.
              Explicit colors (outline) so it can never inherit a matching tone. */}
          {!isMobile && !authed && (
            <button
              className="btn btn-sm"
              onClick={onOpenApp}
              style={{
                background: "transparent",
                color: "var(--ink)",
                border: "1px solid var(--ink)",
              }}
            >
              Sign in
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={onOpenApp}>
            {isMobile ? "Dashboard →" : "Open dashboard →"}
          </button>
        </div>
      </div>
    </nav>
  );
}

// Fixed bottom action bar — gives the landing a native mobile-app feel on phones.
export function MobileActionBar({ onOpenApp, onOpenLive }) {
  const isMobile = useIsMobile();
  if (!isMobile) return null;
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60,
      display: "flex", gap: 10, padding: "10px 16px",
      paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
      background: "rgba(242,238,229,0.92)", backdropFilter: "blur(14px)",
      borderTop: "1px solid var(--rule-soft)",
      boxShadow: "0 -4px 24px rgba(0,0,0,0.06)",
    }}>
      <button className="btn btn-primary" onClick={onOpenApp} style={{ flex: 1, justifyContent: "center", padding: "14px 18px", fontSize: 15 }}>
        Open dashboard →
      </button>
      {onOpenLive && (
        <button className="btn btn-outline" onClick={onOpenLive} style={{ justifyContent: "center", padding: "14px 16px", fontSize: 14, display: "inline-flex", alignItems: "center", gap: 5 }}>
          Live <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}

// ====== HERO ======

export function Hero({ onOpenApp }) {
  const isMobile = useIsMobile();
  return (
    <section style={{
      maxWidth: 1400, margin: "0 auto",
      padding: isMobile ? "48px 20px 32px" : "84px 32px 40px",
      position: "relative",
    }}>
      <h1 className="display" style={{
        fontSize: isMobile ? "clamp(40px, 13vw, 72px)" : "clamp(72px, 11vw, 168px)",
        margin: 0,
        maxWidth: 1300,
      }}>
        Be everywhere.<br />
        Without <span style={{ position: "relative", display: "inline-block" }}>
          being
          <svg viewBox="0 0 220 22" style={{
            position: "absolute", left: 0, bottom: -8, width: "100%", height: 18,
          }}>
            <path d="M2 14 Q 55 2, 110 12 T 218 8" fill="none" stroke="var(--lime)" strokeWidth="11" strokeLinecap="round" />
          </svg>
        </span> everywhere.
      </h1>

      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1fr", gap: isMobile ? 40 : 80, marginTop: isMobile ? 36 : 64,
        alignItems: "end",
      }}>
        <div>
          <p style={{
            fontSize: 24, lineHeight: 1.32, color: "var(--ink)",
            maxWidth: 560, margin: 0, fontWeight: 400, letterSpacing: "-0.01em",
          }}>
            An AI marketing agent for real estate agents. RealMe pulls every listing,
            generates videos of you talking about each one, posts them across
            Instagram, TikTok, YouTube — then writes the email blast and books the
            showings.
          </p>

          <div style={{ display: "flex", gap: 14, marginTop: 40, alignItems: "center" }}>
            <button className="btn btn-primary" onClick={onOpenApp} style={{ padding: "16px 24px", fontSize: 15 }}>
              See it work on my listings →
            </button>
            <button style={{ fontSize: 14, fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 4 }}>
              Watch 2-min demo
            </button>
          </div>
        </div>

        <HeroDemo />
      </div>
    </section>
  );
}

function Stat({ n, suffix = "", label, decimals = 0 }) {
  const v = useCount(n, 1500);
  const display = decimals > 0 ? v.toFixed(decimals) : v.toLocaleString();
  return (
    <div>
      <div className="display" style={{ fontSize: 36, letterSpacing: "-0.04em" }}>
        {display}<span style={{ color: "var(--ink-soft)" }}>{suffix}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

// Hero centerpiece: phone with AI-generated reel + ONE floating moment
function HeroDemo() {
  const [tick, setTick] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 80);
    return () => clearInterval(i);
  }, []);

  return (
    <div style={{
      position: "relative",
      minHeight: isMobile ? 560 : 620,
      width: "100%", maxWidth: "100%", overflowX: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* The phone */}
      <div className="phone" style={{ zIndex: 3, maxWidth: "100%" }}>
        <div className="phone-notch"></div>
        <div className="phone-screen">
          <PhoneReel tick={tick} />
        </div>
      </div>

      {/* ONE floating moment: the listing this reel is about */}
      <div style={{
        position: "absolute", top: 80, right: isMobile ? 0 : 0, zIndex: 4,
        width: isMobile ? 180 : 220, maxWidth: "calc(100% - 16px)", background: "var(--bg-card)",
        borderRadius: 14, boxShadow: "var(--shadow-pop)",
        transform: "rotate(3deg)",
        border: "1px solid var(--rule)",
        overflow: "hidden",
      }}>
        <div style={{
          height: 110, ...listingBg(LISTINGS[0]),
        }} />
        <div style={{ padding: "10px 12px" }}>
          <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", letterSpacing: "0.1em" }}>POSTING ABOUT</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2, letterSpacing: "-0.01em" }}>{LISTINGS[0].address}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)" }}>{LISTINGS[0].city.split(",")[0]}</span>
            <span className="display" style={{ fontSize: 14 }}>{priceShort(LISTINGS[0].price)}</span>
          </div>
        </div>
      </div>

      {/* ONE status pill — a toast attached to the phone's bottom */}
      <div style={{
        position: "absolute", bottom: isMobile ? 28 : 36, left: "50%",
        transform: "translateX(-50%)", zIndex: 4,
        maxWidth: "calc(100% - 16px)",
        background: "var(--ink)", color: "var(--bg-warm)",
        padding: "10px 16px", borderRadius: 999,
        display: "flex", alignItems: "center", gap: 10,
        fontSize: isMobile ? 11 : 12, fontWeight: 500,
        whiteSpace: isMobile ? "normal" : "nowrap", textAlign: "center",
        boxShadow: "var(--shadow-pop)",
      }}>
        <CheckIcon size={12} /> Posted to Instagram, TikTok, YouTube · 2 min ago
      </div>
    </div>
  );
}

// CheckIcon is provided globally by shared.jsx

// Phone reel content
function PhoneReel({ tick }) {
  const captions = [
    "OK so —",
    "this Berkeley Hills",
    "mid-century",
    "is a 10.",
    "Four beds.",
    "Original walnut paneling.",
    "Asking $2.495M.",
  ];
  const captionIdx = Math.floor((tick / 20) % captions.length);
  const progress = (tick % 100) / 100;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#1a1818", overflow: "hidden" }}>
      {/* Listing photo background — Ken Burns */}
      <div style={{
        position: "absolute", inset: 0,
        ...listingBg(LISTINGS[0]),
        transform: `scale(${1.05 + Math.sin(tick / 80) * 0.025}) translateX(${Math.sin(tick / 60) * 4}px)`,
      }} />
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 100%)",
      }} />

      {/* Agent — real photo bubble */}
      <div style={{
        position: "absolute", left: "50%", top: "55%",
        transform: `translate(-50%, -50%) scale(${1 + Math.sin(tick / 40) * 0.015})`,
        width: 160, height: 160, borderRadius: "50%", overflow: "hidden",
        border: "4px solid var(--lime)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
        backgroundImage: `url(${AGENT.photo})`,
        backgroundSize: "cover", backgroundPosition: "center top",
      }} />

      {/* Caption */}
      <div style={{
        position: "absolute", bottom: 110, left: 16, right: 16,
        textAlign: "center",
      }}>
        <span style={{
          background: "var(--lime)", color: "var(--ink)",
          fontFamily: "var(--font-display)", fontWeight: 800,
          fontSize: 22, padding: "4px 10px",
          letterSpacing: "-0.02em", borderRadius: 4,
          boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone",
          lineHeight: 1.4,
        }}>
          {captions[captionIdx]}
        </span>
      </div>

      {/* Top bar */}
      <div style={{
        position: "absolute", top: 50, left: 14, right: 14,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        color: "#fff", fontSize: 11,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--lime)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800 }}>JM</div>
          <span style={{ fontWeight: 600 }}>jordan.maes</span>
          <span style={{ background: "rgba(255,255,255,0.2)", padding: "1px 6px", borderRadius: 999, fontSize: 9, fontWeight: 600 }}>Follow</span>
        </div>
        <div style={{ fontSize: 14 }}>•••</div>
      </div>

      {/* Right rail (likes etc) */}
      <div style={{
        position: "absolute", right: 10, bottom: 110,
        display: "flex", flexDirection: "column", gap: 14, alignItems: "center",
        color: "#fff", fontSize: 10, fontFamily: "var(--font-mono)",
      }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><Heart size={14} /><div>4.2k</div></div>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><MessageCircle size={14} /><div>318</div></div>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}><ArrowUpRight size={14} /><div>902</div></div>
      </div>

      {/* Bottom progress */}
      <div style={{
        position: "absolute", bottom: 14, left: 14, right: 14,
        height: 2, background: "rgba(255,255,255,0.2)", borderRadius: 99, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", background: "var(--lime)",
          width: `${progress * 100}%`,
        }} />
      </div>
    </div>
  );
}

// ====== TRUST / NUMBERS BAND ======
export function TrustMarquee() {
  const logos = [
    "BAYLINE", "COASTAL & CO.", "MERIDIAN PROP.", "OAKSWORTH",
    "PIEDMONT REALTY", "URBAN COMPASS", "STONEBRIDGE",
    "RIDGELINE HOMES", "HARBOR & GROVE", "MAINLINE",
  ];
  const all = [...logos, ...logos];
  const isMobile = useIsMobile();
  return (
    <div style={{ background: "var(--bg)", marginTop: 80, borderTop: "8px solid var(--ink)", borderBottom: "8px solid var(--ink)", maxWidth: "100%", overflowX: "hidden" }}>
      {/* Stats row */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "32px 20px" : "44px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? 24 : 0 }}>
          <BigNumber n={4200} suffix="+" label="agents posting daily" />
          <BigNumber n={1.2} suffix="M" label="videos generated" decimals={1} divider />
          <BigNumber n={38} suffix="%" label="avg lift in showings booked" divider />
        </div>
      </div>
      {/* Logo marquee */}
      <div style={{
        borderTop: "1px solid var(--rule)",
        padding: "20px 0", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 32px 12px", maxWidth: 1400, margin: "0 auto" }}>
          <span className="eyebrow">Brokerages running on RealMe</span>
        </div>
        <div className="marquee-track">
          {all.map((l, i) => (
            <span key={i} style={{
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26,
              color: "var(--ink-soft)", letterSpacing: "-0.02em", whiteSpace: "nowrap",
            }}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function BigNumber({ n, suffix = "", label, decimals = 0, divider }) {
  const v = useCount(n, 1500);
  const display = decimals > 0 ? v.toFixed(decimals) : v.toLocaleString();
  return (
    <div style={{ paddingLeft: divider ? 32 : 0, borderLeft: divider ? "1px solid var(--rule)" : "none" }}>
      <div className="display" style={{ fontSize: "clamp(56px,7vw,108px)" }}>
        {display}<span style={{ color: "var(--ink-soft)" }}>{suffix}</span>
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4, fontFamily: "var(--font-mono)", letterSpacing: "-0.01em" }}>{label}</div>
    </div>
  );
}

// ====== HOW IT WORKS ======
export function HowItWorks() {
  const steps = [
    {
      n: "01",
      tag: "ONE TIME · 90 SECONDS",
      title: "Train your AI twin",
      body: "Upload one photo or a 30-second clip. RealMe builds a video model of you — your face, your voice, your cadence — locked to your account.",
    },
    {
      n: "02",
      tag: "ALWAYS ON",
      title: "Sync every listing",
      body: "Connect your MLS, IDX, or CRM. New listings, price changes, open houses — everything flows in. No spreadsheets, no copy-paste.",
    },
    {
      n: "03",
      tag: "AUTOPILOT",
      title: "Walk away",
      body: "Daily, weekly, or whenever a listing drops. RealMe writes the script, generates the video, schedules the posts, sends the blast, books the showings.",
    },
  ];
  const isMobile = useIsMobile();
  return (
    <section id="how" style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "80px 20px 60px" : "140px 32px 80px" }}>
      <div style={{ marginBottom: isMobile ? 40 : 64 }}>
        <span className="eyebrow">How it works</span>
        <h2 className="display" style={{ fontSize: isMobile ? "clamp(36px, 9vw, 56px)" : "clamp(56px, 7vw, 108px)", margin: "16px 0 0", maxWidth: 1100 }}>
          Three steps.<br />Then it runs without you.
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)" }}>
        {steps.map((s, i) => (
          <div key={i} style={{
            padding: isMobile ? "24px 0" : "36px 28px 36px 0",
            paddingLeft: !isMobile && i > 0 ? 36 : 0,
            borderLeft: !isMobile && i > 0 ? "1px solid var(--rule)" : "none",
            borderTop: isMobile && i > 0 ? "1px solid var(--rule)" : "none",
            minHeight: isMobile ? 0 : 300, display: "flex", flexDirection: "column",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <div className="display" style={{ fontSize: 84, color: "var(--ink)", lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--ink-soft)" }}>{s.tag}</div>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "end", marginTop: 36 }}>
              <div>
                <h3 className="display" style={{ fontSize: 32, margin: 0, letterSpacing: "-0.03em" }}>{s.title}</h3>
                <p style={{ marginTop: 14, color: "var(--ink-soft)", fontSize: 15, lineHeight: 1.55, maxWidth: 360 }}>{s.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
