// @ts-nocheck
/* eslint-disable */
"use client";
// RealMe — shared mock data and small components (ported from the design prototype)
import { useState, useEffect, useRef, useMemo, useCallback } from "react";

export const CheckIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ====== MOCK DATA ======

export const AGENT = {
  name: "Jordan Maes",
  brokerage: "Bayline Realty",
  city: "Oakland, CA",
  avatar: "JM",
  photo: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&auto=format&fit=crop&q=70",
  videos: 47,
  followers: 12483,
  listings: 9,
  email: "jordan@bayline.com",
};

export const LISTINGS = [
  {
    id: "l-1",
    address: "1471 Sunset Ridge Dr",
    city: "Berkeley Hills, CA",
    price: 2495000,
    beds: 4, baths: 3, sqft: 3120,
    status: "active",
    daysListed: 3,
    style: "Mid-century",
    hero: "#7AA8B5",
    img: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=900&auto=format&fit=crop&q=70",
    views: 2410,
    photos: 24,
    autoImported: true,
  },
  {
    id: "l-2",
    address: "88 Wharf St #3B",
    city: "Jack London Sq",
    price: 825000,
    beds: 2, baths: 2, sqft: 1180,
    status: "new",
    daysListed: 0,
    style: "Loft",
    hero: "#C9B689",
    img: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900&auto=format&fit=crop&q=70",
    views: 312,
    photos: 18,
    autoImported: true,
  },
  {
    id: "l-3",
    address: "612 Maple Crescent",
    city: "Rockridge",
    price: 1450000,
    beds: 3, baths: 2, sqft: 1840,
    status: "active",
    daysListed: 9,
    style: "Craftsman",
    hero: "#B98E73",
    img: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&auto=format&fit=crop&q=70",
    views: 5208,
    photos: 31,
    autoImported: false,
  },
  {
    id: "l-4",
    address: "27 Anchor Way",
    city: "Alameda Marina",
    price: 1185000,
    beds: 3, baths: 2.5, sqft: 1620,
    status: "active",
    daysListed: 14,
    style: "Modern",
    hero: "#8B9DA5",
    img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&auto=format&fit=crop&q=70",
    views: 3104,
    photos: 22,
    autoImported: true,
  },
  {
    id: "l-5",
    address: "904 Telegraph Ave Penthouse",
    city: "Downtown Oakland",
    price: 1675000,
    beds: 2, baths: 2, sqft: 1490,
    status: "pending",
    daysListed: 21,
    style: "Penthouse",
    hero: "#3F4A55",
    img: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=900&auto=format&fit=crop&q=70",
    views: 8920,
    photos: 28,
    autoImported: true,
  },
  {
    id: "l-6",
    address: "5 Eucalyptus Pl",
    city: "Piedmont",
    price: 3290000,
    beds: 5, baths: 4, sqft: 4210,
    status: "new",
    daysListed: 1,
    style: "Tudor estate",
    hero: "#6E7A55",
    img: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=900&auto=format&fit=crop&q=70",
    views: 740,
    photos: 36,
    autoImported: true,
  },
];

export const VIDEO_TEMPLATES = [
  { id: "walkthru", name: "Walkthrough", duration: "32s", platform: "Reels · TikTok · Shorts", desc: "Agent narrates over kitchen → living → primary suite", popular: true },
  { id: "list-pop", name: "Just Listed", duration: "18s", platform: "Reels · Shorts", desc: "Punchy intro, price reveal, one-line CTA" },
  { id: "neighborhood", name: "Neighborhood Story", duration: "45s", platform: "Reels · YouTube", desc: "Block, schools, coffee — you on the sidewalk" },
  { id: "openhouse", name: "Open House Invite", duration: "15s", platform: "Reels · TikTok", desc: "Saturday teaser with location, time, vibe" },
  { id: "price-drop", name: "Price Drop", duration: "12s", platform: "Reels · TikTok", desc: "Old price slashed, new price slam-cut" },
  { id: "testimonial", name: "Just Closed", duration: "22s", platform: "Reels · LinkedIn", desc: "Buyer hands you keys, two-line testimonial" },
];

