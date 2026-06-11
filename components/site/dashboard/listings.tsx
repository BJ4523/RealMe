// @ts-nocheck
/* eslint-disable */
"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AGENT,
  LISTINGS,
  POSTS_WEEK,
  VIDEO_TEMPLATES,
  PlatformIcon,
  listingBg,
  priceShort,
  useIsMobile,
} from "@/components/site/shared";
import { useDashboardData } from "./data-context";
import { studioGenerate } from "@/lib/site/studio-actions";
import { pollVideoStatus } from "@/app/(app)/videos/actions";
import { Download, Clapperboard, RefreshCw, ChevronRight, Check } from "lucide-react";

export function ListingsView({ setSection }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { listings: LISTINGS, isReal } = useDashboardData();
  const [filter, setFilter] = useState("all");
  const filters = [
    { id: "all", label: "All", n: LISTINGS.length },
    { id: "new", label: "New", n: LISTINGS.filter(l => l.status === "new").length },
    { id: "active", label: "Active", n: LISTINGS.filter(l => l.status === "active").length },
    { id: "pending", label: "Pending", n: LISTINGS.filter(l => l.status === "pending").length },
  ];
  const filtered = filter === "all" ? LISTINGS : LISTINGS.filter(l => l.status === filter);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: isMobile ? "wrap" : "nowrap", gap: isMobile ? 12 : 0 }}>
        <div style={{ display: "flex", gap: 6, overflowX: isMobile ? "auto" : "visible", maxWidth: "100%", flexShrink: 0 }}>
          {filters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{
                padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                background: filter === f.id ? "var(--ink)" : "transparent",
                color: filter === f.id ? "var(--bg-warm)" : "var(--ink)",
                border: filter === f.id ? "1px solid var(--ink)" : "1px solid var(--rule)",
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
              {f.label} <span style={{ fontFamily: "var(--font-mono)", marginLeft: 4, opacity: 0.6, fontSize: 11 }}>{f.n}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>
            <span className="dot" style={{ background: "var(--ok)", marginRight: 6 }} />
            {isReal ? `${LISTINGS.length} listings · live` : "MLS synced 4 min ago"}
          </span>
          <button className="btn btn-outline btn-sm" onClick={() => router.push("/listings/new")}>+ Add manually</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16 }}>
        {filtered.map(l => <ListingCard key={l.id} listing={l} setSection={setSection} />)}
      </div>
    </div>
  );
}

