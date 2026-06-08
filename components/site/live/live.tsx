// @ts-nocheck
/* eslint-disable */
"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Heart, ChevronLeft, Zap, Play, X } from "lucide-react";
import { AGENT, useIsMobile } from "@/components/site/shared";

// ====== RENTAL MOCK DATA (ported from rentals-data.jsx) ======

const RENTAL_MANAGER = {
  name: "Sasha Reyes",
  company: "Linden Park Residential",
  city: "Oakland & SF Bay",
  photo: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=600&auto=format&fit=crop&q=70",
  units: 136,
  vacant: 14,
  occupancy: 0.897,
  email: "sasha@lindenpark.co",
};

const BUILDINGS = [
  {
    id: "b-1",
    name: "The Acacia",
    address: "1240 Valencia St",
    city: "Mission, SF",
    units: 38,
    vacant: 4,
    style: "Boutique mid-rise",
    amenities: ["Rooftop", "Gym", "Pet-friendly", "EV charging"],
    img: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=900&auto=format&fit=crop&q=70",
    hero: "#3F4A55",
    yearBuilt: 2019,
  },
  {
    id: "b-2",
    name: "Linden Park",
    address: "388 Grand Ave",
    city: "Adams Point, Oakland",
    units: 64,
    vacant: 7,
    style: "Garden courtyard",
    amenities: ["Garage parking", "Dog run", "Laundry", "Bike storage"],
    img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&auto=format&fit=crop&q=70",
    hero: "#8B9DA5",
    yearBuilt: 2012,
  },
  {
    id: "b-3",
    name: "Foundry 5",
    address: "5 Kennedy St",
    city: "Jingletown, Oakland",
    units: 22,
    vacant: 2,
    style: "Converted industrial lofts",
    amenities: ["Roll-up doors", "14ft ceilings", "Live/work", "Pet-friendly"],
    img: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900&auto=format&fit=crop&q=70",
    hero: "#C9B689",
    yearBuilt: 2008,
  },
  {
    id: "b-4",
    name: "Verbena Court",
    address: "612 41st St",
    city: "Temescal, Oakland",
    units: 12,
    vacant: 1,
    style: "Garden duplex courtyard",
    amenities: ["Private garden", "BBQ", "In-unit W/D"],
    img: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&auto=format&fit=crop&q=70",
    hero: "#B98E73",
    yearBuilt: 1948,
  },
];