export const POSTS_WEEK = [
  { day: 0, label: "MON", date: "13", items: [
    { time: "9:00", platform: "ig", listing: "l-3", template: "walkthru", status: "posted", views: 4210 },
    { time: "17:30", platform: "tt", listing: "l-2", template: "list-pop", status: "posted", views: 8420 },
  ]},
  { day: 1, label: "TUE", date: "14", items: [
    { time: "8:00", platform: "li", listing: "l-5", template: "testimonial", status: "posted", views: 612 },
    { time: "12:00", platform: "ig", listing: "l-1", template: "neighborhood", status: "posted", views: 3018 },
  ]},
  { day: 2, label: "WED", date: "15", items: [
    { time: "9:30", platform: "ig", listing: "l-6", template: "list-pop", status: "queued" },
    { time: "18:00", platform: "tt", listing: "l-4", template: "walkthru", status: "generating" },
  ]},
  { day: 3, label: "THU", date: "16", items: [
    { time: "9:00", platform: "ig", listing: "l-2", template: "openhouse", status: "scheduled" },
    { time: "16:00", platform: "yt", listing: "l-1", template: "neighborhood", status: "scheduled" },
  ]},
  { day: 4, label: "FRI", date: "17", items: [
    { time: "10:00", platform: "ig", listing: "l-3", template: "price-drop", status: "scheduled" },
    { time: "19:30", platform: "tt", listing: "l-6", template: "walkthru", status: "scheduled" },
  ]},
  { day: 5, label: "SAT", date: "18", items: [
    { time: "9:00", platform: "ig", listing: "l-1", template: "openhouse", status: "scheduled" },
  ]},
  { day: 6, label: "SUN", date: "19", items: [
    { time: "11:00", platform: "li", listing: "l-5", template: "testimonial", status: "scheduled" },
  ]},
];