function ListingCard({ listing, setSection }) {
  const reelsForListing = POSTS_WEEK.flatMap(d => d.items).filter(i => i.listing === listing.id).length;
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{
        height: 160, borderRadius: 12, position: "relative", overflow: "hidden",
        ...listingBg(listing),
      }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.35) 100%)" }} />
        <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 6 }}>
          {listing.status === "new" && <span style={{ background: "var(--lime)", padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>NEW · {listing.daysListed}d</span>}
          {listing.status === "active" && <span style={{ background: "rgba(255,255,255,0.9)", padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)" }}>ACTIVE</span>}
          {listing.status === "pending" && <span style={{ background: "var(--coral)", color: "#fff", padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)" }}>PENDING</span>}
          {listing.autoImported && <span style={{ background: "rgba(0,0,0,0.6)", color: "#fff", padding: "3px 8px", borderRadius: 4, fontSize: 10, fontFamily: "var(--font-mono)", display: "inline-flex", alignItems: "center", gap: 3 }}><Download size={11} /> MLS</span>}
        </div>
        <div style={{ position: "absolute", bottom: 10, right: 10, fontSize: 10, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.8)" }}>
          {listing.photos} photos
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="display" style={{ fontSize: 20, letterSpacing: "-0.02em" }}>{listing.address}</div>
          <div className="display" style={{ fontSize: 20 }}>{priceShort(listing.price)}</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-soft)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
          {listing.city} · {listing.beds}bd · {listing.baths}ba · {listing.sqft.toLocaleString()} sqft
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: "1px solid var(--rule-soft)", borderBottom: "1px solid var(--rule-soft)" }}>
        <Mini label="Views" value={(listing.views / 1000).toFixed(1) + "k"} />
        <Mini label="Reels live" value={reelsForListing} />
        <Mini label="Status" value={listing.status} mono />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setSection("studio")} style={{ flex: 1, justifyContent: "center", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Clapperboard size={14} /> Make reel
        </button>
        <button className="btn btn-outline btn-sm" style={{ padding: "7px 10px" }}>···</button>
      </div>
    </div>
  );
}

function Mini({ label, value, mono }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: "var(--ink-soft)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, textTransform: mono ? "capitalize" : "none" }}>{value}</div>
    </div>
  );
}

// ====== VIDEO STUDIO ======

export function StudioView() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { listings: LISTINGS, hasAvatar, isReal } = useDashboardData();
  const [selected, setSelected] = useState(LISTINGS[0].id);
  const [template, setTemplate] = useState("walkthru");
  const [cadence, setCadence] = useState("daily");
  const [script, setScript] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState([]);
  const [videoUrl, setVideoUrl] = useState(null);
  const [genError, setGenError] = useState(null);
  const isRealListing = /^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(String(selected));

  const listing = LISTINGS.find(l => l.id === selected);
  const tmpl = VIDEO_TEMPLATES.find(t => t.id === template);

  const generationSteps = [
    "Pulling listing data + photos",
    "Drafting script (matching your voice)",
    "Generating you on camera",
    "Cutting B-roll from listing photos",
    "Adding captions & music",
    "Cross-posting to channels",
  ];

  // Draft script when listing/template changes
  useEffect(() => {
    setScript(draftScript(listing, tmpl));
  }, [selected, template]);

  async function go() {
    setGenError(null);
    // Need an avatar to put yourself on camera.
    if (!hasAvatar) {
      router.push("/onboarding");
      return;
    }
    // Real generation only works against a real (saved) listing.
    if (!isRealListing) {
      setGenError("Add a real listing first — then pick it here to generate.");
      return;
    }
    setGenerating(true);
    setGenerated(false);
    setProgress(0);
    setSteps([]);
    setVideoUrl(null);

    const scriptText = (script || []).map((s) => s.text).join(" ");
    const res = await studioGenerate(selected, scriptText, listing?.address);
    if ("error" in res) {
      setGenerating(false);
      if (res.error === "no_avatar") { router.push("/onboarding"); return; }
      if (res.error === "needs_twin") {
        setGenError(res.message || "Set up & verify your digital twin to generate.");
        router.push("/settings/avatar");
        return;
      }
      setGenError(
        res.error === "no_listing"
          ? "Add a real listing first."
          : res.message || "Generation failed. Try again.",
      );
      return;
    }

    // Poll the real HeyGen job to completion.
    const poll = setInterval(async () => {
      const v = await pollVideoStatus(res.videoId);
      if (!v) return;
      if (v.status === "completed") {
        clearInterval(poll);
        setProgress(100);
        setSteps(generationSteps);
        setGenerating(false);
        setGenerated(true);
        setVideoUrl(v.video_url);
      } else if (v.status === "failed") {
        clearInterval(poll);
        setGenerating(false);
        setGenError(v.error || "Generation failed.");
      }
    }, 4000);
  }

  // Visual progress while the real job renders (caps at ~92% until completion).
  useEffect(() => {
    if (!generating) return;
    let p = 0, s = 0;
    const i = setInterval(() => {
      p = Math.min(92, p + 1.1);
      setProgress(p);
      const ns = Math.floor((p / 100) * generationSteps.length);
      if (ns > s) {
        s = ns;
        setSteps(arr => [...arr, generationSteps[s - 1]]);
      }
    }, 140);
    return () => clearInterval(i);
  }, [generating]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "240px 1fr 380px", gap: 18 }}>
      {/* COL 1: Listing picker + cadence */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="card" style={{ padding: 14 }}>
          <span className="eyebrow">Listing</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {LISTINGS.map(l => (
              <button key={l.id} onClick={() => setSelected(l.id)} style={{
                padding: 8, borderRadius: 8, display: "flex", gap: 8, alignItems: "center",
                background: selected === l.id ? "var(--ink)" : "transparent",
                color: selected === l.id ? "var(--bg-warm)" : "var(--ink)",
                border: selected === l.id ? "none" : "1px solid var(--rule-soft)",
                textAlign: "left",
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                  ...listingBg(l) }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.address}</div>
                  <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", opacity: 0.65 }}>{priceShort(l.price)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <span className="eyebrow">Cadence</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {[
              { id: "once", label: "Just this one", sub: "Render & queue once" },
              { id: "weekly", label: "Weekly", sub: "1 reel every Tue + Fri" },
              { id: "daily", label: "Daily", sub: "Mix of templates · 7 / wk" },
              { id: "blitz", label: "Launch blitz", sub: "5 reels in first 72h" },
            ].map(c => (
              <button key={c.id} onClick={() => setCadence(c.id)} style={{
                padding: 10, borderRadius: 8, textAlign: "left",
                background: cadence === c.id ? "var(--ink)" : "var(--bg)",
                color: cadence === c.id ? "var(--bg-warm)" : "var(--ink)",
                border: "1px solid " + (cadence === c.id ? "var(--ink)" : "var(--rule-soft)"),
              }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 10, color: cadence === c.id ? "rgba(246,242,234,0.6)" : "var(--ink-soft)" }}>{c.sub}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* COL 2: Template, script, generate */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="card" style={{ padding: 18 }}>
          <span className="eyebrow">Template</span>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
            {VIDEO_TEMPLATES.map(t => (
              <button key={t.id} onClick={() => setTemplate(t.id)} style={{
                padding: 12, borderRadius: 10, textAlign: "left",
                border: template === t.id ? "1px solid var(--ink)" : "1px solid var(--rule)",
                background: template === t.id ? "var(--ink)" : "var(--bg-card)",
                color: template === t.id ? "var(--bg-warm)" : "var(--ink)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", opacity: 0.65 }}>{t.duration}</div>
                </div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{t.platform}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span className="eyebrow">Script · AI-drafted, your voice</span>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}><RefreshCw size={12} style={{ verticalAlign: "-2px", marginRight: 3 }} />Re-draft</button>
          </div>
          <ScriptEditor script={script || []} setScript={setScript} />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <button onClick={go} disabled={generating} className="btn btn-primary" style={{ padding: "14px 22px", fontSize: 14 }}>
            {!hasAvatar
              ? "Set up your avatar →"
              : generating
                ? "Rendering…"
                : generated
                  ? <><RefreshCw size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />Regenerate</>
                  : "Generate video →"}
          </button>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>
            {!hasAvatar
              ? "Upload your photo + voice once — then generate from any listing."
              : !isRealListing
                ? "Pick one of your real listings to generate."
                : "Your avatar narrates this listing · HeyGen render ~30s"}
          </div>
        </div>
        {genError && (
          <div style={{ fontSize: 13, color: "var(--coral)", fontFamily: "var(--font-mono)" }}>{genError}</div>
        )}

        {(generating || generated) && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span className="eyebrow">{generated ? "Done" : "Rendering"}</span>
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{Math.floor(progress)}%</span>
            </div>
            <div style={{ height: 6, background: "var(--bg)", borderRadius: 99, marginBottom: 12 }}>
              <div style={{ height: "100%", width: `${progress}%`, background: generated ? "var(--ok)" : "var(--lime)", borderRadius: 99, transition: "width 0.1s" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 6 }}>
              {generationSteps.map((s, i) => {
                const done = steps.includes(s);
                const active = !done && steps.length === i;
                return (
                  <div key={i} style={{
                    fontSize: 11, fontFamily: "var(--font-mono)",
                    color: done ? "var(--ok)" : active ? "var(--ink)" : "var(--ink-faint)",
                    padding: "6px 8px", background: active ? "var(--lime)" : "var(--bg)", borderRadius: 6,
                  }}>
                    {done ? <Check size={12} style={{ verticalAlign: "-2px" }} /> : active ? <ChevronRight size={12} style={{ verticalAlign: "-2px" }} /> : "·"} {s}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* COL 3: Preview phone */}
      <div>
        <div style={{ position: "sticky", top: 100 }}>
          <div className="phone" style={{ margin: "0 auto" }}>
            <div className="phone-notch"></div>
            <div className="phone-screen">
              <StudioReelPreview listing={listing} script={script} progress={progress} generating={generating} done={generated} videoUrl={videoUrl} />
            </div>
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 6, justifyContent: "center" }}>
            {["ig","tt","yt","li"].map(p => (
              <span key={p} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", border: "1px solid var(--rule)", borderRadius: 999, fontSize: 11, background: "var(--bg-card)" }}>
                <PlatformIcon p={p} size={12} />
                {generated ? "queued" : "ready"}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function draftScript(listing, tmpl) {
  if (!listing || !tmpl) return [];
  const map = {
    walkthru: [
      { t: "0:00", text: `OK so — let me show you this ${listing.style.toLowerCase()} in ${listing.city.split(",")[0]}.` },
      { t: "0:04", text: `${listing.beds} beds, ${listing.baths} baths, ${listing.sqft.toLocaleString()} square feet.` },
      { t: "0:09", text: `Open the door and you're immediately staring at floor-to-ceiling windows.` },
      { t: "0:16", text: `Kitchen has been completely redone — quartz, gas range, original tile preserved.` },
      { t: "0:23", text: `The primary suite is upstairs. View all the way to the bridge.` },
      { t: "0:28", text: `Asking ${priceShort(listing.price)}. DM me to come see it this weekend.` },
    ],
    "list-pop": [
      { t: "0:00", text: `Just listed in ${listing.city.split(",")[0]}.` },
      { t: "0:03", text: `${listing.beds}-bed, ${listing.baths}-bath ${listing.style.toLowerCase()}.` },
      { t: "0:08", text: `${priceShort(listing.price)}. It will not last.` },
      { t: "0:14", text: `Link in bio. Tell them Jordan sent you.` },
    ],
    neighborhood: [
      { t: "0:00", text: `I'm on ${listing.address.split(" ").slice(1).join(" ")} — let me walk you around.` },
      { t: "0:06", text: `Coffee three blocks that way. Best croissant in town.` },
      { t: "0:14", text: `Schools? Top 5% in the district.` },
      { t: "0:22", text: `And the house I'm listing? Sits right here.` },
      { t: "0:32", text: `${priceShort(listing.price)}. Open house Saturday 1-4.` },
    ],
    openhouse: [
      { t: "0:00", text: `Saturday. 1 to 4.` },
      { t: "0:03", text: `${listing.address}.` },
      { t: "0:07", text: `Coffee on the porch, walk-through inside.` },
      { t: "0:12", text: `Come say hi.` },
    ],
    "price-drop": [
      { t: "0:00", text: `Price drop alert.` },
      { t: "0:02", text: `${listing.address}.` },
      { t: "0:05", text: `Was ${priceShort(listing.price + 100000)}. Now ${priceShort(listing.price)}.` },
      { t: "0:10", text: `Move fast.` },
    ],
    testimonial: [
      { t: "0:00", text: `Just handed Yuki the keys to ${listing.address}.` },
      { t: "0:05", text: `Closed in 14 days. Under asking by 2%.` },
      { t: "0:13", text: `Want to be next? You know where to find me.` },
    ],
  };
  return map[tmpl.id] || map.walkthru;
}

function ScriptEditor({ script, setScript }) {
  const [editingIdx, setEditingIdx] = useState(null);
  if (!script || script.length === 0) return null;
  return (
    <div style={{
      background: "#0e0c0b", color: "var(--bg-warm)",
      borderRadius: 10, padding: "18px 4px 18px 4px",
      fontFamily: "var(--font-display)", letterSpacing: "-0.01em",
      position: "relative", overflow: "hidden",
    }}>
      {/* Teleprompter top fade */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 24, background: "linear-gradient(180deg,#0e0c0b,transparent)", pointerEvents: "none", zIndex: 2 }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 24, background: "linear-gradient(0deg,#0e0c0b,transparent)", pointerEvents: "none", zIndex: 2 }} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {script.map((line, i) => (
          <div key={i}
            onClick={() => setEditingIdx(i)}
            style={{
              display: "flex", gap: 18, alignItems: "baseline",
              padding: "8px 22px",
              cursor: "text",
              borderLeft: editingIdx === i ? "2px solid var(--lime)" : "2px solid transparent",
              background: editingIdx === i ? "rgba(214,255,61,0.04)" : "transparent",
              transition: "background 0.15s",
            }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(246,242,234,0.4)",
              width: 40, flexShrink: 0, paddingTop: 6,
            }}>{line.t}</div>
            {editingIdx === i ? (
              <input
                autoFocus
                value={line.text}
                onChange={e => {
                  const next = [...script];
                  next[i] = { ...next[i], text: e.target.value };
                  setScript(next);
                }}
                onBlur={() => setEditingIdx(null)}
                onKeyDown={e => { if (e.key === "Enter") setEditingIdx(null); }}
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "var(--bg-warm)", fontSize: 19, lineHeight: 1.4,
                  fontFamily: "var(--font-display)", letterSpacing: "-0.01em",
                }}
              />
            ) : (
              <div style={{
                flex: 1, fontSize: 19, lineHeight: 1.4,
                color: "var(--bg-warm)",
              }}>{line.text}</div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, padding: "0 22px", fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(246,242,234,0.4)" }}>
        <span>Click any line to edit · matches your voice automatically</span>
        <span>{script.length} beats · {script[script.length - 1]?.t || "0:00"} runtime</span>
      </div>
    </div>
  );
}

function StudioReelPreview({ listing, script, progress, generating, done, videoUrl }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 80);
    return () => clearInterval(i);
  }, []);

  // Real finished video.
  if (videoUrl) {
    return (
      <video
        src={videoUrl}
        controls
        autoPlay
        loop
        playsInline
        style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000" }}
      />
    );
  }

  if (!script) return null;
  const i = Math.floor((tick / 22) % script.length);
  const captionText = script[i]?.text || "";
  const short = captionText.split(" ").slice(0, 4).join(" ");

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#1a1818", overflow: "hidden" }}>
      <div style={{
        position: "absolute", inset: 0,
        ...listingBg(listing),
        transform: `scale(${1.05 + Math.sin(tick / 60) * 0.02})`,
        transition: "transform 0.1s",
      }} />
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.6) 100%)",
      }} />

      {/* Agent — real photo bubble */}
      <div style={{
        position: "absolute", left: "50%", top: "55%",
        transform: `translate(-50%, -50%) scale(${1 + Math.sin(tick / 30) * 0.015})`,
        width: 130, height: 130, borderRadius: "50%", overflow: "hidden",
        border: "3px solid var(--lime)",
        boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
        backgroundImage: `url(${AGENT.photo})`,
        backgroundSize: "cover", backgroundPosition: "center top",
      }} />

      {generating && (
        <>
          <div style={{
            position: "absolute", inset: 0,
            background: `linear-gradient(to bottom, transparent ${progress - 5}%, rgba(214,255,61,0.4) ${progress}%, transparent ${progress + 5}%)`,
          }} />
          <div style={{
            position: "absolute", top: 30, left: 12, right: 12,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            color: "#fff", fontSize: 10, fontFamily: "var(--font-mono)",
            background: "rgba(0,0,0,0.6)", padding: "5px 8px", borderRadius: 999,
          }}>
            <span><span className="spin" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", border: "2px solid var(--lime)", borderTopColor: "transparent", marginRight: 4 }} />RENDERING</span>
            <span>{Math.floor(progress)}%</span>
          </div>
        </>
      )}

      {/* Top bar */}
      <div style={{
        position: "absolute", top: 18, left: 12, right: 12,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        color: "#fff", fontSize: 11,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--lime)", color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800 }}>JM</div>
          <span style={{ fontWeight: 600, fontSize: 11 }}>jordan.maes</span>
        </div>
      </div>

      {/* Caption */}
      <div style={{ position: "absolute", bottom: 70, left: 16, right: 16, textAlign: "center" }}>
        <span style={{
          background: "var(--lime)", color: "var(--ink)",
          fontFamily: "var(--font-display)", fontWeight: 800,
          fontSize: 18, padding: "3px 8px",
          letterSpacing: "-0.02em",
          boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone",
        }}>
          {short}
        </span>
      </div>

      {/* progress */}
      <div style={{ position: "absolute", bottom: 14, left: 12, right: 12, height: 2, background: "rgba(255,255,255,0.2)" }}>
        <div style={{ height: "100%", width: `${(tick % 100)}%`, background: "var(--lime)" }} />
      </div>
    </div>
  );
}