const UNITS = [
  // The Acacia
  { id: "u-1",  buildingId: "b-1", unit: "#412", type: "1BR / 1BA", sqft: 720,  rent: 3450, available: "Now",        status: "available",   beds: 1, baths: 1, concession: "1 month free", floor: 4, views: 1840, leads: 12, applications: 3, daysOnMarket: 6,  img: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=900&auto=format&fit=crop&q=70" },
  { id: "u-2",  buildingId: "b-1", unit: "#508", type: "Studio",   sqft: 510,  rent: 2750, available: "Jun 1",       status: "available",   beds: 0, baths: 1, concession: null,           floor: 5, views: 612,  leads: 4,  applications: 1, daysOnMarket: 2,  img: "https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=900&auto=format&fit=crop&q=70" },
  { id: "u-3",  buildingId: "b-1", unit: "#615", type: "2BR / 2BA", sqft: 1180, rent: 4895, available: "Jul 15",      status: "on_hold",     beds: 2, baths: 2, concession: null,           floor: 6, views: 2410, leads: 18, applications: 5, daysOnMarket: 14, img: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=900&auto=format&fit=crop&q=70" },
  { id: "u-4",  buildingId: "b-1", unit: "#PH-A", type: "Penthouse 2BR", sqft: 1480, rent: 7200, available: "Aug 1",  status: "available",   beds: 2, baths: 2.5, concession: null,         floor: 8, views: 5208, leads: 22, applications: 6, daysOnMarket: 21, img: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=900&auto=format&fit=crop&q=70" },

  // Linden Park
  { id: "u-5",  buildingId: "b-2", unit: "#1A",  type: "1BR / 1BA", sqft: 680,  rent: 2495, available: "Now",        status: "available",   beds: 1, baths: 1, concession: "$500 move-in", floor: 1, views: 920,  leads: 9,  applications: 2, daysOnMarket: 4,  img: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=900&auto=format&fit=crop&q=70" },
  { id: "u-6",  buildingId: "b-2", unit: "#3C",  type: "2BR / 1BA", sqft: 920,  rent: 3195, available: "Now",        status: "available",   beds: 2, baths: 1, concession: null,           floor: 3, views: 1340, leads: 11, applications: 4, daysOnMarket: 8,  img: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&auto=format&fit=crop&q=70" },
  { id: "u-7",  buildingId: "b-2", unit: "#2B",  type: "Studio",   sqft: 480,  rent: 1995, available: "Jun 10",      status: "leased",      beds: 0, baths: 1, concession: null,           floor: 2, views: 740,  leads: 6,  applications: 3, daysOnMarket: 11, img: "https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=900&auto=format&fit=crop&q=70" },
  { id: "u-8",  buildingId: "b-2", unit: "#4D",  type: "3BR / 2BA", sqft: 1240, rent: 4150, available: "Jul 1",       status: "available",   beds: 3, baths: 2, concession: "2 weeks free", floor: 4, views: 1880, leads: 16, applications: 4, daysOnMarket: 9,  img: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=900&auto=format&fit=crop&q=70" },

  // Foundry 5
  { id: "u-9",  buildingId: "b-3", unit: "Loft 2", type: "1BR Loft", sqft: 1100, rent: 3895, available: "Now",        status: "available",   beds: 1, baths: 1.5, concession: null,         floor: 2, views: 3120, leads: 14, applications: 3, daysOnMarket: 5,  img: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=900&auto=format&fit=crop&q=70" },
  { id: "u-10", buildingId: "b-3", unit: "Loft 7", type: "2BR Loft", sqft: 1620, rent: 5450, available: "Jun 15",     status: "available",   beds: 2, baths: 2,   concession: null,         floor: 3, views: 2680, leads: 18, applications: 5, daysOnMarket: 12, img: "https://images.unsplash.com/photo-1554995207-c18c203602cb?w=900&auto=format&fit=crop&q=70" },

  // Verbena Court
  { id: "u-11", buildingId: "b-4", unit: "Cottage 3", type: "2BR / 1BA", sqft: 880, rent: 3650, available: "Jul 1",  status: "available",   beds: 2, baths: 1,   concession: null,         floor: 1, views: 1240, leads: 9,  applications: 2, daysOnMarket: 6,  img: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900&auto=format&fit=crop&q=70" },
];

function buildingOf(unitId) {
  const u = UNITS.find(x => x.id === unitId);
  return u ? BUILDINGS.find(b => b.id === u.buildingId) : null;
}
function rentShort(n) {
  if (n >= 1000) return "$" + (n / 1000).toFixed(n % 1000 === 0 ? 1 : 2).replace(/\.0$/, "") + "k";
  return "$" + n;
}

// RealMe Live — Public-facing ILS (renter marketplace)
// Where renters discover units via AI agent reels

export function RealMeLive({ onBackToSite }) {
  const [filters, setFilters] = useState({ q: "", beds: "any", maxRent: 6000, pets: false });
  const [active, setActive] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());

  const visible = UNITS.filter(u => {
    if (u.status === "leased") return false;
    if (filters.beds !== "any" && u.beds !== parseInt(filters.beds)) return false;
    if (u.rent > filters.maxRent) return false;
    if (filters.q) {
      const b = buildingOf(u.id);
      const hay = `${b.name} ${b.city} ${u.type}`.toLowerCase();
      if (!hay.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  });

  const toggleSave = (id) => {
    const ns = new Set(savedIds);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    setSavedIds(ns);
  };

  return (
    <div data-screen-label="04 RealMe Live (Public ILS)" style={{ background: "var(--bg)", minHeight: "100vh", overflowX: "hidden", maxWidth: "100vw" }}>
      <LiveNav savedCount={savedIds.size} onBackToSite={onBackToSite} />
      <LiveHero filters={filters} setFilters={setFilters} resultCount={visible.length} />
      <FeaturedAgents />
      <LiveResults units={visible} onPick={setActive} savedIds={savedIds} toggleSave={toggleSave} />
      <LiveWhyDifferent />
      <LiveFooter onBackToSite={onBackToSite} />
      {active && <UnitDetailOverlay unit={active} onClose={() => setActive(null)} saved={savedIds.has(active.id)} onSave={() => toggleSave(active.id)} />}
    </div>
  );
}

// ====== TOP NAV ======
function LiveNav({ savedCount, onBackToSite }) {
  const isMobile = useIsMobile();
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 30,
      background: "rgba(255,252,245,0.92)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--rule-soft)",
    }}>
      <div style={{
        maxWidth: 1400, margin: "0 auto", padding: isMobile ? "12px 16px" : "14px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: "var(--ink)", color: "var(--lime)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14,
          }}>R</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 19, letterSpacing: "-0.03em" }}>RealMe</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--coral)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Live</span>
          </div>
        </div>
        {!isMobile && (
          <div style={{ display: "flex", gap: 24, alignItems: "center", fontSize: 14, fontWeight: 500 }}>
            <a href="#live">Rentals</a>
            <a href="#live">Neighborhoods</a>
            <a href="#live">Agents</a>
            <a href="#live">How RealMe works</a>
          </div>
        )}
        <div style={{ display: "flex", gap: isMobile ? 6 : 10, alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" style={{ position: "relative" }}>
            <Heart size={14} fill="none" style={{ marginRight: 6, verticalAlign: "-2px" }} />Saved {savedCount > 0 && (
              <span style={{ position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: "var(--coral)", color: "#fff", fontSize: 9, fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{savedCount}</span>
            )}
          </button>
          {!isMobile && (
            <button onClick={onBackToSite} className="btn btn-ghost btn-sm" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
              <ChevronLeft size={14} style={{ marginRight: 4, verticalAlign: "-3px" }} />agents
            </button>
          )}
          <button className="btn btn-primary btn-sm">Sign up</button>
        </div>
      </div>
    </nav>
  );
}

// ====== HERO ======
function LiveHero({ filters, setFilters, resultCount }) {
  const isMobile = useIsMobile();
  return (
    <section style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "32px 16px 24px" : "56px 32px 32px" }}>
      <div style={{ maxWidth: 980 }}>
        <span className="eyebrow" style={{ color: "var(--coral)" }}>RealMe Live · Bay Area rentals</span>
        <h1 className="display" style={{ fontSize: isMobile ? "clamp(34px, 11vw, 52px)" : "clamp(56px, 8vw, 124px)", margin: "12px 0 0", lineHeight: 0.92 }}>
          Rent from a <span style={{ position: "relative", display: "inline-block" }}>
            human,
            <svg viewBox="0 0 220 22" style={{
              position: "absolute", left: 0, bottom: -6, width: "100%", height: 14,
            }}>
              <path d="M2 14 Q 55 2, 110 12 T 218 8" fill="none" stroke="var(--coral)" strokeWidth="9" strokeLinecap="round" />
            </svg>
          </span> not<br />a stock photo.
        </h1>
        <p style={{ fontSize: 19, color: "var(--ink-soft)", maxWidth: 640, lineHeight: 1.45, marginTop: 24, letterSpacing: "-0.005em" }}>
          Every unit on RealMe Live comes with a 30-second video — the actual leasing
          agent, on camera, walking you through the place. No fake renderings.
          No bait listings.
        </p>
      </div>

      {/* Search bar */}
      <div style={{
        marginTop: isMobile ? 24 : 36, background: "var(--bg-card)",
        borderRadius: 20, border: "1px solid var(--rule)",
        padding: 10, boxShadow: "var(--shadow-card)",
        ...(isMobile
          ? { display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch", maxWidth: "100%" }
          : { display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr auto", gap: 6, alignItems: "center" }),
      }}>
        <div style={{ padding: "10px 16px", borderRight: isMobile ? "none" : "1px solid var(--rule-soft)", borderBottom: isMobile ? "1px solid var(--rule-soft)" : "none", width: isMobile ? "100%" : undefined }}>
          <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Where</div>
          <input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Oakland, Mission, by line, building…"
            style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 15, marginTop: 2, padding: 0, fontWeight: 500 }}
          />
        </div>
        <div style={{ padding: "10px 16px", borderRight: isMobile ? "none" : "1px solid var(--rule-soft)", borderBottom: isMobile ? "1px solid var(--rule-soft)" : "none", width: isMobile ? "100%" : undefined }}>
          <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Beds</div>
          <select
            value={filters.beds}
            onChange={(e) => setFilters({ ...filters, beds: e.target.value })}
            style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 15, marginTop: 2, padding: 0, fontWeight: 500 }}
          >
            <option value="any">Any</option>
            <option value="0">Studio</option>
            <option value="1">1 bed</option>
            <option value="2">2 beds</option>
            <option value="3">3+ beds</option>
          </select>
        </div>
        <div style={{ padding: "10px 16px", borderRight: isMobile ? "none" : "1px solid var(--rule-soft)", borderBottom: isMobile ? "1px solid var(--rule-soft)" : "none", width: isMobile ? "100%" : undefined }}>
          <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Max rent</div>
          <div style={{ fontSize: 15, marginTop: 2, fontWeight: 500, fontFamily: "var(--font-mono)" }}>${filters.maxRent.toLocaleString()}/mo</div>
        </div>
        <div style={{ padding: "10px 16px", width: isMobile ? "100%" : undefined }}>
          <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Move-in</div>
          <div style={{ fontSize: 15, marginTop: 2, fontWeight: 500 }}>Anytime</div>
        </div>
        <button className="btn btn-primary" style={{ padding: "16px 22px", fontSize: 15, margin: 4, width: isMobile ? "calc(100% - 8px)" : undefined, justifyContent: isMobile ? "center" : undefined }}>
          Search →
        </button>
      </div>

      {/* Quick filters */}
      <div style={{
        display: "flex", gap: 8, marginTop: 16, alignItems: "center",
        ...(isMobile
          ? { flexWrap: "nowrap", overflowX: "auto", WebkitOverflowScrolling: "touch", maxWidth: "100%", paddingBottom: 4 }
          : { flexWrap: "wrap" }),
      }}>
        <span style={{ flexShrink: 0, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{resultCount} units</span>
        <div style={{ flexShrink: 0, width: 1, height: 14, background: "var(--rule)" }} />
        {["Pet-friendly", "In-unit W/D", "Concession", "Parking", "Available now", "Self-tour", "Live agent reel"].map((p, i) => (
          <span key={i} className="tag" style={{ cursor: "pointer", padding: "6px 12px", flexShrink: 0, whiteSpace: "nowrap" }}>{p}</span>
        ))}
      </div>
    </section>
  );
}

// ====== FEATURED AGENTS ======
function FeaturedAgents() {
  const isMobile = useIsMobile();
  const agents = [
    { name: "Sasha Reyes",  company: "Linden Park Resi",  units: 64, photo: RENTAL_MANAGER.photo, hot: true,  reels: 142 },
    { name: "Jordan Maes",  company: "Bayline Rentals",   units: 22, photo: AGENT.photo,                       reels: 89 },
    { name: "Mireille Ko",  company: "Foundry Lofts",     units: 22, photo: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400&auto=format&fit=crop&q=70", reels: 64 },
    { name: "Theo Brennan", company: "Acacia Group",      units: 38, photo: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&auto=format&fit=crop&q=70", hot: true, reels: 118 },
    { name: "Wren Patel",   company: "Verbena Court",     units: 12, photo: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&auto=format&fit=crop&q=70", reels: 41 },
    { name: "Devon Yoo",    company: "Harbor & Grove",    units: 48, photo: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400&auto=format&fit=crop&q=70", reels: 92 },
  ];

  return (
    <section style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "20px 16px 28px" : "20px 32px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, gap: 12 }}>
        <div>
          <span className="eyebrow">Bay Area agents on RealMe Live</span>
          <h3 className="display" style={{ fontSize: isMobile ? 22 : 28, margin: "6px 0 0" }}>Follow an agent. Get their drops first.</h3>
        </div>
        <a href="#live" style={{ flexShrink: 0, fontSize: 13, fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 4 }}>See all 240 agents →</a>
      </div>
      <div style={{
        display: isMobile ? "flex" : "grid",
        ...(isMobile
          ? { flexWrap: "nowrap", overflowX: "auto", WebkitOverflowScrolling: "touch", maxWidth: "100%", paddingBottom: 4 }
          : { gridTemplateColumns: "repeat(6, 1fr)" }),
        gap: 12,
      }}>
        {agents.map((a, i) => (
          <div key={i} className="card" style={{ padding: 16, textAlign: "center", position: "relative", flex: isMobile ? "0 0 160px" : undefined }}>
            {a.hot && <span style={{ position: "absolute", top: 10, right: 10, fontSize: 9, fontFamily: "var(--font-mono)", padding: "2px 6px", borderRadius: 4, background: "var(--coral)", color: "#fff", fontWeight: 700 }}>LIVE</span>}
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              backgroundImage: `url(${a.photo})`, backgroundSize: "cover", backgroundPosition: "center top",
              boxShadow: "0 0 0 3px var(--lime)", margin: "0 auto 10px",
            }} />
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em" }}>{a.name}</div>
            <div style={{ fontSize: 11, color: "var(--ink-soft)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{a.company}</div>
            <div style={{ marginTop: 10, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>
              {a.units} units · {a.reels} reels
            </div>
            <button className="btn btn-outline btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 10, fontSize: 12 }}>+ Follow</button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ====== RESULTS GRID ======
function LiveResults({ units, onPick, savedIds, toggleSave }) {
  const isMobile = useIsMobile();
  return (
    <section style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "20px 16px 48px" : "20px 32px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, gap: 12, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <h3 className="display" style={{ fontSize: isMobile ? 22 : 28, margin: 0 }}>{units.length} places, with the agent on camera</h3>
        <div style={{
          display: "flex", gap: 6,
          ...(isMobile ? { overflowX: "auto", maxWidth: "100%", WebkitOverflowScrolling: "touch" } : {}),
        }}>
          {["Newest", "Price ↑", "Price ↓", "Most reeled"].map((s, i) => (
            <button key={i} className={i === 0 ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} style={{ fontSize: 12, flexShrink: 0, whiteSpace: "nowrap" }}>{s}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 18 }}>
        {units.map(u => (
          <UnitCard key={u.id} unit={u} onPick={() => onPick(u)} saved={savedIds.has(u.id)} onSave={() => toggleSave(u.id)} />
        ))}
      </div>
    </section>
  );
}

function UnitCard({ unit, onPick, saved, onSave }) {
  const b = buildingOf(unit.id);
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onPick}
      className="card"
      style={{ padding: 0, overflow: "hidden", cursor: "pointer", transition: "transform 0.18s ease, box-shadow 0.18s ease", transform: hovered ? "translateY(-3px)" : "none", boxShadow: hovered ? "var(--shadow-pop)" : "var(--shadow-card)" }}
    >
      {/* Image / video preview */}
      <div style={{
        position: "relative", height: 240,
        backgroundImage: `url(${unit.img})`, backgroundColor: b.hero,
        backgroundSize: "cover", backgroundPosition: "center",
      }}>
        <div style={{ position: "absolute", inset: 0, background: hovered ? "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)" : "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.4) 100%)", transition: "background 0.2s ease" }} />

        {/* Top row */}
        <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {unit.concession && (
              <span style={{ background: "var(--coral)", color: "#fff", fontSize: 10, fontFamily: "var(--font-mono)", padding: "4px 8px", borderRadius: 4, fontWeight: 700, letterSpacing: "0.04em" }}>
                <Zap size={10} fill="currentColor" style={{ verticalAlign: "-1px", marginRight: 3 }} />{unit.concession.toUpperCase()}
              </span>
            )}
            <span style={{ background: "rgba(255,255,255,0.95)", color: "var(--ink)", fontSize: 10, fontFamily: "var(--font-mono)", padding: "4px 8px", borderRadius: 4, fontWeight: 600 }}>
              <Play size={10} fill="currentColor" style={{ verticalAlign: "-1px", marginRight: 3 }} />AGENT REEL · 32s
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onSave(); }}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: saved ? "var(--coral)" : "rgba(255,255,255,0.95)",
              color: saved ? "#fff" : "var(--ink)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, transition: "all 0.15s ease",
            }}>
            <Heart size={16} fill={saved ? "currentColor" : "none"} />
          </button>
        </div>

        {/* Play indicator */}
        <div style={{
          position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          width: hovered ? 64 : 52, height: hovered ? 64 : 52,
          borderRadius: "50%", background: "rgba(255,255,255,0.95)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--ink)", fontSize: 18, fontWeight: 700,
          transition: "all 0.2s ease",
          opacity: hovered ? 1 : 0.85,
        }}><Play size={18} fill="currentColor" /></div>

        {/* Bottom: price */}
        <div style={{ position: "absolute", left: 14, bottom: 12, right: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-end", color: "#fff" }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", opacity: 0.9, textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
              {b.name} {unit.unit}
            </div>
            <div className="display" style={{ fontSize: 32, lineHeight: 1, marginTop: 2, textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
              {rentShort(unit.rent)}<span style={{ fontSize: 14, fontWeight: 500, opacity: 0.85 }}>/mo</span>
            </div>
          </div>
        </div>
      </div>

      {/* Below image */}
      <div style={{ padding: "14px 16px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.address}, {b.city}</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>
              {unit.type} · {unit.sqft.toLocaleString()} sqft · {unit.available === "Now" ? "Move in now" : "Available " + unit.available}
            </div>
          </div>
        </div>

        {/* Agent */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0 0", borderTop: "1px solid var(--rule-soft)", marginTop: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            backgroundImage: `url(${RENTAL_MANAGER.photo})`, backgroundSize: "cover", backgroundPosition: "center top",
            boxShadow: "0 0 0 2px var(--lime)", flexShrink: 0,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Sasha · talks about this place</div>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>Linden Park Residential</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onPick(); }} className="btn btn-lime btn-sm" style={{ fontSize: 12 }}>Tour →</button>
        </div>
      </div>
    </div>
  );
}

// ====== UNIT DETAIL OVERLAY ======
function UnitDetailOverlay({ unit, onClose, saved, onSave }) {
  const isMobile = useIsMobile();
  const b = buildingOf(unit.id);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 80);
    return () => clearInterval(i);
  }, []);

  const captions = [
    `Hey — Sasha here.`,
    `${b.name} ${unit.unit}.`,
    `${unit.type}.`,
    `${unit.sqft.toLocaleString()} square feet.`,
    `Bright kitchen.`,
    `${rentShort(unit.rent)}/mo.`,
    unit.concession ? `${unit.concession}.` : `Come tour it.`,
  ];
  const captionIdx = Math.floor((tick / 22) % captions.length);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(17,17,16,0.75)",
        display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "center",
        padding: isMobile ? 0 : 24, backdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: isMobile ? "100%" : 1180,
          maxHeight: isMobile ? "100vh" : "92vh",
          background: "var(--bg-warm)", borderRadius: isMobile ? 0 : 24,
          boxShadow: "var(--shadow-pop)",
          ...(isMobile
            ? { display: "flex", flexDirection: "column", overflowY: "auto", WebkitOverflowScrolling: "touch" }
            : { display: "grid", gridTemplateColumns: "440px 1fr", overflow: "hidden" }),
        }}
      >
        {/* Video column */}
        <div style={{ position: "relative", background: "#000", padding: 24, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: isMobile ? 0 : undefined }}>
          <button onClick={onClose} style={{
            position: isMobile ? "sticky" : "absolute", top: 16, left: 16, width: 36, height: 36, borderRadius: "50%",
            background: "rgba(255,255,255,0.15)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, backdropFilter: "blur(8px)", zIndex: 5,
            alignSelf: isMobile ? "flex-start" : undefined,
            marginRight: isMobile ? -36 : undefined,
          }}><X size={16} /></button>

          <div className="phone" style={{ boxShadow: "none" }}>
            <div className="phone-notch"></div>
            <div className="phone-screen">
              <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#1a1818" }}>
                {/* Unit photo background, Ken Burns */}
                <div style={{
                  position: "absolute", inset: 0,
                  backgroundImage: `url(${unit.img})`, backgroundSize: "cover", backgroundPosition: "center",
                  transform: `scale(${1.05 + Math.sin(tick / 80) * 0.025})`,
                }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 100%)" }} />

                {/* Agent bubble */}
                <div style={{
                  position: "absolute", left: "50%", top: "52%",
                  transform: `translate(-50%, -50%) scale(${1 + Math.sin(tick / 40) * 0.015})`,
                  width: 150, height: 150, borderRadius: "50%", overflow: "hidden",
                  border: "4px solid var(--lime)",
                  boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                  backgroundImage: `url(${RENTAL_MANAGER.photo})`,
                  backgroundSize: "cover", backgroundPosition: "center top",
                }} />

                {/* Caption */}
                <div style={{ position: "absolute", bottom: 100, left: 14, right: 14, textAlign: "center" }}>
                  <span style={{
                    background: "var(--lime)", color: "var(--ink)",
                    fontFamily: "var(--font-display)", fontWeight: 800,
                    fontSize: 19, padding: "4px 10px",
                    letterSpacing: "-0.02em", borderRadius: 4,
                    boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone",
                    lineHeight: 1.4,
                  }}>
                    {captions[captionIdx]}
                  </span>
                </div>

                {/* Top */}
                <div style={{ position: "absolute", top: 50, left: 14, right: 14, color: "#fff", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%",
                      backgroundImage: `url(${RENTAL_MANAGER.photo})`, backgroundSize: "cover", backgroundPosition: "center top",
                    }} />
                    <span style={{ fontWeight: 600 }}>sasha.reyes</span>
                  </div>
                </div>

                {/* Progress */}
                <div style={{ position: "absolute", bottom: 14, left: 14, right: 14, height: 2, background: "rgba(255,255,255,0.2)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "var(--lime)", width: `${((tick % 100) / 100) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Details column */}
        <div style={{ padding: isMobile ? "24px 18px 32px" : "32px 36px", overflowY: isMobile ? "visible" : "auto", display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {b.name} · {b.city}
            </div>
            <h2 className="display" style={{ fontSize: isMobile ? 30 : 44, margin: "6px 0 4px", lineHeight: 1 }}>
              {b.address}, {unit.unit}
            </h2>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 10 }}>
              <span className="display" style={{ fontSize: 36 }}>{rentShort(unit.rent)}<span style={{ fontSize: 16, fontWeight: 500, color: "var(--ink-soft)" }}>/mo</span></span>
              {unit.concession && (
                <span style={{ background: "var(--coral)", color: "#fff", fontSize: 11, fontFamily: "var(--font-mono)", padding: "4px 8px", borderRadius: 4, fontWeight: 700 }}>
                  <Zap size={10} fill="currentColor" style={{ verticalAlign: "-1px", marginRight: 3 }} />{unit.concession.toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, padding: "14px 0", borderTop: "1px solid var(--rule-soft)", borderBottom: "1px solid var(--rule-soft)" }}>
            {[
              { l: "Beds",        v: unit.beds === 0 ? "Studio" : unit.beds },
              { l: "Baths",       v: unit.baths },
              { l: "Sq ft",       v: unit.sqft.toLocaleString() },
              { l: "Floor",       v: unit.floor },
            ].map((s, i) => (
              <div key={i} style={{ paddingLeft: i > 0 ? 16 : 0, borderLeft: i > 0 ? "1px solid var(--rule-soft)" : "none" }}>
                <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.l}</div>
                <div className="display" style={{ fontSize: 22, marginTop: 4 }}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Agent */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 14, background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--rule)" }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              backgroundImage: `url(${RENTAL_MANAGER.photo})`, backgroundSize: "cover", backgroundPosition: "center top",
              boxShadow: "0 0 0 3px var(--lime)",
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Sasha Reyes · talks about this place</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Linden Park Residential · responds in ~2h</div>
            </div>
            <button className="btn btn-outline btn-sm">Message</button>
          </div>

          {/* Amenities */}
          <div>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>What's included</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {b.amenities.map((a, i) => <span key={i} className="tag">{a}</span>)}
            </div>
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: isMobile ? "wrap" : "nowrap" }}>
            <button className="btn btn-primary" style={{ flex: isMobile ? "1 1 100%" : 1, justifyContent: "center", padding: "14px 18px", fontSize: 14 }}>
              Book a tour · {unit.available === "Now" ? "today" : unit.available}
            </button>
            <button className="btn btn-outline" style={{ padding: "14px 18px" }}>Apply now</button>
            <button onClick={onSave} className="btn btn-outline" style={{ padding: "14px 16px" }}>
              <Heart size={16} fill={saved ? "currentColor" : "none"} />
            </button>
          </div>
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", textAlign: "center" }}>
            Self-tour available · code expires after 24h · no agent required
          </div>
        </div>
      </div>
    </div>
  );
}

// ====== "WHY DIFFERENT" SECTION ======
function LiveWhyDifferent() {
  const isMobile = useIsMobile();
  const points = [
    { n: "01", h: "Every listing has a real human on video", b: "No render farms, no agent-less ghost listings. If it's on RealMe Live, an actual leasing agent is on camera walking you through it." },
    { n: "02", h: "Self-tour codes that actually work",       b: "Verified renters get an SMS code to tour the unit themselves. No back-and-forth. No 'is this still available?'" },
    { n: "03", h: "Apply once, use everywhere",                b: "One application, screened once. Use it across every RealMe Live listing — agents see your score, you see their response time." },
  ];
  return (
    <section style={{ background: "var(--ink)", color: "var(--bg-warm)", padding: isMobile ? "56px 0" : "84px 0", marginTop: 60 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "0 16px" : "0 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: isMobile ? 32 : 48 }}>
          <div>
            <span className="eyebrow" style={{ color: "rgba(246,242,234,0.55)" }}>Why renters pick RealMe Live</span>
            <h2 className="display" style={{ fontSize: isMobile ? "clamp(32px, 9vw, 48px)" : "clamp(48px, 6vw, 80px)", margin: "12px 0 0", maxWidth: 800, lineHeight: 0.95 }}>
              Stock photos and<br />ghost listings, no.<br />
              <span style={{ color: "var(--coral)" }}>People, yes.</span>
            </h2>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)" }}>
          {points.map((p, i) => (
            <div key={i} style={{
              padding: isMobile ? "24px 0" : "32px 28px 32px 0",
              paddingLeft: isMobile ? 0 : (i > 0 ? 36 : 0),
              borderLeft: isMobile ? "none" : (i > 0 ? "1px solid rgba(246,242,234,0.15)" : "none"),
              borderTop: isMobile && i > 0 ? "1px solid rgba(246,242,234,0.15)" : "none",
            }}>
              <div className="display" style={{ fontSize: 64, color: "var(--coral)", lineHeight: 1 }}>{p.n}</div>
              <h3 className="display" style={{ fontSize: 26, margin: "20px 0 12px", letterSpacing: "-0.02em", lineHeight: 1.05 }}>{p.h}</h3>
              <p style={{ color: "rgba(246,242,234,0.7)", fontSize: 14, lineHeight: 1.6 }}>{p.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ====== FOOTER ======
function LiveFooter({ onBackToSite }) {
  const isMobile = useIsMobile();
  return (
    <footer style={{ background: "var(--bg)", padding: isMobile ? "40px 16px 32px" : "48px 32px 32px", borderTop: "1px solid var(--rule)" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1.5fr 1fr 1fr 1fr", gap: isMobile ? 24 : 40 }}>
        <div style={{ gridColumn: isMobile ? "1 / -1" : undefined }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, letterSpacing: "-0.03em" }}>RealMe</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--coral)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Live</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 8, lineHeight: 1.55, maxWidth: 320 }}>
            The rental marketplace where every listing comes with a real agent on camera.
            Powered by RealMe — the AI marketing agent for real estate agents.
          </p>
          <button onClick={onBackToSite} className="btn btn-outline btn-sm" style={{ marginTop: 16, fontSize: 12 }}>
            I'm an agent →
          </button>
        </div>
        {[
          { h: "Renters", l: ["Browse rentals", "Save searches", "Apply once", "Self-tour", "Rent calculator"] },
          { h: "Agents",  l: ["List on RealMe", "Generate reels", "Syndicate to ILSes", "Lease pipeline", "Pricing"] },
          { h: "Markets", l: ["Oakland", "San Francisco", "Berkeley", "Alameda", "All Bay Area"] },
        ].map((c, i) => (
          <div key={i}>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{c.h}</div>
            <ul className="clean" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {c.l.map((x, j) => <li key={j} style={{ fontSize: 13 }}>{x}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 1400, margin: "32px auto 0", paddingTop: 18, borderTop: "1px solid var(--rule)", display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 8 : 0, justifyContent: "space-between", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>
        <span>© 2026 RealMe, Inc. · Equal Housing Opportunity</span>
        <span>San Francisco · Oakland · Berkeley</span>
      </div>
    </footer>
  );
}