export const LEADS = [
  { id: "le-1", name: "Priya Shah", stage: "new", interest: "l-1", source: "Reel · 14h ago", budget: 2400000, score: 92, hot: true, photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=70" },
  { id: "le-2", name: "Marcus & Tee Holloway", stage: "new", interest: "l-3", source: "Website · 1d", budget: 1500000, score: 78, photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=70" },
  { id: "le-3", name: "Devon Ashby", stage: "nurturing", interest: "l-6", source: "Email · 3d", budget: 3000000, score: 71, photo: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&auto=format&fit=crop&q=70" },
  { id: "le-4", name: "Carla Mendez", stage: "nurturing", interest: "l-4", source: "TikTok · 5d", budget: 1200000, score: 64, photo: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&auto=format&fit=crop&q=70" },
  { id: "le-5", name: "Quinn Park", stage: "tour", interest: "l-1", source: "Open House · Sat", budget: 2500000, score: 88, hot: true, photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=70" },
  { id: "le-6", name: "The Iversons", stage: "tour", interest: "l-2", source: "Reel · 2d", budget: 900000, score: 70, photo: "https://images.unsplash.com/photo-1521119989659-a83eee488004?w=200&auto=format&fit=crop&q=70" },
  { id: "le-7", name: "Asa Brennan", stage: "offer", interest: "l-5", source: "Direct · 8d", budget: 1700000, score: 95, hot: true, photo: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&auto=format&fit=crop&q=70" },
  { id: "le-8", name: "Yuki Tanaka", stage: "closed", interest: "l-4", source: "Email · closed", budget: 1185000, score: 100, photo: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200&auto=format&fit=crop&q=70" },
];

export const STAGES = [
  { id: "new", label: "New leads", tint: "#FFE4DC" },
  { id: "nurturing", label: "Nurturing", tint: "#FFF6D6" },
  { id: "tour", label: "Touring", tint: "#E2F0FF" },
  { id: "offer", label: "Offer in", tint: "#E8F8E5" },
  { id: "closed", label: "Closed", tint: "#D6FF3D" },
];

export const EMAIL_CAMPAIGNS = [
  { id: "c1", name: "New Listing Blast — Sunset Ridge", sent: 1840, opened: 0.51, clicked: 0.18, status: "sent", date: "Mon" },
  { id: "c2", name: "Open House Saturday — Jack London", sent: 1840, opened: 0.43, clicked: 0.12, status: "sent", date: "Tue" },
  { id: "c3", name: "Weekly Roundup #47", sent: 1840, opened: 0.38, clicked: 0.09, status: "scheduled", date: "Fri" },
];

// ====== SMALL COMPONENTS ======

export function Money({ value, big }) {
  const s = "$" + value.toLocaleString();
  return <span className="mono" style={{ fontWeight: big ? 700 : 500, letterSpacing: "-0.02em" }}>{s}</span>;
}

export function Avatar({ name, size = 36, ring, photo }) {
  const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  if (photo) {
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        backgroundImage: `url(${photo})`,
        backgroundSize: "cover", backgroundPosition: "center top",
        boxShadow: ring ? "0 0 0 3px var(--lime)" : "inset 0 0 0 1px rgba(0,0,0,0.05)",
        flexShrink: 0,
      }} />
    );
  }
  return (
    <div style={{
      width: size, height: size,
      borderRadius: "50%",
      background: "var(--ink)", color: "var(--bg-warm)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.floor(size * 0.36), fontWeight: 700, fontFamily: "var(--font-display)",
      letterSpacing: "-0.02em",
      boxShadow: ring ? "0 0 0 3px var(--lime)" : "none",
      flexShrink: 0,
    }}>{initials}</div>
  );
}

export const PlatformIcon = ({ p, size = 18 }) => {
  const meta = {
    ig: { bg: "linear-gradient(135deg,#FFA34D,#E1306C,#7232BD)", label: "IG" },
    tt: { bg: "#000", label: "TT", color: "#fff" },
    yt: { bg: "#FF0000", label: "YT", color: "#fff" },
    li: { bg: "#0A66C2", label: "in", color: "#fff" },
    fb: { bg: "#1877F2", label: "f", color: "#fff" },
  };
  const m = meta[p] || meta.ig;
  return (
    <span style={{
      width: size, height: size, borderRadius: 5,
      background: m.bg, color: m.color || "#fff",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.5, fontWeight: 700, letterSpacing: "-0.02em",
      flexShrink: 0,
    }}>{m.label}</span>
  );
};

export function ListingThumb({ listing, height = 120, label = true }) {
  return (
    <div style={{
      height, borderRadius: 12, position: "relative", overflow: "hidden",
      backgroundColor: listing.hero,
      backgroundImage: `url(${listing.img})`,
      backgroundSize: "cover", backgroundPosition: "center",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 100%)`,
      }} />
      {label && (
        <div style={{
          position: "absolute", top: 10, left: 10,
          fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,0.9)",
          letterSpacing: "0.1em", textTransform: "uppercase",
          background: "rgba(0,0,0,0.4)", padding: "3px 7px", borderRadius: 4,
          backdropFilter: "blur(4px)",
        }}>
          {listing.style} · {listing.photos} photos
        </div>
      )}
      <div style={{
        position: "absolute", bottom: 10, left: 12, right: 12,
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        color: "#fff",
      }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em", lineHeight: 1.1, textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
          {listing.address}
        </div>
      </div>
    </div>
  );
}

export function listingBg(listing) {
  return {
    backgroundColor: listing.hero,
    backgroundImage: `url(${listing.img})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

export function shade(hex, pct) {
  const num = parseInt(hex.replace("#", ""), 16);
  let r = (num >> 16) + Math.round(2.55 * pct);
  let g = ((num >> 8) & 0xff) + Math.round(2.55 * pct);
  let b = (num & 0xff) + Math.round(2.55 * pct);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

export function priceShort(p) {
  if (p >= 1000000) return "$" + (p / 1000000).toFixed(p % 1000000 === 0 ? 0 : 2) + "M";
  if (p >= 1000) return "$" + Math.round(p / 1000) + "K";
  return "$" + p;
}

export function statusPill(status) {
  const map = {
    posted: { label: "Posted", bg: "var(--bg)", color: "var(--ink-soft)", dot: "var(--ok)" },
    queued: { label: "Queued", bg: "var(--coral-soft)", color: "#8a1d05", dot: "var(--coral)" },
    generating: { label: "Generating", bg: "var(--lime)", color: "var(--ink)", dot: "var(--ink)" },
    scheduled: { label: "Scheduled", bg: "var(--bg)", color: "var(--ink-soft)", dot: "var(--ink-faint)" },
  };
  const m = map[status] || map.scheduled;
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

export function MiniChart({ data, color = "var(--ink)", height = 36, fill }) {
  const w = 120, h = height;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" ");
  const area = d + ` L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {fill && <path d={area} fill={fill} opacity="0.18" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SparkBars({ data, color = "var(--ink)", height = 36 }) {
  const max = Math.max(...data);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: `${(v / max) * 100}%`,
          background: color, borderRadius: 1.5, minHeight: 2,
        }} />
      ))}
    </div>
  );
}

export function useCount(target, dur = 1200) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let start;
    let raf;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

// ====== RENTAL & ILS MODE MOCK DATA ======

export const RENTAL_MANAGER = {
  name: "Sasha Reyes",
  company: "Linden Park Residential",
  city: "Oakland & SF Bay",
  photo: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=600&auto=format&fit=crop&q=70",
  units: 136,
  vacant: 14,
  occupancy: 0.897,
  email: "sasha@lindenpark.co",
};

export const BUILDINGS = [
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

export const UNITS = [
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

// ILS distribution channels
export const ILS_CHANNELS = [
  { id: "realme",      name: "RealMe Live",      tint: "#D6FF3D", ink: "#111", logo: "R", reach: "Owned",  views: 18420, kind: "owned",  syndicated: true },
  { id: "zillow",      name: "Zillow Rentals",   tint: "#1277E1", ink: "#fff", logo: "Z", reach: "192M /mo", views: 12_140, kind: "ils", syndicated: true },
  { id: "apartments",  name: "Apartments.com",   tint: "#001E62", ink: "#fff", logo: "A", reach: "97M /mo",  views: 8_420,  kind: "ils", syndicated: true },
  { id: "zumper",      name: "Zumper",           tint: "#FF4438", ink: "#fff", logo: "z", reach: "12M /mo",  views: 3_910,  kind: "ils", syndicated: true },
  { id: "trulia",      name: "Trulia",           tint: "#0CAE3F", ink: "#fff", logo: "T", reach: "55M /mo",  views: 4_780,  kind: "ils", syndicated: true },
  { id: "hotpads",     name: "HotPads",          tint: "#FFAD00", ink: "#111", logo: "H", reach: "8M /mo",   views: 2_010,  kind: "ils", syndicated: true },
  { id: "rent",        name: "Rent.com",         tint: "#0096AA", ink: "#fff", logo: "r", reach: "22M /mo",  views: 2_340,  kind: "ils", syndicated: false },
  { id: "fb",          name: "FB Marketplace",   tint: "#1877F2", ink: "#fff", logo: "f", reach: "Social",   views: 1_280,  kind: "social", syndicated: true },
  { id: "craigslist",  name: "Craigslist",       tint: "#5E2E8C", ink: "#fff", logo: "c", reach: "Classifieds", views: 980, kind: "ils", syndicated: false },
];

// Lease pipeline stages
export const LEASE_STAGES = [
  { id: "inquiry",    label: "Inquiry",       tint: "#FFE4DC" },
  { id: "tour",       label: "Tour booked",   tint: "#FFF6D6" },
  { id: "toured",     label: "Toured",        tint: "#E2F0FF" },
  { id: "application", label: "Application",  tint: "#EDE6FF" },
  { id: "approved",   label: "Approved",      tint: "#D6FF3D" },
];

export const RENTAL_LEADS = [
  { id: "rl-1", name: "Mae Lin",          stage: "inquiry",    unit: "u-1", source: "Zillow · 2h",      score: 88, hot: true,  budget: 3500, moveIn: "Jun 1",  pets: "Cat",   employer: "Stripe",        photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=70" },
  { id: "rl-2", name: "Jordan Hsu",        stage: "inquiry",   unit: "u-5", source: "RealMe Live · 3h", score: 79,             budget: 2500, moveIn: "Now",    pets: "None",  employer: "OUSD teacher",  photo: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&auto=format&fit=crop&q=70" },
  { id: "rl-3", name: "Bea & Tom Carter",  stage: "tour",      unit: "u-8", source: "TikTok reel · 1d", score: 84, hot: true,  budget: 4200, moveIn: "Jul 1",  pets: "Dog",   employer: "Kaiser · GS-13", photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=70" },
  { id: "rl-4", name: "Ravi Anand",        stage: "tour",      unit: "u-9", source: "Apartments.com",   score: 71,             budget: 4000, moveIn: "Now",    pets: "None",  employer: "Genentech",     photo: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&auto=format&fit=crop&q=70" },
  { id: "rl-5", name: "Naomi Park",        stage: "toured",    unit: "u-1", source: "Open House · Sat", score: 92, hot: true,  budget: 3500, moveIn: "Jun 1",  pets: "None",  employer: "Anthropic",     photo: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&auto=format&fit=crop&q=70" },
  { id: "rl-6", name: "Diego Salazar",     stage: "toured",    unit: "u-6", source: "Instagram DM",     score: 76,             budget: 3200, moveIn: "Jun 15", pets: "None",  employer: "BART",          photo: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=200&auto=format&fit=crop&q=70" },
  { id: "rl-7", name: "Wren Foley",        stage: "application", unit: "u-10", source: "Zumper",        score: 94, hot: true, budget: 5500, moveIn: "Jun 15", pets: "Dog",   employer: "Pixar",         photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=70" },
  { id: "rl-8", name: "Quinn Park",        stage: "application", unit: "u-11", source: "Direct · 5d",   score: 81,             budget: 3700, moveIn: "Jul 1",  pets: "None",  employer: "UCSF",          photo: "https://images.unsplash.com/photo-1521119989659-a83eee488004?w=200&auto=format&fit=crop&q=70" },
  { id: "rl-9", name: "Hana & Otis",       stage: "approved",    unit: "u-4", source: "RealMe Live",   score: 100,            budget: 7500, moveIn: "Aug 1",  pets: "None",  employer: "Roblox · L7",   photo: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200&auto=format&fit=crop&q=70" },
];

export const CONCESSION_PRESETS = [
  { id: "c-1", name: "One month free",          desc: "13-month lease, first month waived", popular: true,  uplift: "+44% inquiries" },
  { id: "c-2", name: "Two weeks free",          desc: "12-month lease, half month waived",  uplift: "+22% inquiries" },
  { id: "c-3", name: "Waived application fee",  desc: "Save renters $45 on app",            uplift: "+8% applications" },
  { id: "c-4", name: "$500 move-in credit",     desc: "Applied to first month rent",        uplift: "+18% inquiries" },
  { id: "c-5", name: "Pet fee waived",          desc: "Pet deposit & monthly fee free",     uplift: "+12% (pet owners)" },
  { id: "c-6", name: "Free parking, 12 months", desc: "$185/mo parking included",           uplift: "+19% applications" },
];

// Helpers
export function unitsOf(buildingId) {
  return UNITS.filter(u => u.buildingId === buildingId);
}
export function buildingOf(unitId) {
  const u = UNITS.find(x => x.id === unitId);
  return u ? BUILDINGS.find(b => b.id === u.buildingId) : null;
}
export function findUnit(id) { return UNITS.find(u => u.id === id); }
export function rentShort(n) {
  if (n >= 1000) return "$" + (n / 1000).toFixed(n % 1000 === 0 ? 1 : 2).replace(/\.0$/, "") + "k";
  return "$" + n;
}

/**
 * SSR-safe viewport hook. Returns false on the server + first paint (desktop),
 * then updates after mount. Use to branch the design's inline layout styles.
 */
export function useIsMobile(breakpoint = 820) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return isMobile;
}
