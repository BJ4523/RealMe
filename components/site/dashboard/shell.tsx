// @ts-nocheck
/* eslint-disable */
"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Sun,
  LayoutGrid,
  Clapperboard,
  CalendarDays,
  Mail,
  Users,
  Building2,
  Share2,
  Zap,
  Phone,
  Search,
  Bell,
  ChevronLeft,
  ArrowUpRight,
  TrendingUp,
  UserRound,
  Settings,
} from "lucide-react";
import {
  AGENT,
  LISTINGS,
  LEADS,
  RENTAL_MANAGER,
  RENTAL_LEADS,
  BUILDINGS,
  ILS_CHANNELS,
  Avatar,
  MiniChart,
  listingBg,
  priceShort,
  statusPill,
  useIsMobile,
} from "@/components/site/shared";
import { ListingsView, StudioView } from "@/components/site/dashboard/listings";
import { CalendarView, EmailView, LeadsView } from "@/components/site/dashboard/other";
import {
  RentalTodayView,
  PortfolioView,
  LeasePipelineView,
  SyndicationView,
  ConcessionsView,
} from "@/components/site/dashboard/rentals";

// RealMe — Dashboard shell + nav + Today overview

function Logo({ size = 22 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
    </div>
  );
}

export function DashboardShell({ onBackToSite, onOpenLive }) {
  const isMobile = useIsMobile();
  // MVP: sales-only. The Rentals mode + its mock sections are retired from the
  // UI (code kept for later).
  const [mode] = useState("sale");
  const [section, setSection] = useState("today");

  // Sections valid for the current mode
  const validSections = mode === "sale"
    ? ["today", "listings", "studio", "calendar", "email", "leads"]
    : ["today", "portfolio", "studio", "calendar", "email", "pipeline", "syndication", "concessions"];
  const currentSection = validSections.includes(section) ? section : "today";

  return (
    <div data-screen-label={mode === "sale" ? "02 Dashboard — Sales" : "03 Dashboard — Rentals"} style={{ display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: "100vh", background: "var(--bg)", maxWidth: "100%", overflowX: "hidden" }}>
      <style>{`.rm-nav-scroll::-webkit-scrollbar{display:none}`}</style>
      <Sidebar mode={mode} section={currentSection} setSection={setSection} onBackToSite={onBackToSite} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <DashTopBar mode={mode} section={currentSection} />
        <main style={{ flex: 1, padding: isMobile ? "18px 16px 96px" : "28px 32px 80px", overflowY: "auto" }}>
          {mode === "sale" && currentSection === "today" && <TodayView setSection={setSection} />}
          {mode === "sale" && currentSection === "listings" && <ListingsView setSection={setSection} />}
          {mode === "sale" && currentSection === "studio" && <StudioView />}
          {mode === "sale" && currentSection === "calendar" && <CalendarView />}
          {mode === "sale" && currentSection === "email" && <EmailView />}
          {mode === "sale" && currentSection === "leads" && <LeadsView />}

          {mode === "rent" && currentSection === "today" && <RentalTodayView setSection={setSection} />}
          {mode === "rent" && currentSection === "portfolio" && <PortfolioView setSection={setSection} />}
          {mode === "rent" && currentSection === "studio" && <StudioView />}
          {mode === "rent" && currentSection === "calendar" && <CalendarView />}
          {mode === "rent" && currentSection === "email" && <EmailView />}
          {mode === "rent" && currentSection === "pipeline" && <LeasePipelineView />}
          {mode === "rent" && currentSection === "syndication" && <SyndicationView />}
          {mode === "rent" && currentSection === "concessions" && <ConcessionsView />}
        </main>
      </div>
      {isMobile && (
        <BottomTabBar section={currentSection} setSection={setSection} />
      )}
    </div>
  );
}

// Consolidated to the working core: a Dashboard overview (internal "today"
// section) + direct links to the real functional pages. The mock sections
// (Calendar/Email/Leads/Studio + the whole Rentals mode) are kept in the repo
// but no longer linked. `href` items navigate out; the rest set the section.
function getNav() {
  return [
    { id: "today", label: "Dashboard", icon: Sun },
    { id: "listings", label: "Listings", icon: LayoutGrid, href: "/listings" },
    { id: "videos", label: "Videos", icon: Clapperboard, href: "/videos" },
    { id: "avatar", label: "Avatar", icon: UserRound, href: "/settings/avatar" },
  ];
}

