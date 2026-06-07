// @ts-nocheck
/* eslint-disable */
"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  LISTINGS,
  LEADS,
  STAGES,
  POSTS_WEEK,
  VIDEO_TEMPLATES,
  EMAIL_CAMPAIGNS,
  Avatar,
  PlatformIcon,
  ListingThumb,
  listingBg,
  priceShort,
  statusPill,
} from "@/components/site/shared";

// ====== CALENDAR VIEW ======
export function CalendarView() {
  const [posts, setPosts] = useState(POSTS_WEEK);
  const [autopilot, setAutopilot] = useState(true);
  const [showAdd, setShowAdd] = useState(null);
  const [dragging, setDragging] = useState(null);

  function onDrop(toDayIndex) {
    if (!dragging) return;
    const { fromDay, fromIdx } = dragging;
    if (fromDay === toDayIndex) { setDragging(null); return; }
    setPosts(prev => {
      const next = prev.map(d => ({ ...d, items: [...d.items] }));
      const [moved] = next[fromDay].items.splice(fromIdx, 1);
      next[toDayIndex].items.push({ ...moved, status: "scheduled" });
      return next;
    });
    setDragging(null);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-outline btn-sm">‹</button>
          <span className="display" style={{ fontSize: 22 }}>May 13 – 19, 2026</span>
          <button className="btn btn-outline btn-sm">›</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: "var(--ink-soft)" }}>Today</button>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{
            display: "flex", alignItems: "center", gap: 8,
            background: autopilot ? "var(--lime)" : "var(--bg-card)",
            padding: "8px 14px", borderRadius: 999,
            border: "1px solid " + (autopilot ? "var(--lime-dark)" : "var(--rule)"),
            cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>
            <input type="checkbox" checked={autopilot} onChange={e => setAutopilot(e.target.checked)} style={{ display: "none" }} />
            <span style={{
              width: 28, height: 16, borderRadius: 99,
              background: autopilot ? "var(--ink)" : "var(--ink-faint)",
              position: "relative",
            }}>
              <span style={{
                position: "absolute", top: 2, left: autopilot ? 14 : 2,
                width: 12, height: 12, borderRadius: "50%", background: "#fff",
                transition: "left 0.15s",
              }} />
            </span>
            Auto-pilot {autopilot ? "ON" : "OFF"}
          </label>
          <button className="btn btn-primary btn-sm">+ Add post</button>
        </div>
      </div>

      {/* Channels strip */}
      <div className="card" style={{ padding: 14, marginBottom: 18, display: "flex", gap: 14, alignItems: "center" }}>
        <span className="eyebrow">Channels</span>
        <div style={{ flex: 1, display: "flex", gap: 8 }}>
          {[
            { p: "ig", n: "@jordan.maes", c: 8420 },
            { p: "tt", n: "@jordanm.realestate", c: 5210 },
            { p: "yt", n: "@JordanMaesHomes", c: 1840 },
            { p: "li", n: "Jordan Maes", c: 2418 },
          ].map(c => (
            <div key={c.p} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", border: "1px solid var(--rule)", borderRadius: 8, background: "var(--bg-warm)" }}>
              <PlatformIcon p={c.p} size={16} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{c.n}</div>
                <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{c.c.toLocaleString()} followers</div>
              </div>
              <span className="dot" style={{ background: "var(--ok)", marginLeft: 4 }} />
            </div>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>+ Connect</button>
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
        {posts.map((day, di) => (
          <div key={di}
            onDragOver={e => e.preventDefault()}
            onDrop={() => onDrop(di)}
            style={{
              background: "var(--bg-card)", borderRadius: 14, padding: 14,
              border: "1px solid " + (dragging ? "var(--lime-dark)" : "var(--rule)"),
              minHeight: 480, display: "flex", flexDirection: "column", gap: 8,
              boxShadow: dragging && dragging.fromDay !== di ? "inset 0 0 0 2px var(--lime)" : "none",
            }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 8, borderBottom: "1px solid var(--rule-soft)" }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{day.label}</div>
                <div className="display" style={{ fontSize: 22 }}>{day.date}</div>
              </div>
              <button onClick={() => setShowAdd(di === showAdd ? null : di)} style={{ fontSize: 14, color: "var(--ink-faint)", padding: 4 }}>+</button>
            </div>

            {day.items.map((item, ii) => {
              const listing = LISTINGS.find(l => l.id === item.listing);
              const tmpl = VIDEO_TEMPLATES.find(t => t.id === item.template);
              return (
                <div key={ii}
                  draggable
                  onDragStart={() => setDragging({ fromDay: di, fromIdx: ii })}
                  onDragEnd={() => setDragging(null)}
                  style={{
                    background: item.status === "generating" ? "var(--lime)" :
                                item.status === "posted" ? "var(--bg)" : "var(--bg-warm)",
                    border: "1px solid var(--rule)", borderRadius: 10,
                    padding: 10, cursor: "grab",
                    opacity: dragging && dragging.fromDay === di && dragging.fromIdx === ii ? 0.3 : 1,
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <PlatformIcon p={item.platform} size={14} />
                      <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{item.time}</span>
                    </div>
                    <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{tmpl?.duration}</span>
                  </div>
                  <div style={{
                    height: 56, borderRadius: 6, marginBottom: 6,
                    ...listingBg(listing),
                    position: "relative", overflow: "hidden",
                  }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)" }} />
                    <div style={{ position: "absolute", bottom: 4, left: 6, color: "#fff", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.05em" }}>
                      {tmpl?.name.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {listing.address}
                  </div>
                  <div style={{ marginTop: 6 }}>{statusPill(item.status)}</div>
                  {item.views && (
                    <div style={{ marginTop: 4, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>
                      {(item.views / 1000).toFixed(1)}k views
                    </div>
                  )}
                </div>
              );
            })}

            {showAdd === di && (
              <button style={{
                padding: 10, border: "1.5px dashed var(--ink)", borderRadius: 10,
                fontSize: 11, color: "var(--ink-soft)", background: "transparent",
              }}>+ Auto-fill day</button>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, padding: 16, background: "var(--ink)", color: "var(--bg-warm)", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--lime)", color: "var(--ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 11 }}>R</span>
          <div>
            <div style={{ fontSize: 14, fontFamily: "var(--font-display)", letterSpacing: "-0.015em" }}>I'm drafting next week (May 20–26).</div>
            <div style={{ fontSize: 12, color: "rgba(246,242,234,0.55)" }}>9 reels ready · waiting on your call about the Eucalyptus new construction</div>
          </div>
        </div>
        <button className="btn btn-lime btn-sm">Review next week →</button>
      </div>
    </div>
  );
}

// ====== EMAIL VIEW ======
export function EmailView() {
  const [subject, setSubject] = useState("New in Berkeley Hills — 1471 Sunset Ridge, $2.495M");
  const [body, setBody] = useState("");
  const [segment, setSegment] = useState("hot-buyers");
  const [tab, setTab] = useState("compose");

  useEffect(() => {
    setBody(
`Hey {first_name} —

Just listed a {style} four-bedroom on Sunset Ridge that I think hits everything on your wishlist. Walnut paneling, original tilework, and a primary suite with a view all the way to the Bay.

Asking $2.495M. Open house Saturday 1–4.

Watch the 32-second walkthrough below, or DM me back and I'll show you privately Friday evening.

— Jordan`
    );
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[
          { id: "compose", label: "Compose" },
          { id: "campaigns", label: "Campaigns", n: EMAIL_CAMPAIGNS.length },
          { id: "audience", label: "Audience", n: "1.8k" },
          { id: "templates", label: "Templates" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500,
              background: tab === t.id ? "var(--ink)" : "transparent",
              color: tab === t.id ? "var(--bg-warm)" : "var(--ink)",
              border: tab === t.id ? "1px solid var(--ink)" : "1px solid var(--rule)",
            }}>
            {t.label}
            {t.n && <span style={{ fontFamily: "var(--font-mono)", marginLeft: 4, opacity: 0.6, fontSize: 11 }}>{t.n}</span>}
          </button>
        ))}
      </div>

      {tab === "compose" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {/* Composer */}
          <div className="card" style={{ padding: 24 }}>
            <span className="eyebrow">Compose</span>

            <div style={{ marginTop: 16 }}>
              <Label>For listing</Label>
              <ListingPicker />
            </div>

            <div style={{ marginTop: 16 }}>
              <Label>Send to</Label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { id: "hot-buyers", label: "Hot buyers (>$1.5M)", n: 1840 },
                  { id: "all", label: "All sphere", n: 4201 },
                  { id: "neighborhood", label: "Berkeley Hills only", n: 612 },
                  { id: "past-clients", label: "Past clients", n: 184 },
                ].map(s => (
                  <button key={s.id} onClick={() => setSegment(s.id)} style={{
                    padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                    background: segment === s.id ? "var(--ink)" : "var(--bg)",
                    color: segment === s.id ? "var(--bg-warm)" : "var(--ink)",
                    border: "1px solid " + (segment === s.id ? "var(--ink)" : "var(--rule)"),
                  }}>
                    {s.label}
                    <span style={{ fontFamily: "var(--font-mono)", marginLeft: 6, opacity: 0.6, fontSize: 10 }}>{s.n.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <Label>Subject</Label>
              <input className="field" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>

            <div style={{ marginTop: 16 }}>
              <Label>Body · drafted by RealMe</Label>
              <textarea className="field" value={body} onChange={e => setBody(e.target.value)} rows={11} style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, resize: "vertical" }} />
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <SmartChip>↻ Rewrite warmer</SmartChip>
                <SmartChip>↻ Make it shorter</SmartChip>
                <SmartChip>+ Add open house details</SmartChip>
                <SmartChip>+ Insert walkthrough video</SmartChip>
              </div>
            </div>

            <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 18, borderTop: "1px solid var(--rule-soft)" }}>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                Will send to <strong className="mono">1,840</strong> contacts · Friday 8:00 AM
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline btn-sm">Send test</button>
                <button className="btn btn-primary">Schedule send →</button>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span className="eyebrow">Preview · how it lands</span>
              <span className="tag mono">Desktop · Gmail</span>
            </div>
            <EmailPreview subject={subject} body={body} />
          </div>
        </div>
      )}

      {tab === "campaigns" && <CampaignsList />}
      {tab === "audience" && <AudienceView />}
      {tab === "templates" && <EmailTemplates />}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6 }}>{children}</div>;
}

function SmartChip({ children }) {
  return <button style={{
    padding: "5px 10px", border: "1px solid var(--rule)", borderRadius: 999,
    fontSize: 11, fontFamily: "var(--font-mono)", background: "var(--bg)",
  }}>{children}</button>;
}

function ListingPicker() {
  return (
    <div style={{ padding: 10, border: "1px solid var(--rule)", borderRadius: 10, background: "var(--bg)", display: "flex", gap: 10, alignItems: "center" }}>
      <div style={{ width: 44, height: 44, borderRadius: 8, ...listingBg(LISTINGS[0]) }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{LISTINGS[0].address}</div>
        <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{LISTINGS[0].city} · {priceShort(LISTINGS[0].price)}</div>
      </div>
      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>change</button>
    </div>
  );
}

function EmailPreview({ subject, body }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", background: "#fff" }}>
      <div style={{ padding: "12px 18px", background: "var(--bg)", borderBottom: "1px solid var(--rule)", fontSize: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span><strong>From</strong> Jordan Maes &lt;jordan@bayline.com&gt;</span>
          <span style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>Fri, May 17 · 8:00 AM</span>
        </div>
        <div style={{ marginTop: 4 }}><strong>To</strong> Priya Shah &lt;priya@example.com&gt;</div>
      </div>
      <div style={{ padding: "24px 28px" }}>
        <div className="display" style={{ fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{subject}</div>
        <div style={{ marginTop: 22 }}>
          <ListingThumb listing={LISTINGS[0]} height={220} />
          <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--ink)", color: "var(--bg-warm)", borderRadius: 6, fontSize: 12, fontFamily: "var(--font-mono)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>▶ Watch 32s walkthrough</span>
            <span>4.2k views</span>
          </div>
        </div>
        <div style={{ marginTop: 20, fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#2a2a28" }}>
          {body.replace("{first_name}", "Priya").replace("{style}", "mid-century")}
        </div>
        <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
          <button className="btn btn-primary btn-sm">Book a private showing →</button>
          <button className="btn btn-outline btn-sm">See full listing</button>
        </div>
        <div style={{ marginTop: 28, paddingTop: 14, borderTop: "1px solid var(--rule)", fontSize: 11, color: "var(--ink-soft)", fontFamily: "var(--font-mono)", display: "flex", justifyContent: "space-between" }}>
          <span>Jordan Maes · Bayline Realty · DRE #01984012</span>
          <span>Unsubscribe</span>
        </div>
      </div>
    </div>
  );
}

function CampaignsList() {
  const all = [
    ...EMAIL_CAMPAIGNS,
    { id: "c4", name: "Sunset Ridge Open House — Saturday", sent: 1840, opened: 0.48, clicked: 0.14, status: "sent", date: "Wed" },
    { id: "c5", name: "Just Closed — Anchor Way", sent: 184, opened: 0.62, clicked: 0.22, status: "sent", date: "Mon" },
    { id: "c6", name: "Friday Roundup #46", sent: 1840, opened: 0.39, clicked: 0.10, status: "sent", date: "Last Fri" },
  ];
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead style={{ background: "var(--bg-warm)" }}>
          <tr style={{ borderBottom: "1px solid var(--rule)" }}>
            <th style={th}>Campaign</th><th style={th}>Sent</th><th style={th}>Open rate</th><th style={th}>Click-through</th><th style={th}>Status</th><th style={th}>Date</th>
          </tr>
        </thead>
        <tbody>
          {all.map(c => (
            <tr key={c.id} style={{ borderBottom: "1px solid var(--rule-soft)" }}>
              <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
              <td style={td}><span className="mono">{c.sent.toLocaleString()}</span></td>
              <td style={td}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="mono">{(c.opened * 100).toFixed(0)}%</span>
                  <div style={{ width: 80, height: 6, background: "var(--bg)", borderRadius: 99 }}>
                    <div style={{ height: "100%", width: `${c.opened * 100}%`, background: "var(--lime)", borderRadius: 99 }} />
                  </div>
                </div>
              </td>
              <td style={td}><span className="mono">{(c.clicked * 100).toFixed(0)}%</span></td>
              <td style={td}>{statusPill(c.status === "sent" ? "posted" : c.status)}</td>
              <td style={{ ...td, color: "var(--ink-soft)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{c.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = { textAlign: "left", padding: "12px 16px", fontWeight: 500, color: "var(--ink-soft)", fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" };
const td = { padding: "14px 16px" };

function AudienceView() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 18 }}>
      <div className="card" style={{ padding: 20 }}>
        <span className="eyebrow">Sphere</span>
        <div className="display" style={{ fontSize: 48, marginTop: 4 }}>4,201</div>
        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>contacts · +148 this month</div>
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <Bar label="Hot buyers" v={0.44} n={1840} />
          <Bar label="Past clients" v={0.04} n={184} />
          <Bar label="Sphere of influence" v={0.32} n={1340} />
          <Bar label="Cold" v={0.20} n={837} />
        </div>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span className="eyebrow">Where they came from · 30d</span>
          <span className="tag mono" style={{ fontSize: 11 }}>+148 added</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {[
            { src: "Instagram reel DMs", n: 62, pct: 42, p: "ig" },
            { src: "TikTok comments", n: 31, pct: 21, p: "tt" },
            { src: "Website lead form", n: 28, pct: 19 },
            { src: "Open house sign-ins", n: 14, pct: 9 },
            { src: "YouTube descriptions", n: 8, pct: 5, p: "yt" },
            { src: "Direct referrals", n: 5, pct: 4 },
          ].map((s, i) => (
            <div key={i} style={{ padding: 12, background: "var(--bg-warm)", border: "1px solid var(--rule)", borderRadius: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {s.p && <PlatformIcon p={s.p} size={14} />}
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{s.src}</span>
                </div>
                <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{s.n}</span>
              </div>
              <div style={{ height: 4, background: "var(--bg)", borderRadius: 99, marginTop: 8 }}>
                <div style={{ height: "100%", width: `${s.pct}%`, background: "var(--ink)", borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bar({ label, v, n }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span>{label}</span><span className="mono">{n.toLocaleString()}</span>
      </div>
      <div style={{ height: 8, background: "var(--bg)", borderRadius: 99 }}>
        <div style={{ height: "100%", width: `${v * 100}%`, background: "var(--lime)", borderRadius: 99 }} />
      </div>
    </div>
  );
}

function EmailTemplates() {
  const templates = [
    { name: "Just Listed Blast", desc: "Punchy. Image + 3 sentences + CTA.", uses: 47 },
    { name: "Open House Saturday", desc: "Friday morning send. Day-of reminder builds.", uses: 32 },
    { name: "Price Drop", desc: "Old + new price slam-cut. One CTA only.", uses: 14 },
    { name: "Just Closed", desc: "Buyer testimonial. Soft sell future referrals.", uses: 28 },
    { name: "Friday Roundup", desc: "5 new listings + 1 neighborhood story.", uses: 47 },
    { name: "Personal Note", desc: "1-to-1 outreach drafted from CRM data.", uses: 184 },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
      {templates.map(t => (
        <div key={t.name} className="card" style={{ padding: 18 }}>
          <div className="display" style={{ fontSize: 20 }}>{t.name}</div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6 }}>{t.desc}</div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>USED {t.uses}×</span>
            <button className="btn btn-outline btn-sm">Use →</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ====== LEADS VIEW ======
export function LeadsView() {
  const [leads, setLeads] = useState(LEADS);
  const [dragId, setDragId] = useState(null);
  const [selected, setSelected] = useState(null);

  function moveToStage(toStage) {
    if (!dragId) return;
    setLeads(prev => prev.map(l => l.id === dragId ? { ...l, stage: toStage } : l));
    setDragId(null);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        {[
          { label: "Hot leads", v: leads.filter(l => l.hot).length, sub: "call before noon" },
          { label: "Avg lead score", v: Math.round(leads.reduce((s,l)=>s+l.score,0)/leads.length), sub: "this week" },
          { label: "Conv. rate", v: "11%", sub: "DM → showing" },
          { label: "Days to close", v: 31, sub: "avg, last 12 mo" },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: 14, flex: 1 }}>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{s.label}</div>
            <div className="display" style={{ fontSize: 32, marginTop: 4 }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, alignItems: "start" }}>
        {STAGES.map(stage => {
          const items = leads.filter(l => l.stage === stage.id);
          return (
            <div key={stage.id}
              onDragOver={e => e.preventDefault()}
              onDrop={() => moveToStage(stage.id)}
              style={{
                background: "var(--bg-card)", borderRadius: 14, padding: 14,
                border: dragId ? "1px dashed var(--ink)" : "1px solid var(--rule)",
                minHeight: 500,
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{stage.label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-soft)" }}>{items.length} active</div>
                </div>
                <div style={{ width: 14, height: 14, background: stage.tint, borderRadius: 4, border: "1px solid var(--rule)" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map(l => {
                  const listing = LISTINGS.find(li => li.id === l.interest);
                  return (
                    <div key={l.id}
                      draggable
                      onClick={() => setSelected(l)}
                      onDragStart={() => setDragId(l.id)}
                      onDragEnd={() => setDragId(null)}
                      style={{
                        border: "1px solid var(--rule)", borderRadius: 10, padding: 10,
                        background: "var(--bg-warm)", cursor: "grab",
                        opacity: dragId === l.id ? 0.3 : 1,
                      }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                          <Avatar name={l.name} size={26} photo={l.photo} />
                          <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</div>
                        </div>
                        {l.hot && <span style={{ fontSize: 9, color: "var(--coral)", fontFamily: "var(--font-mono)" }}>●HOT</span>}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--ink-soft)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
                        {l.source}
                      </div>
                      <div style={{ marginTop: 6, padding: 6, background: "var(--bg)", border: "1px solid var(--rule-soft)", borderRadius: 6, display: "flex", gap: 6, alignItems: "center" }}>
                        <div style={{ width: 20, height: 20, borderRadius: 4, ...listingBg(listing), flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{listing.address}</div>
                          <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{priceShort(listing.price)}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>Budget {priceShort(l.budget)}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 40, height: 4, background: "var(--bg)", borderRadius: 99 }}>
                            <div style={{ height: "100%", width: `${l.score}%`, background: l.score >= 85 ? "var(--coral)" : "var(--ink)", borderRadius: 99 }} />
                          </div>
                          <span className="mono" style={{ fontSize: 10 }}>{l.score}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selected && <LeadDrawer lead={selected} onClose={() => setSelected(null)} />}
      {!selected && (
        <div style={{ marginTop: 18, padding: 16, background: "var(--ink)", color: "var(--bg-warm)", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--lime)", color: "var(--ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 11 }}>R</span>
            <div>
              <div style={{ fontSize: 14, fontFamily: "var(--font-display)", letterSpacing: "-0.015em" }}>I drafted 3 follow-ups this morning while you were sleeping.</div>
              <div style={{ fontSize: 12, color: "rgba(246,242,234,0.55)", marginTop: 2 }}>Replies sound like you. Average response 4h faster than the rest of your market.</div>
            </div>
          </div>
          <button className="btn btn-lime btn-sm">Review drafts →</button>
        </div>
      )}
    </div>
  );
}

function LeadDrawer({ lead, onClose }) {
  const listing = LISTINGS.find(l => l.id === lead.interest);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(17,17,16,0.4)", zIndex: 100, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 440, background: "var(--bg)", height: "100%", padding: 28, overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Avatar name={lead.name} size={56} ring={lead.hot} photo={lead.photo} />
            <div>
              <div className="display" style={{ fontSize: 24 }}>{lead.name}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>{lead.source}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ fontSize: 20, color: "var(--ink-soft)", padding: 4 }}>×</button>
        </div>

        <div style={{ marginTop: 18, padding: 14, background: "var(--bg-card)", borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span className="eyebrow">Lead score</span>
            <span style={{ fontSize: 11, color: lead.score >= 85 ? "var(--coral)" : "var(--ink-soft)" }}>{lead.score >= 85 ? "● HOT — call first" : "● warm"}</span>
          </div>
          <div style={{ height: 8, background: "var(--bg)", borderRadius: 99 }}>
            <div style={{ height: "100%", width: `${lead.score}%`, background: lead.score >= 85 ? "var(--coral)" : "var(--ink)", borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 8, color: "var(--ink-soft)" }}>{lead.score}/100 · improved +12 in 7 days</div>
        </div>

        <div style={{ marginTop: 18 }}>
          <span className="eyebrow">Interested in</span>
          <div style={{ marginTop: 8, padding: 12, background: "var(--bg-card)", borderRadius: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: 8, ...listingBg(listing) }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{listing.address}</div>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{listing.city} · {priceShort(listing.price)}</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-soft)" }}>
            Budget <strong className="mono" style={{ color: "var(--ink)" }}>{priceShort(lead.budget)}</strong>
            &nbsp; · Match strength <strong className="mono" style={{ color: "var(--ink)" }}>92%</strong>
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <span className="eyebrow">From RealMe</span>
          <div style={{ marginTop: 8, padding: 16, background: "var(--ink)", color: "var(--bg-warm)", borderRadius: 12, fontSize: 15, lineHeight: 1.5, fontFamily: "var(--font-display)", letterSpacing: "-0.015em" }}>
            Call her before 11. She watched your walkthrough <em>twice</em>, opened
            yesterday's email, and saved the listing. Lead with the kitchen — she
            screenshotted the tile.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary btn-sm">☎ Call now</button>
            <button className="btn btn-outline btn-sm">✉ Send DM draft</button>
            <button className="btn btn-outline btn-sm">📅 Book showing</button>
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <span className="eyebrow">Touch history</span>
          <ul className="clean" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {[
              { t: "14h ago", text: "Replied to your reel DM: 'Is this still available?'", icon: "💬" },
              { t: "1d ago", text: "Opened email: New in Berkeley Hills", icon: "✉" },
              { t: "2d ago", text: "Watched walkthrough reel 2× on Instagram", icon: "▶" },
              { t: "5d ago", text: "Followed @jordan.maes", icon: "+" },
            ].map((e, i) => (
              <li key={i} style={{ display: "flex", gap: 12, fontSize: 13 }}>
                <span style={{ width: 26, height: 26, background: "var(--bg-card)", border: "1px solid var(--rule)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{e.icon}</span>
                <div style={{ flex: 1 }}>
                  <div>{e.text}</div>
                  <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{e.t}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
