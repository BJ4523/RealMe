// @ts-nocheck
/* eslint-disable */
"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  BUILDINGS,
  UNITS,
  RENTAL_MANAGER,
  RENTAL_LEADS,
  ILS_CHANNELS,
  LEASE_STAGES,
  CONCESSION_PRESETS,
  Avatar,
  MiniChart,
  rentShort,
  unitsOf,
  buildingOf,
  findUnit,
  useIsMobile,
} from "@/components/site/shared";

function statusPillUnit(status) {
  const map = {
    available: { label: "Available",  bg: "var(--lime)",        color: "var(--ink)",   dot: "var(--ok)" },
    on_hold:   { label: "On hold",    bg: "var(--coral-soft)",  color: "#8a1d05",      dot: "var(--coral)" },
    leased:    { label: "Leased",     bg: "var(--bg)",          color: "var(--ink-soft)", dot: "var(--ink-faint)" },
  };
  const m = map[status] || map.available;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 11, fontFamily: "var(--font-mono)",
      padding: "3px 8px", borderRadius: 999,
      background: m.bg, color: m.color, textTransform: "uppercase", letterSpacing: "0.06em",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.dot }} />
      {m.label}
    </span>
  );
}

function ChannelChip({ ch, big = false }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: big ? 12 : 11, fontFamily: "var(--font-mono)",
      padding: big ? "5px 10px 5px 5px" : "3px 8px 3px 3px",
      borderRadius: 999, background: "var(--bg)", border: "1px solid var(--rule)",
    }}>
      <span style={{
        width: big ? 18 : 14, height: big ? 18 : 14, borderRadius: 4,
        background: ch.tint, color: ch.ink,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-display)", fontWeight: 800, fontSize: big ? 10 : 8,
      }}>{ch.logo}</span>
      {ch.name}
    </span>
  );
}

// ====== RENTAL TODAY VIEW ======
export function RentalTodayView({ setSection }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <RentalHeroToday setSection={setSection} />
        <RentalOccupancyBoard />
        <RentalPerformance />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <RentalQuickActions setSection={setSection} />
        <RentalUpNext />
        <RentalDigest />
      </div>
    </div>
  );
}