// Native-style fixed bottom tab bar (mobile only). Four core items, evenly
// spaced (no scrolling): the Dashboard overview section + links to the real
// Listings / Videos / Avatar pages.
function BottomTabBar({ section, setSection }) {
  const items = getNav();
  const tabStyle = (active) => ({
    flex: "1 1 0", minWidth: 0,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
    padding: "5px 4px", background: "transparent", textDecoration: "none",
    color: active ? "var(--ink)" : "var(--ink-soft)",
  });
  const inner = (item, active) => {
    const Icon = item.icon;
    return (
      <>
        {active && (
          <span style={{ position: "absolute", top: -6, width: 22, height: 3, borderRadius: 99, background: "var(--lime)" }} />
        )}
        <Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
        <span style={{ fontSize: 9.5, fontWeight: active ? 700 : 500, letterSpacing: "-0.01em" }}>
          {item.label}
        </span>
      </>
    );
  };
  return (
    <nav
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50,
        display: "flex", background: "var(--bg-warm)",
        borderTop: "1px solid var(--rule)",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.05)",
        padding: "6px 2px",
        paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))",
      }}>
      {items.map(item =>
        item.href ? (
          <a key={item.id} href={item.href} style={{ position: "relative", ...tabStyle(false) }}>
            {inner(item, false)}
          </a>
        ) : (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            style={{ position: "relative", ...tabStyle(section === item.id) }}
          >
            {inner(item, section === item.id)}
          </button>
        ),
      )}
    </nav>
  );
}

