// @ts-nocheck
/* eslint-disable */
"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ILS_CHANNELS, UNITS, BUILDINGS, RENTAL_MANAGER, buildingOf, rentShort, useIsMobile } from "@/components/site/shared";

// RealMe — Rentals + RealMe Live landing section
// Drops into the landing page to introduce the rental + ILS extension

export function RentalsAndLiveSection({ onOpenApp, onOpenLive }) {
  const isMobile = useIsMobile();
  return (
    <section id="rentals" style={{
      position: "relative", overflow: "hidden",
      borderTop: "8px solid var(--ink)",
      background: "var(--bg-warm)",
    }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "64px 20px 60px" : "100px 32px 80px" }}>
        {/* Mode tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 36 }}>
          <span className="eyebrow">Also for</span>
          <span className="tag tag-coral" style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: "5px 12px", fontWeight: 700 }}>
            NEW · RENTALS MODE
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1fr", gap: isMobile ? 40 : 80, alignItems: "end" }}>
          <div>
            <h2 className="display" style={{ fontSize: isMobile ? "clamp(40px, 12vw, 72px)" : "clamp(64px, 9vw, 140px)", margin: 0, lineHeight: 1 }}>
              Property managers,<br />
              <span style={{ position: "relative", display: "inline-block" }}>
                lease faster.
                <svg viewBox="0 0 320 22" style={{
                  position: "absolute", left: 0, bottom: -8, width: "100%", height: 16,
                }}>
                  <path d="M2 14 Q 80 2, 160 12 T 318 8" fill="none" stroke="var(--coral)" strokeWidth="10" strokeLinecap="round" />
                </svg>
              </span>
            </h2>
            <p style={{ fontSize: isMobile ? 18 : 22, color: "var(--ink-soft)", maxWidth: 600, lineHeight: 1.4, marginTop: isMobile ? 28 : 48, letterSpacing: "-0.01em" }}>
              Same engine, built for portfolios. Sync every unit, generate a reel per
              vacancy, and push it to <strong style={{ color: "var(--ink)" }}>8 ILSes at once</strong> —
              Zillow, Apartments.com, Zumper, plus our own marketplace
              <strong style={{ color: "var(--coral)" }}> RealMe Live</strong>.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 36, alignItems: "center" }}>
              <button className="btn btn-primary" onClick={onOpenApp} style={{ padding: "16px 24px", fontSize: 15 }}>
                Open rentals dashboard →
              </button>
              <button className="btn btn-outline" onClick={onOpenLive} style={{ padding: "16px 24px", fontSize: 15 }}>
                Visit RealMe Live ↗
              </button>
            </div>
          </div>

          {/* Right: ILS-fan visual */}
          <ILSFanVisual isMobile={isMobile} />
        </div>

        {/* Why rentals are different */}
        <div style={{
          marginTop: isMobile ? 56 : 100, padding: "32px 0 0", borderTop: "1px solid var(--rule)",
          display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 24 : 0,
        }}>
          {[
            { n: "136", l: "units across 4 buildings", s: "Portfolio view" },
            { n: "8", l: "ILS channels per push", s: "One render, eight platforms" },
            { n: "12.4d", l: "avg days vacant", s: "Down from 22d before RealMe" },
            { n: "94%", l: "of tours self-served", s: "SMS code · no agent required" },
          ].map((s, i) => (
            <div key={i} style={{
              padding: isMobile ? "0 16px" : "0 28px",
              borderLeft: !isMobile && i > 0 ? "1px solid var(--rule)" : "none",
            }}>
              <div className="display" style={{ fontSize: 64, lineHeight: 1, letterSpacing: "-0.04em" }}>{s.n}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-soft)", marginTop: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.l}</div>
              <div style={{ fontSize: 13, marginTop: 10, color: "var(--ink-soft)" }}>{s.s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* RealMe Live preview slab */}
      <RealMeLivePreview onOpenLive={onOpenLive} />
    </section>
  );
}

// Fan of ILS cards — visual showing one reel going to many places
function ILSFanVisual({ isMobile }) {
  const channels = ILS_CHANNELS.filter(c => c.syndicated).slice(0, 7);
  return (
    <div style={{ position: "relative", minHeight: isMobile ? 0 : 520, maxWidth: "100%", display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 24 : 0, alignItems: "center", justifyContent: "center" }}>
      {/* Center: the source unit card */}
      <div style={{
        position: "relative", zIndex: 5,
        width: 260, maxWidth: "100%", background: "var(--bg-card)",
        borderRadius: 18, boxShadow: "var(--shadow-pop)",
        border: "1px solid var(--rule)", overflow: "hidden",
      }}>
        <div style={{
          height: 180, position: "relative",
          backgroundImage: `url(${UNITS[0].img})`, backgroundColor: BUILDINGS[0].hero,
          backgroundSize: "cover", backgroundPosition: "center",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 100%)" }} />
          <div style={{ position: "absolute", top: 10, left: 10, fontSize: 10, fontFamily: "var(--font-mono)", color: "#fff", background: "rgba(0,0,0,0.5)", padding: "3px 7px", borderRadius: 4, letterSpacing: "0.06em", backdropFilter: "blur(4px)" }}>
            ▶ ONE REEL · 32s
          </div>
          <div style={{ position: "absolute", left: 12, bottom: 10, color: "#fff" }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>{BUILDINGS[0].name} #412</div>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", opacity: 0.9 }}>{UNITS[0].type} · {rentShort(UNITS[0].rent)}/mo</div>
          </div>
        </div>
        <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            backgroundImage: `url(${RENTAL_MANAGER.photo})`, backgroundSize: "cover", backgroundPosition: "center top",
            boxShadow: "0 0 0 2px var(--lime)",
          }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Sasha · live agent reel</div>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>Linden Park Residential</div>
          </div>
        </div>
      </div>

      {/* Fan of ILS destination chips */}
      {isMobile ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: "100%" }}>
          {channels.map((c) => (
            <div key={c.id} style={{
              background: "var(--bg-card)", borderRadius: 12,
              padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
              border: "1px solid var(--rule)", boxShadow: "var(--shadow-card)",
              whiteSpace: "nowrap",
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: 6,
                background: c.tint, color: c.ink,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14,
              }}>{c.logo}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "-0.01em" }}>{c.name}</div>
                <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{c.reach}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {channels.map((c, i) => {
            const angle = (i - (channels.length - 1) / 2) * 24;
            const radius = 240;
            const rad = (angle * Math.PI) / 180;
            return (
              <div key={c.id} style={{
                position: "absolute", zIndex: 2,
                left: `calc(50% + ${Math.sin(rad) * radius}px)`,
                top: `calc(50% + ${-Math.cos(rad) * radius * 0.55 - 30}px)`,
                transform: `translate(-50%, -50%) rotate(${angle * 0.3}deg)`,
                background: "var(--bg-card)", borderRadius: 12,
                padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
                border: "1px solid var(--rule)", boxShadow: "var(--shadow-card)",
                whiteSpace: "nowrap",
              }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: c.tint, color: c.ink,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14,
                }}>{c.logo}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "-0.01em" }}>{c.name}</div>
                  <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{c.reach}</div>
                </div>
              </div>
            );
          })}

          {/* Connecting lines */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: "none" }} viewBox="0 0 600 520" preserveAspectRatio="none">
            {channels.map((c, i) => {
              const angle = (i - (channels.length - 1) / 2) * 24;
              const radius = 240;
              const rad = (angle * Math.PI) / 180;
              const x2 = 300 + Math.sin(rad) * radius;
              const y2 = 260 + -Math.cos(rad) * radius * 0.55 - 30;
              return (
                <line key={c.id} x1="300" y1="260" x2={x2} y2={y2} stroke="var(--rule)" strokeWidth="1" strokeDasharray="3 4" />
              );
            })}
          </svg>
        </>
      )}
    </div>
  );
}