function RentalHeroToday({ setSection }) {
  const isMobile = useIsMobile();
  const stale = UNITS.find(u => u.daysOnMarket > 12 && u.status === "available");
  const building = BUILDINGS.find(b => b.id === stale.buildingId);
  return (
    <div style={{
      background: "var(--ink)", color: "var(--bg-warm)",
      borderRadius: 20, padding: isMobile ? 20 : 28, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", right: -60, top: -60, width: 280, height: 280, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,90,60,0.28), transparent 60%)",
      }} />
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "start", gap: isMobile ? 16 : 28 }}>
        <div style={{ flex: 1, position: "relative", zIndex: 1 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: "var(--font-mono)", fontSize: 11,
            padding: "5px 10px", borderRadius: 999,
            background: "rgba(255,90,60,0.18)", color: "#FFD3C7",
            border: "1px solid rgba(255,90,60,0.3)",
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--coral)" }} />
            Slow mover · {stale.daysOnMarket} days listed
          </span>
          <h2 className="display" style={{ fontSize: isMobile ? 30 : 44, margin: "16px 0 12px", letterSpacing: "-0.03em", lineHeight: 0.98 }}>
            {building.name} {stale.unit} isn't<br />moving. Add a concession?
          </h2>
          <p style={{ fontSize: 15, color: "rgba(246,242,234,0.75)", maxWidth: 540, lineHeight: 1.5 }}>
            <strong style={{ color: "var(--bg-warm)" }}>{stale.type} · {rentShort(stale.rent)}/mo</strong> —
            inquiries down 32% week-over-week. RealMe suggests "two weeks free" + a
            fresh price-drop reel. Posts to 8 ILSes the same minute you say yes.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button className="btn btn-lime" onClick={() => setSection("concessions")} style={{ fontSize: 14 }}>
              Run the concession campaign →
            </button>
            <button className="btn btn-ghost" style={{ color: "var(--bg-warm)", fontSize: 14 }}>See it on RealMe Live</button>
          </div>
        </div>
        <div style={{
          width: isMobile ? "100%" : 180, height: isMobile ? 160 : 220, borderRadius: 14, flexShrink: 0,
          backgroundImage: `url(${stale.img})`, backgroundSize: "cover", backgroundPosition: "center",
          border: "1px solid rgba(246,242,234,0.1)",
          position: "relative", zIndex: 1, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 50%)" }} />
          <div style={{ padding: 12, color: "#fff", fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", position: "relative" }}>
            {building.name.toUpperCase()} · {stale.unit}
          </div>
        </div>
      </div>
    </div>
  );
}

function RentalOccupancyBoard() {
  const isMobile = useIsMobile();
  return (
    <div className="card" style={{ padding: isMobile ? 18 : 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <span className="eyebrow">Portfolio · live occupancy</span>
          <div className="display" style={{ fontSize: 22, marginTop: 4 }}>{BUILDINGS.length} buildings, {RENTAL_MANAGER.units} units</div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="display" style={{ fontSize: 30 }}>{Math.round(RENTAL_MANAGER.occupancy * 100)}%</span>
          <span style={{ fontSize: 11, color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>OCCUPIED</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 12 }}>
        {BUILDINGS.map(b => {
          const occupied = b.units - b.vacant;
          const pct = occupied / b.units;
          return (
            <div key={b.id} style={{
              display: "flex", gap: 12, padding: 14,
              border: "1px solid var(--rule)", borderRadius: 14,
              background: "var(--bg-warm)",
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: 10, flexShrink: 0,
                backgroundImage: `url(${b.img})`, backgroundColor: b.hero,
                backgroundSize: "cover", backgroundPosition: "center",
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em" }}>{b.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: b.vacant > 5 ? "var(--coral)" : "var(--ink-soft)" }}>
                    {b.vacant} vacant
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                  {b.city}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1, height: 5, background: "var(--bg)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct * 100}%`, background: pct >= 0.9 ? "var(--ok)" : pct >= 0.8 ? "var(--lime-dark)" : "var(--coral)" }} />
                  </div>
                  <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", minWidth: 40, textAlign: "right" }}>
                    {occupied}/{b.units}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RentalPerformance() {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
      <PerfCardRental label="Inquiries · 30d" value="1,240" delta="+38%" data={[22,28,34,30,42,48,56,62,58,72,84,90,96]} />
      <PerfCardRental label="Tours booked" value="187" delta="+24" data={[8,10,12,11,14,16,15,18,21,19,22,24]} />
      <PerfCardRental label="Days vacant · avg" value="12.4" delta="−4.2 days" good data={[24,22,21,19,18,16,15,14,13,12,12]} />
    </div>
  );
}

function PerfCardRental({ label, value, delta, data, good }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
        <div className="display" style={{ fontSize: 32 }}>{value}</div>
        <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ok)" }}>
          {good ? "↘" : "↗"} {delta}
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <MiniChart data={data} color="var(--ink)" fill="var(--coral)" height={36} />
      </div>
    </div>
  );
}

function RentalQuickActions({ setSection }) {
  return (
    <div className="card" style={{ padding: 20, background: "var(--bg-warm)" }}>
      <span className="eyebrow">Quick actions</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {[
          { l: "Reel for #412 walkthrough", icon: "▶", to: "studio", primary: true },
          { l: "Push concessions to 8 ILSes", icon: "↗", to: "syndication" },
          { l: "Approve Wren Foley application", icon: "✓", to: "pipeline", coral: true },
          { l: "Tour confirm: Naomi 2PM", icon: "▣", to: "pipeline" },
        ].map((a, i) => (
          <button key={i} onClick={() => setSection(a.to)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            background: a.primary ? "var(--ink)" : a.coral ? "var(--coral-soft)" : "var(--bg-card)",
            color: a.primary ? "var(--bg-warm)" : a.coral ? "#8a1d05" : "var(--ink)",
            border: a.primary || a.coral ? "none" : "1px solid var(--rule)",
            borderRadius: 10, fontSize: 13, fontWeight: 500, textAlign: "left",
          }}>
            <span style={{ width: 18 }}>{a.icon}</span>
            <span style={{ flex: 1 }}>{a.l}</span>
            <span>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RentalUpNext() {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="eyebrow">Tours · next 48h</span>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>9 BOOKED</span>
      </div>
      <ul className="clean" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        {[
          { t: "Today 2:00 PM", who: "Naomi Park", unit: "Acacia #412", self: true },
          { t: "Today 4:30 PM", who: "Diego Salazar", unit: "Linden Park #3C", self: false },
          { t: "Tomorrow 11 AM", who: "Ravi Anand", unit: "Foundry Loft 2", self: true },
          { t: "Tomorrow 3 PM", who: "Bea & Tom", unit: "Linden Park #4D", self: false },
        ].map((u, i) => (
          <li key={i} style={{ display: "flex", gap: 12, alignItems: "start" }}>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", width: 80, flexShrink: 0, paddingTop: 2 }}>{u.t}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{u.who}</div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>{u.unit}</div>
            </div>
            <span style={{
              fontSize: 10, fontFamily: "var(--font-mono)",
              padding: "3px 7px", borderRadius: 999,
              background: u.self ? "var(--lime)" : "var(--bg)",
              color: u.self ? "var(--ink)" : "var(--ink-soft)",
            }}>{u.self ? "SELF-TOUR" : "AGENT"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RentalDigest() {
  return (
    <div className="card" style={{ padding: 20, background: "var(--ink)", color: "var(--bg-warm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--lime)", color: "var(--ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 11 }}>R</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(246,242,234,0.6)", letterSpacing: "0.08em", textTransform: "uppercase" }}>RealMe · 6:48 AM</span>
      </div>
      <div style={{ marginTop: 14, fontSize: 16, lineHeight: 1.45, fontFamily: "var(--font-display)", letterSpacing: "-0.015em" }}>
        Penthouse PH-A has 22 saved hearts on RealMe Live but zero applications.
        I'd cut a 12-second "what $7,200 actually gets you" reel and pin it.
        Render it?
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn-lime btn-sm">Render & post</button>
        <button className="btn btn-ghost btn-sm" style={{ color: "var(--bg-warm)" }}>Tomorrow</button>
      </div>
    </div>
  );
}

// ====== PORTFOLIO VIEW (Buildings → Units) ======
export function PortfolioView({ setSection }) {
  const isMobile = useIsMobile();
  const [activeBuilding, setActiveBuilding] = useState("b-1");
  const building = BUILDINGS.find(b => b.id === activeBuilding);
  const units = unitsOf(activeBuilding);

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "320px 1fr", gap: 20 }}>
      {/* Buildings list */}
      <div className="card" style={{ padding: 18, alignSelf: "start", position: isMobile ? "static" : "sticky", top: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span className="eyebrow">Buildings</span>
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{BUILDINGS.length}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {BUILDINGS.map(b => (
            <button key={b.id} onClick={() => setActiveBuilding(b.id)} style={{
              display: "flex", gap: 10, padding: 10, borderRadius: 12, textAlign: "left",
              background: activeBuilding === b.id ? "var(--ink)" : "transparent",
              color: activeBuilding === b.id ? "var(--bg-warm)" : "var(--ink)",
              alignItems: "center",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                backgroundImage: `url(${b.img})`, backgroundColor: b.hero,
                backgroundSize: "cover", backgroundPosition: "center",
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{b.name}</div>
                <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: activeBuilding === b.id ? "rgba(246,242,234,0.55)" : "var(--ink-soft)" }}>
                  {b.units} units · {b.vacant} vacant
                </div>
              </div>
            </button>
          ))}
          <button style={{
            display: "flex", gap: 10, padding: 10, borderRadius: 12, textAlign: "left",
            color: "var(--ink-soft)", border: "1px dashed var(--rule)", marginTop: 4,
            justifyContent: "center", fontSize: 13, fontFamily: "var(--font-mono)",
          }}>+ Add building</button>
        </div>
      </div>

      {/* Building detail */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <BuildingHeader building={building} />
        <UnitsTable units={units} setSection={setSection} />
      </div>
    </div>
  );
}

function BuildingHeader({ building }) {
  const isMobile = useIsMobile();
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{
        height: 180, position: "relative",
        backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.65) 100%), url(${building.img})`,
        backgroundColor: building.hero,
        backgroundSize: "cover", backgroundPosition: "center",
      }}>
        <div style={{ position: "absolute", left: 24, bottom: 20, color: "#fff" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", opacity: 0.85, textTransform: "uppercase" }}>
            {building.style} · Built {building.yearBuilt}
          </div>
          <div className="display" style={{ fontSize: isMobile ? 30 : 44, marginTop: 4, textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
            {building.name}
          </div>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
            {building.address} · {building.city}
          </div>
        </div>
        <div style={{ position: "absolute", right: 24, top: 20, display: "flex", gap: 8 }}>
          <button className="btn btn-lime btn-sm">+ Add unit</button>
          <button className="btn btn-sm" style={{ background: "rgba(255,255,255,0.18)", color: "#fff", backdropFilter: "blur(8px)" }}>
            Edit amenities
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", padding: "0" }}>
        {[
          { l: "Units",     v: building.units, sub: `${building.vacant} vacant` },
          { l: "Occupancy", v: Math.round((1 - building.vacant / building.units) * 100) + "%", sub: building.vacant > 5 ? "Below target" : "On target" },
          { l: "Avg rent",  v: rentShort(Math.round(unitsOf(building.id).reduce((s, u) => s + u.rent, 0) / unitsOf(building.id).length || 0)), sub: "per month" },
          { l: "Inquiries · 7d", v: unitsOf(building.id).reduce((s, u) => s + u.leads, 0), sub: "across all units" },
        ].map((s, i) => (
          <div key={i} style={{ padding: "18px 24px", borderLeft: i > 0 ? "1px solid var(--rule-soft)" : "none" }}>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.l}</div>
            <div className="display" style={{ fontSize: 28, marginTop: 4 }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "12px 24px 18px", borderTop: "1px solid var(--rule-soft)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="eyebrow" style={{ marginRight: 4 }}>Amenities</span>
        {building.amenities.map((a, i) => (
          <span key={i} className="tag">{a}</span>
        ))}
      </div>
    </div>
  );
}

function UnitsTable({ units, setSection }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--rule-soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span className="eyebrow">Units</span>
          <div className="display" style={{ fontSize: 20, marginTop: 2 }}>{units.length} units in this building</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline btn-sm">Filter</button>
          <button className="btn btn-primary btn-sm">+ List a unit</button>
        </div>
      </div>
      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 880 }}>
        <thead>
          <tr style={{ background: "var(--bg)" }}>
            {["Unit", "Type", "Sq ft", "Rent", "Available", "Status", "Reels", "Inquiries", "Apps", "Days listed", ""].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 500, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map(u => (
            <tr key={u.id} style={{ borderTop: "1px solid var(--rule-soft)" }}>
              <td style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 6, backgroundImage: `url(${u.img})`, backgroundSize: "cover", backgroundPosition: "center", flexShrink: 0 }} />
                  <strong>{u.unit}</strong>
                </div>
              </td>
              <td style={{ padding: "12px 14px", color: "var(--ink-soft)" }}>{u.type}</td>
              <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)" }}>{u.sqft.toLocaleString()}</td>
              <td style={{ padding: "12px 14px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{rentShort(u.rent)}<span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>/mo</span></div>
                {u.concession && <div style={{ fontSize: 10, color: "var(--coral)", fontFamily: "var(--font-mono)", marginTop: 2 }}>↘ {u.concession}</div>}
              </td>
              <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)", fontSize: 12 }}>{u.available}</td>
              <td style={{ padding: "12px 14px" }}>{statusPillUnit(u.status)}</td>
              <td style={{ padding: "12px 14px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  ▶ <span>{Math.floor(u.views / 800) + 2}</span>
                </span>
              </td>
              <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)" }}>{u.leads}</td>
              <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)" }}>
                <strong style={{ color: u.applications > 3 ? "var(--coral)" : "var(--ink)" }}>{u.applications}</strong>
              </td>
              <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)", color: u.daysOnMarket > 12 ? "var(--coral)" : "var(--ink-soft)" }}>{u.daysOnMarket}d</td>
              <td style={{ padding: "12px 14px" }}>
                <button className="btn btn-ghost btn-sm" style={{ padding: "4px 8px" }}>···</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ====== LEASE PIPELINE VIEW ======
export function LeasePipelineView() {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card" style={isMobile
        ? { padding: 18, display: "flex", gap: 0, overflowX: "auto", maxWidth: "100%" }
        : { padding: 22, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0 }}>
        {LEASE_STAGES.map((s, i) => {
          const count = RENTAL_LEADS.filter(l => l.stage === s.id).length;
          return (
            <div key={s.id} style={{ padding: "0 18px", borderLeft: i > 0 ? "1px solid var(--rule-soft)" : "none", flexShrink: isMobile ? 0 : undefined, minWidth: isMobile ? 110 : undefined }}>
              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
                <span className="display" style={{ fontSize: 30 }}>{count}</span>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.tint, display: "inline-block" }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={isMobile
        ? { display: "flex", gap: 14, overflowX: "auto", maxWidth: "100%", alignItems: "start", paddingBottom: 4 }
        : { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
        {LEASE_STAGES.map(stage => {
          const items = RENTAL_LEADS.filter(l => l.stage === stage.id);
          return (
            <div key={stage.id} style={{
              background: "var(--bg-warm)", borderRadius: 16, padding: 14,
              border: "1px solid var(--rule)", minHeight: 400,
              display: "flex", flexDirection: "column", gap: 10,
              ...(isMobile ? { width: 240, flexShrink: 0 } : null),
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: stage.tint }} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{stage.label}</span>
                </div>
                <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{items.length}</span>
              </div>
              {items.map(l => {
                const unit = findUnit(l.unit);
                const b = buildingOf(l.unit);
                return (
                  <div key={l.id} style={{
                    background: "var(--bg-card)", borderRadius: 12, padding: 12,
                    border: "1px solid var(--rule)", display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Avatar name={l.name} size={32} photo={l.photo} ring={l.hot} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, letterSpacing: "-0.01em" }}>{l.name}</div>
                        <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{l.source}</div>
                      </div>
                      {l.hot && <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", padding: "2px 5px", borderRadius: 4, background: "var(--coral)", color: "#fff", fontWeight: 700 }}>HOT</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-soft)", display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Unit</span><span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)" }}>{b?.name} {unit?.unit}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Budget</span><span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)" }}>{rentShort(l.budget)}/mo</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Move-in</span><span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)" }}>{l.moveIn}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Pets</span><span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)" }}>{l.pets}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 6, borderTop: "1px solid var(--rule-soft)" }}>
                      <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>FIT SCORE</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>{l.score}/100</span>
                    </div>
                  </div>
                );
              })}
              <button style={{
                marginTop: "auto", padding: 8, borderRadius: 10,
                border: "1px dashed var(--rule)", fontSize: 12, color: "var(--ink-soft)",
                fontFamily: "var(--font-mono)",
              }}>+ Add lead</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ====== SYNDICATION VIEW ======
export function SyndicationView() {
  const isMobile = useIsMobile();
  const channels = ILS_CHANNELS;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Hero summary */}
      <div className="card" style={{ padding: isMobile ? 18 : 24, background: "var(--ink)", color: "var(--bg-warm)", overflow: "hidden", position: "relative" }}>
        <div style={{
          position: "absolute", right: -80, top: -80, width: 320, height: 320, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(214,255,61,0.18), transparent 60%)",
        }} />
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: isMobile ? 20 : 32, alignItems: isMobile ? "start" : "end", position: "relative", zIndex: 1 }}>
          <div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(246,242,234,0.55)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Syndication · last 30 days
            </span>
            <h2 className="display" style={{ fontSize: isMobile ? 34 : 56, margin: "12px 0 8px", lineHeight: 0.95 }}>
              Your listings shipped<br />to {channels.filter(c => c.syndicated).length} channels.
            </h2>
            <p style={{ fontSize: 15, color: "rgba(246,242,234,0.75)", maxWidth: 540 }}>
              One unit. One video. RealMe formats it for every ILS's spec — vertical reel for
              Zillow, square for Facebook, 4:3 for Apartments.com, hosted natively on
              RealMe Live. Inquiries flow back into one pipeline.
            </p>
          </div>
          <div style={{ display: "flex", gap: 28, alignItems: "baseline" }}>
            <div>
              <div className="display" style={{ fontSize: isMobile ? 40 : 56 }}>54.3k</div>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "rgba(246,242,234,0.55)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total views</div>
            </div>
            <div>
              <div className="display" style={{ fontSize: isMobile ? 40 : 56, color: "var(--lime)" }}>1,240</div>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "rgba(246,242,234,0.55)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Inquiries</div>
            </div>
          </div>
        </div>
      </div>

      {/* Channel grid */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--rule-soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span className="eyebrow">ILS channels</span>
            <div className="display" style={{ fontSize: 20, marginTop: 2 }}>Where your videos are running</div>
          </div>
          <button className="btn btn-primary btn-sm">+ Connect channel</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)" }}>
          {channels.map((c, i) => (
            <div key={c.id} style={{
              padding: 22,
              borderLeft: !isMobile && i % 3 > 0 ? "1px solid var(--rule-soft)" : "none",
              borderTop: (isMobile ? i > 0 : i >= 3) ? "1px solid var(--rule-soft)" : "none",
              opacity: c.syndicated ? 1 : 0.55,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: c.tint, color: c.ink,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22,
                  }}>{c.logo}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>{c.name}</div>
                    <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{c.reach}{c.kind === "owned" && " · RealMe-hosted"}</div>
                  </div>
                </div>
                {c.syndicated ? (
                  <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", padding: "3px 7px", borderRadius: 4, background: "var(--lime)", color: "var(--ink)", fontWeight: 700 }}>LIVE</span>
                ) : (
                  <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", padding: "3px 7px", borderRadius: 4, background: "var(--bg)", color: "var(--ink-soft)" }}>OFF</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 18, marginTop: 18 }}>
                <div>
                  <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Views · 30d</div>
                  <div className="display" style={{ fontSize: 22, marginTop: 2 }}>{c.syndicated ? c.views.toLocaleString() : "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Inquiries</div>
                  <div className="display" style={{ fontSize: 22, marginTop: 2 }}>{c.syndicated ? Math.round(c.views * 0.022) : "—"}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent syndication log */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--rule-soft)" }}>
          <span className="eyebrow">Recent pushes</span>
          <div className="display" style={{ fontSize: 20, marginTop: 2 }}>What went where, this morning</div>
        </div>
        <ul className="clean">
          {[
            { time: "9:14 AM", unit: "u-1", action: "Concession reel pushed", channels: ["realme","zillow","apartments","zumper","trulia","hotpads","fb","craigslist"] },
            { time: "8:42 AM", unit: "u-5", action: "Price-drop banner updated",   channels: ["realme","zillow","apartments","zumper","trulia"] },
            { time: "8:20 AM", unit: "u-9", action: "Walkthrough v2 replaced v1",  channels: ["realme","zillow","apartments"] },
            { time: "8:00 AM", unit: "u-8", action: "Just listed across all",      channels: ["realme","zillow","apartments","zumper","trulia","hotpads","fb"] },
            { time: "7:51 AM", unit: "u-10", action: "Photos refreshed (24 new)",  channels: ["realme","zillow","apartments","zumper"] },
          ].map((row, i) => {
            const u = findUnit(row.unit);
            const b = buildingOf(row.unit);
            return (
              <li key={i} style={{ display: "flex", gap: 16, padding: "14px 22px", borderTop: i === 0 ? "none" : "1px solid var(--rule-soft)", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", width: 64 }}>{row.time}</span>
                <div style={{ width: 36, height: 36, borderRadius: 6, backgroundImage: `url(${u.img})`, backgroundSize: "cover", backgroundPosition: "center", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{row.action}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>{b.name} {u.unit} · {u.type}</div>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: isMobile ? "wrap" : "nowrap", justifyContent: "flex-end", maxWidth: isMobile ? 120 : undefined }}>
                  {row.channels.map(cid => {
                    const ch = ILS_CHANNELS.find(c => c.id === cid);
                    return (
                      <span key={cid} title={ch.name} style={{
                        width: 22, height: 22, borderRadius: 5,
                        background: ch.tint, color: ch.ink,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 11,
                      }}>{ch.logo}</span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ====== CONCESSIONS BUILDER ======
export function ConcessionsView() {
  const isMobile = useIsMobile();
  const [selectedUnit, setSelectedUnit] = useState("u-3");
  const [picked, setPicked] = useState("c-1");
  const unit = findUnit(selectedUnit);
  const building = buildingOf(selectedUnit);
  const concession = CONCESSION_PRESETS.find(c => c.id === picked);

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.2fr", gap: 20 }}>
      {/* Left: pick unit + concession */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card" style={{ padding: 22 }}>
          <span className="eyebrow">1 · Pick a unit</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
            {UNITS.filter(u => u.status === "available").slice(0, 6).map(u => {
              const b = buildingOf(u.id);
              return (
                <button key={u.id} onClick={() => setSelectedUnit(u.id)} style={{
                  display: "flex", gap: 10, padding: 10, borderRadius: 12, textAlign: "left",
                  background: selectedUnit === u.id ? "var(--ink)" : "var(--bg-warm)",
                  color: selectedUnit === u.id ? "var(--bg-warm)" : "var(--ink)",
                  border: "1px solid " + (selectedUnit === u.id ? "var(--ink)" : "var(--rule)"),
                  alignItems: "center",
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 6, backgroundImage: `url(${u.img})`, backgroundSize: "cover", backgroundPosition: "center", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{b.name} {u.unit}</div>
                    <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: selectedUnit === u.id ? "rgba(246,242,234,0.55)" : "var(--ink-soft)" }}>
                      {u.type} · {rentShort(u.rent)} · {u.daysOnMarket}d listed
                    </div>
                  </div>
                  {u.daysOnMarket > 12 && (
                    <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", padding: "2px 5px", borderRadius: 4, background: "var(--coral)", color: "#fff", fontWeight: 700 }}>STALE</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="card" style={{ padding: 22 }}>
          <span className="eyebrow">2 · Pick a concession</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            {CONCESSION_PRESETS.map(c => (
              <button key={c.id} onClick={() => setPicked(c.id)} style={{
                display: "flex", justifyContent: "space-between", padding: 14, borderRadius: 12, textAlign: "left",
                background: picked === c.id ? "var(--lime)" : "var(--bg-warm)",
                border: "1px solid " + (picked === c.id ? "var(--lime-dark)" : "var(--rule)"),
                color: "var(--ink)",
                alignItems: "center", gap: 10,
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em" }}>{c.name}</span>
                    {c.popular && <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", padding: "2px 5px", borderRadius: 4, background: "var(--ink)", color: "var(--bg-warm)" }}>POPULAR</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{c.desc}</div>
                </div>
                <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{c.uplift}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: preview */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, position: isMobile ? "static" : "sticky", top: 100, alignSelf: "start" }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span className="eyebrow">3 · Preview reel</span>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>Generates in ~14s</span>
          </div>
          <div style={{
            borderRadius: 14, overflow: "hidden", height: 380, position: "relative",
            backgroundImage: `url(${unit.img})`, backgroundSize: "cover", backgroundPosition: "center",
            backgroundColor: building.hero,
          }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.65) 100%)" }} />
            <div style={{ position: "absolute", top: 16, left: 16, right: 16, display: "flex", justifyContent: "space-between" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--coral)", color: "#fff", fontSize: 11, fontFamily: "var(--font-mono)", padding: "4px 8px", borderRadius: 4, fontWeight: 700, letterSpacing: "0.06em" }}>
                ⚡ {concession.name.toUpperCase()}
              </span>
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", padding: "4px 7px", borderRadius: 4, background: "rgba(0,0,0,0.5)", color: "#fff", backdropFilter: "blur(8px)" }}>
                PREVIEW · 18s
              </span>
            </div>
            <div style={{ position: "absolute", left: 16, right: 16, bottom: 16, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>
              <div className="display" style={{ fontSize: 28, lineHeight: 1.05 }}>
                {building.name} {unit.unit}
              </div>
              <div style={{ fontSize: 13, marginTop: 4, fontFamily: "var(--font-mono)" }}>
                {unit.type} · {unit.sqft.toLocaleString()} sqft · was <span style={{ textDecoration: "line-through", opacity: 0.7 }}>{rentShort(unit.rent)}</span>{" "}<span style={{ color: "var(--lime)", fontWeight: 700 }}>{rentShort(Math.round(unit.rent * 0.92))}</span>/mo
              </div>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: 22 }}>
          <span className="eyebrow">4 · Push to channels</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {ILS_CHANNELS.filter(c => c.syndicated).map(c => (
              <ChannelChip key={c.id} ch={c} big />
            ))}
          </div>
          <button className="btn btn-primary" style={{ marginTop: 18, width: "100%", justifyContent: "center", padding: "14px 18px" }}>
            Render reel & push to 8 channels →
          </button>
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", marginTop: 8, textAlign: "center" }}>
            Estimated reach: ~58,000 renters within 24h
          </div>
        </div>
      </div>
    </div>
  );
}