function Sidebar({ mode, section, setSection, onBackToSite }) {
  const isMobile = useIsMobile();
  const nav = getNav();
  const profile = mode === "sale" ? AGENT : RENTAL_MANAGER;
  const profileSub = mode === "sale" ? AGENT.brokerage : RENTAL_MANAGER.company;
  return (
    <aside style={isMobile ? {
      width: "100%", background: "var(--bg-warm)", borderBottom: "1px solid var(--rule)",
      display: "flex", flexDirection: "row", flexShrink: 0,
      overflowX: "auto", alignItems: "stretch",
      position: "sticky", top: 0, zIndex: 40,
    } : {
      width: 240, background: "var(--bg-warm)", borderRight: "1px solid var(--rule)",
      display: "flex", flexDirection: "column", flexShrink: 0,
      position: "sticky", top: 0, height: "100vh",
    }}>
      <div style={{ padding: isMobile ? "12px 12px 12px 14px" : "20px 18px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
        <Logo size={isMobile ? 20 : 22} />
        {!isMobile && (
          <button onClick={onBackToSite} className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: "4px 8px", fontFamily: "var(--font-mono)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <ChevronLeft size={13} /> site
          </button>
        )}
      </div>

      {!isMobile && (
        <div style={{ padding: "8px 12px" }}>
          <a href="/settings/avatar" title="Manage your avatar & settings" style={{
            background: "var(--bg-card)", borderRadius: 12, padding: 12,
            border: "1px solid var(--rule)", textDecoration: "none", color: "inherit",
            display: "flex", gap: 10, alignItems: "center",
          }}>
            <Avatar name={profile.name} size={36} ring photo={profile.photo} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{profile.name}</div>
              <div style={{ fontSize: 10, color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>
                {profileSub}
              </div>
            </div>
            <Settings size={15} style={{ color: "var(--ink-soft)", flexShrink: 0 }} />
          </a>
        </div>
      )}

      {!isMobile && (
      <nav style={{ padding: "8px", flex: 1 }}>
        {nav.map(item => {
          const active = !item.href && section === item.id;
          const Icon = item.icon;
          const style = {
            display: "flex", alignItems: "center", gap: 12,
            width: "100%", padding: "10px 12px", borderRadius: 10,
            background: active ? "var(--ink)" : "transparent",
            color: active ? "var(--bg-warm)" : "var(--ink)",
            fontWeight: 500, fontSize: 14, textAlign: "left",
            marginBottom: 2, flexShrink: 0, whiteSpace: "nowrap",
            textDecoration: "none", transition: "background 0.16s ease",
          };
          const body = (
            <>
              <Icon size={16} style={{ flexShrink: 0, opacity: active ? 1 : 0.78 }} />
              <span style={{ flex: 1 }}>{item.label}</span>
            </>
          );
          return item.href ? (
            <a key={item.id} href={item.href} style={style}>{body}</a>
          ) : (
            <button key={item.id} onClick={() => setSection(item.id)} style={style}>
              {body}
            </button>
          );
        })}
      </nav>
      )}

      {!isMobile && (
        <div style={{ padding: 12, borderTop: "1px solid var(--rule)" }}>
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", marginBottom: 6 }}>
            THIS MONTH
          </div>
          <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between" }}>
            <span>Reels generated</span><span className="mono">{AGENT.videos}/100</span>
          </div>
          <div style={{ height: 4, background: "var(--bg)", borderRadius: 99, marginTop: 4, marginBottom: 12 }}>
            <div style={{ height: "100%", width: "47%", background: "var(--lime)", borderRadius: 99 }} />
          </div>
          <button className="btn btn-outline btn-sm" style={{ width: "100%", justifyContent: "center", fontSize: 12 }}>
            Upgrade to unlimited
          </button>
        </div>
      )}
    </aside>
  );
}

function DashTopBar({ mode, section }) {
  const isMobile = useIsMobile();
  const titlesSale = {
    today: "Today",
    listings: "Listings",
    studio: "Video Studio",
    calendar: "Content Calendar",
    email: "Email Campaigns",
    leads: "Leads Pipeline",
  };
  const subtitlesSale = {
    today: "Wed, May 15 · You have 4 things to look at",
    listings: `${LISTINGS.length} active · ${LISTINGS.filter(l => l.autoImported).length} auto-imported from MLS`,
    studio: "Generate reels of you talking about your listings",
    calendar: "11 posts queued for the week of May 13",
    email: "1,840 contacts · last blast sent Tuesday 8:00 AM",
    leads: `${LEADS.length} active leads · ${LEADS.filter(l => l.hot).length} hot this morning`,
  };
  const titlesRent = {
    today: "Today",
    portfolio: "Portfolio",
    studio: "Video Studio",
    calendar: "Content Calendar",
    email: "Renter Emails",
    pipeline: "Lease Pipeline",
    syndication: "ILS Syndication",
    concessions: "Concessions",
  };
  const subtitlesRent = {
    today: `Wed, May 15 · ${RENTAL_MANAGER.vacant} vacant units across ${BUILDINGS.length} buildings`,
    portfolio: `${BUILDINGS.length} buildings · ${RENTAL_MANAGER.units} units · ${Math.round(RENTAL_MANAGER.occupancy * 100)}% occupied`,
    studio: "Generate reels for every vacant unit",
    calendar: "11 posts queued for the week of May 13",
    email: "4,820 renters on your waitlist · last blast sent Tuesday",
    pipeline: `${RENTAL_LEADS.length} active leads · ${RENTAL_LEADS.filter(l => l.hot).length} hot this morning`,
    syndication: `Pushing to ${ILS_CHANNELS.filter(c => c.syndicated).length} ILS channels · 54.3k views last 30d`,
    concessions: "Stale unit? Drop a concession. Auto-renders a reel and reposts.",
  };
  const titles = mode === "sale" ? titlesSale : titlesRent;
  const subtitles = mode === "sale" ? subtitlesSale : subtitlesRent;
  return (
    <header style={{
      padding: isMobile ? "14px 16px 12px" : "20px 32px 16px",
      borderBottom: "1px solid var(--rule)",
      background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: isMobile ? "wrap" : "nowrap", gap: isMobile ? 10 : 0,
      position: isMobile ? "static" : "sticky", top: 0, zIndex: 30,
    }}>
      <div style={isMobile ? { width: "100%" } : undefined}>
        <h1 className="display" style={{ fontSize: isMobile ? 24 : 32, margin: 0 }}>{titles[section]}</h1>
        <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 2 }}>{subtitles[section]}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, width: isMobile ? "100%" : "auto", flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <div style={{ position: "relative", flex: isMobile ? 1 : "none", minWidth: isMobile ? 0 : undefined }}>
          <input className="field" placeholder="Search listings, leads, posts…" style={{ width: isMobile ? "100%" : 280, paddingLeft: 32 }} />
          <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "var(--ink-faint)" }} />
        </div>
        <button className="btn btn-ghost btn-sm" style={{ position: "relative", padding: "8px 10px", display: "inline-flex", alignItems: "center" }}>
          <Bell size={16} />
          <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: "50%", background: "var(--coral)" }} />
        </button>
        {/* Clear exits to the functional app — manage data + your twin. */}
        {!isMobile && (
          <a href="/listings" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
            Listings
          </a>
        )}
        {!isMobile && (
          <a href="/videos" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
            Videos
          </a>
        )}
        <a href="/settings/avatar" title="Your avatar & looks" className="btn btn-ghost btn-sm" style={{ padding: "8px 10px", display: "inline-flex", alignItems: "center" }}>
          <UserRound size={16} />
        </a>
        <a href="/listings" className="btn btn-primary btn-sm">+ New reel</a>
      </div>
    </header>
  );
}