// Preview of the RealMe Live marketplace within the landing
function RealMeLivePreview({ onOpenLive }) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      background: "var(--ink)", color: "var(--bg-warm)",
      padding: isMobile ? "56px 0 64px" : "80px 0 90px", marginTop: 60, position: "relative", overflow: "hidden",
    }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "0 20px" : "0 32px" }}>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 20 : 0, justifyContent: "space-between", alignItems: isMobile ? "start" : "end", marginBottom: isMobile ? 28 : 48 }}>
          <div>
            <span className="eyebrow" style={{ color: "rgba(246,242,234,0.55)" }}>RealMe Live · the in-house marketplace</span>
            <h2 className="display" style={{ fontSize: isMobile ? "clamp(32px, 9vw, 48px)" : "clamp(48px, 6vw, 84px)", margin: "12px 0 0", maxWidth: 980, lineHeight: 0.95 }}>
              Your units, on a marketplace<br />where every listing has a <span style={{ color: "var(--coral)" }}>face</span>.
            </h2>
          </div>
          <button onClick={onOpenLive} className="btn btn-lime" style={{ padding: "14px 20px", fontSize: 14 }}>
            Open RealMe Live →
          </button>
        </div>

        {/* Browser frame preview */}
        <div style={{
          background: "#0e0c0b", borderRadius: 16, overflow: "hidden",
          border: "1px solid #2a2725", boxShadow: "0 40px 80px -20px rgba(0,0,0,0.5)",
        }}>
          {/* Browser chrome */}
          <div style={{ background: "#1a1817", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #2a2725" }}>
            <div style={{ display: "flex", gap: 6 }}>
              {["#FF5F57", "#FEBC2E", "#28C840"].map((c, i) => (
                <span key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />
              ))}
            </div>
            <div style={{ flex: 1, background: "#0e0c0b", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontFamily: "var(--font-mono)", color: "rgba(246,242,234,0.6)", maxWidth: 480, margin: "0 auto", display: "flex", gap: 6 }}>
              <span style={{ color: "rgba(246,242,234,0.4)" }}>https://</span>realme.live<span style={{ color: "rgba(246,242,234,0.4)" }}>/oakland</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, padding: isMobile ? 14 : 24, background: "var(--bg)" }}>
            {UNITS.slice(0, 4).map(u => {
              const b = buildingOf(u.id);
              return (
                <div key={u.id} style={{ borderRadius: 14, overflow: "hidden", background: "var(--bg-card)", border: "1px solid var(--rule)" }}>
                  <div style={{
                    height: 160, position: "relative",
                    backgroundImage: `url(${u.img})`, backgroundColor: b.hero,
                    backgroundSize: "cover", backgroundPosition: "center",
                  }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 100%)" }} />
                    {u.concession && (
                      <span style={{ position: "absolute", top: 8, left: 8, background: "var(--coral)", color: "#fff", fontSize: 9, fontFamily: "var(--font-mono)", padding: "3px 6px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.04em" }}>
                        ⚡ {u.concession.toUpperCase()}
                      </span>
                    )}
                    <div style={{
                      position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                      width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.92)",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink)", fontSize: 12,
                    }}>▶</div>
                    <div style={{ position: "absolute", left: 10, bottom: 8, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
                      <div className="display" style={{ fontSize: 20, lineHeight: 1 }}>{rentShort(u.rent)}<span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>/mo</span></div>
                    </div>
                  </div>
                  <div style={{ padding: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{b.name} {u.unit}</div>
                    <div style={{ fontSize: 10, color: "var(--ink-soft)", marginTop: 2 }}>{u.type} · {u.sqft.toLocaleString()} sqft</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p style={{ marginTop: 24, fontSize: 13, color: "rgba(246,242,234,0.55)", textAlign: "center", fontFamily: "var(--font-mono)" }}>
          18,420 views last month · 1.8% inquiry conversion · 12.4 day avg time-to-lease
        </p>
      </div>
    </div>
  );
}