// ====== TODAY VIEW ======
function TodayView({ setSection }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <HeroToday setSection={setSection} />
        <TodayActivity />
        <TodayPerformance />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <TodayActions setSection={setSection} />
        <TodayUpNext />
        <TodayDigest />
      </div>
    </div>
  );
}

function HeroToday({ setSection }) {
  const isMobile = useIsMobile();
  const newListing = LISTINGS.find(l => l.status === "new");
  return (
    <div style={{
      background: "var(--ink)", color: "var(--bg-warm)",
      borderRadius: 20, padding: isMobile ? 20 : 28, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", right: -60, top: -60, width: 280, height: 280, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(214,255,61,0.25), transparent 60%)",
      }} />
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "start", gap: isMobile ? 16 : 28 }}>
        <div style={{ flex: 1, position: "relative", zIndex: 1 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: "var(--font-mono)", fontSize: 11,
            padding: "5px 10px", borderRadius: 999,
            background: "rgba(246,242,234,0.08)", color: "var(--bg-warm)",
            border: "1px solid rgba(246,242,234,0.15)",
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--lime)" }} />
            Auto-detected · 3 min ago
          </span>
          <h2 className="display" style={{ fontSize: isMobile ? 30 : 44, margin: "16px 0 12px", letterSpacing: "-0.03em", lineHeight: 0.98 }}>
            New listing dropped.<br />Want a reel?
          </h2>
          <p style={{ fontSize: 15, color: "rgba(246,242,234,0.75)", maxWidth: 480, lineHeight: 1.5 }}>
            <strong style={{ color: "var(--bg-warm)" }}>{newListing.address}</strong> · {newListing.city} · {priceShort(newListing.price)}.
            Walkthrough script drafted. Approve to render in 14s, post in 4 min.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button className="btn btn-lime" onClick={() => setSection("studio")} style={{ fontSize: 14 }}>
              Review script & generate →
            </button>
            <button className="btn btn-ghost" style={{ color: "var(--bg-warm)", fontSize: 14 }}>Skip this one</button>
          </div>
        </div>
        <div style={{
          width: isMobile ? "100%" : 160, height: isMobile ? 160 : 200, borderRadius: 14, flexShrink: 0,
          ...listingBg(newListing),
          border: "1px solid rgba(246,242,234,0.1)",
          position: "relative", zIndex: 1, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 50%)" }} />
          <div style={{ padding: 12, color: "#fff", fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", position: "relative" }}>
            {newListing.style.toUpperCase()}
          </div>
        </div>
      </div>
    </div>
  );
}

function TodayActivity() {
  const activity = [
    { t: "9:04 AM", icon: Mail, text: "Sent open house blast — Sunset Ridge", meta: "1,840 buyers · 51% opened", lime: true },
    { t: "8:32 AM", icon: Clapperboard, text: "Posted walkthrough to TikTok — 612 Maple", meta: "4,210 views in first 24h" },
    { t: "8:00 AM", icon: Users, text: "Priya Shah replied to your Reel DM", meta: "Hot lead · 92/100 — call before noon", hot: true },
    { t: "7:18 AM", icon: Clapperboard, text: "Auto-imported 1 new listing from MLS", meta: "5 Eucalyptus Pl · scripted, awaiting your OK" },
    { t: "Yesterday", icon: Mail, text: "Carla Mendez clicked 'Book showing' link", meta: "TikTok → email → showing in 14 min" },
  ];
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <span className="eyebrow">Today · auto-pilot log</span>
          <div className="display" style={{ fontSize: 22, marginTop: 4 }}>What RealMe did while you slept</div>
        </div>
        <span className="tag mono">Live</span>
      </div>
      <ul className="clean" style={{ display: "flex", flexDirection: "column" }}>
        {activity.map((a, i) => (
          <li key={i} style={{
            display: "flex", gap: 14, padding: "12px 0",
            borderTop: i === 0 ? "none" : "1px solid var(--rule-soft)",
            alignItems: "start",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: a.lime ? "var(--lime)" : a.hot ? "var(--coral-soft)" : "var(--bg)",
              color: a.hot ? "var(--coral)" : "var(--ink)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, flexShrink: 0,
            }}><a.icon size={15} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{a.text}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>{a.meta}</div>
            </div>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{a.t}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TodayPerformance() {
  const isMobile = useIsMobile();
  const reelData = [12, 18, 14, 22, 28, 24, 35, 31, 42, 38, 47, 52, 58, 62];
  const emailData = [40, 48, 42, 51, 53, 47, 55, 58];
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
      <PerfCard label="Reel views · 30d" value="184.2k" delta="+34%" data={reelData} color="var(--ink)" fill="var(--lime)" />
      <PerfCard label="Email open rate" value="51%" delta="+6 pts" data={emailData} color="var(--ink)" fill="var(--lime)" />
      <PerfCard label="Showings booked" value="14" delta="+9 vs. last mo" data={[2,3,3,4,5,3,4,5,6,5,7]} color="var(--ink)" fill="var(--lime)" />
    </div>
  );
}

function PerfCard({ label, value, delta, data, color, fill }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
        <div className="display" style={{ fontSize: 32 }}>{value}</div>
        <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ok)", display: "inline-flex", alignItems: "center", gap: 3 }}><TrendingUp size={12} /> {delta}</div>
      </div>
      <div style={{ marginTop: 8 }}>
        <MiniChart data={data} color={color} fill={fill} height={36} />
      </div>
    </div>
  );
}

function TodayActions({ setSection }) {
  return (
    <div className="card" style={{ padding: 20, background: "var(--bg-warm)" }}>
      <span className="eyebrow">Quick actions</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {[
          { l: "Generate reel for new listing", icon: Clapperboard, to: "studio", primary: true },
          { l: "Draft this week's email blast", icon: Mail, to: "email" },
          { l: "Call Priya Shah · hot", icon: Phone, to: "leads", coral: true },
          { l: "Review Saturday's open house post", icon: CalendarDays, to: "calendar" },
        ].map((a, i) => (
          <button key={i} onClick={() => setSection(a.to)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            background: a.primary ? "var(--ink)" : a.coral ? "var(--coral-soft)" : "var(--bg-card)",
            color: a.primary ? "var(--bg-warm)" : a.coral ? "#8a1d05" : "var(--ink)",
            border: a.primary || a.coral ? "none" : "1px solid var(--rule)",
            borderRadius: 10, fontSize: 13, fontWeight: 500, textAlign: "left",
          }}>
            <span style={{ width: 18, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><a.icon size={16} /></span>
            <span style={{ flex: 1 }}>{a.l}</span>
            <span>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TodayUpNext() {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="eyebrow">Up next</span>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>NEXT 24H</span>
      </div>
      <ul className="clean" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
        {[
          { t: "9:30 AM", text: "IG · Just Listed: Eucalyptus Pl", status: "generating" },
          { t: "6:00 PM", text: "TT · Walkthrough: Anchor Way", status: "generating" },
          { t: "Tomorrow 8 AM", text: "Email · Friday Roundup", status: "queued" },
          { t: "Tomorrow 9 AM", text: "IG · Open House invite: Jack London", status: "scheduled" },
        ].map((u, i) => (
          <li key={i} style={{ display: "flex", gap: 12, alignItems: "start" }}>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", width: 80, flexShrink: 0, paddingTop: 2 }}>{u.t}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13 }}>{u.text}</div>
              <div style={{ marginTop: 4 }}>{statusPill(u.status)}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TodayDigest() {
  return (
    <div className="card" style={{ padding: 20, background: "var(--ink)", color: "var(--bg-warm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--lime)", color: "var(--ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 11 }}>R</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(246,242,234,0.6)", letterSpacing: "0.08em", textTransform: "uppercase" }}>RealMe · 7:14 AM</span>
      </div>
      <div style={{ marginTop: 14, fontSize: 16, lineHeight: 1.45, fontFamily: "var(--font-display)", letterSpacing: "-0.015em" }}>
        Heads up — your walkthroughs are crushing it lately. Like, 3× better than the
        Just-Listed pops. Want me to swap Wed and Fri to walkthroughs and free up your
        afternoon?
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn-lime btn-sm">Yeah, do it</button>
        <button className="btn btn-ghost btn-sm" style={{ color: "var(--bg-warm)" }}>Not yet</button>
      </div>
    </div>
  );
}
