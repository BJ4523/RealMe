// @ts-nocheck
/* eslint-disable */
"use client";
import { useEffect, useRef, useState } from "react";
import { Play, RefreshCw, Check, Volume2, VolumeX, Sparkles } from "lucide-react";
import { priceShort, useIsMobile } from "@/components/site/shared";

// Real pre-rendered demo reels (one agent + one property each). Selecting a
// listing "generates" — we play the matching reel inside the phone. The figures
// are illustrative; the addresses + footage are real.
const REELS = [
  { id: "dunleer", address: "2746 Dunleer Pl", city: "Los Angeles, CA", price: 2495000, beds: 4, baths: 3, sqft: 2180, agent: "AVERY.BROOKS",
    video: "/demo/dunleer.mp4", poster: "/demo/dunleer.jpg", thumb: "/demo/agent-dunleer.jpg",
    photos: ["/demo/photos/dunleer-1.jpg", "/demo/photos/dunleer-2.jpg", "/demo/photos/dunleer-3.jpg", "/demo/photos/dunleer-4.jpg"] },
  { id: "midvale", address: "2357 Midvale Ave", city: "Los Angeles, CA", price: 2150000, beds: 3, baths: 3, sqft: 1840, agent: "MARCUS.REED",
    video: "/demo/midvale.mp4", poster: "/demo/midvale.jpg", thumb: "/demo/agent-midvale.jpg",
    photos: ["/demo/photos/midvale-1.jpg", "/demo/photos/midvale-2.jpg", "/demo/photos/midvale-3.jpg", "/demo/photos/midvale-4.jpg"] },
  { id: "eyring", address: "645 S Eyring Pl", city: "Grantsville, UT", price: 689000, beds: 5, baths: 3, sqft: 3260, agent: "SIERRA.HALE",
    video: "/demo/eyring.mp4", poster: "/demo/eyring.jpg", thumb: "/demo/agent-eyring.jpg",
    photos: ["/demo/photos/eyring-1.jpg", "/demo/photos/eyring-2.jpg", "/demo/photos/eyring-3.jpg", "/demo/photos/eyring-4.jpg"] },
];

const GEN_STEPS = [
  "Reading the listing",
  "Writing your script",
  "Rendering your reel",
  "Cutting the B-roll",
  "Burning captions",
];

export function DemoStudioSection() {
  const isMobile = useIsMobile();
  const [selected, setSelected] = useState(REELS[0].id);
  // idle → generating → done
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef(null);
  const phoneRef = useRef(null);

  const reel = REELS.find((r) => r.id === selected);

  function pick(id) {
    setSelected(id);
    setStatus("idle");
    setProgress(0);
    setSteps([]);
    setMuted(true);
  }

  function generate() {
    setStatus("generating");
    setProgress(0);
    setSteps([]);
    setMuted(true);
    // On mobile the phone sits below the controls — bring the payoff into view.
    if (isMobile && phoneRef.current) {
      phoneRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // Drive the (simulated) render — ~3.5s of progress, then play the real reel.
  useEffect(() => {
    if (status !== "generating") return;
    let p = 0;
    let s = 0;
    const i = setInterval(() => {
      p += 1.7;
      setProgress(Math.min(100, p));
      const nextStep = Math.floor((p / 100) * GEN_STEPS.length);
      if (nextStep > s) {
        s = nextStep;
        setSteps((arr) => [...arr, GEN_STEPS[s - 1]]);
      }
      if (p >= 100) {
        clearInterval(i);
        setElapsed(4 + Math.round((reel.sqft % 30) / 10)); // a believable "Xs" number
        setStatus("done");
      }
    }, 60);
    return () => clearInterval(i);
  }, [status]);

  // Autoplay (muted) the moment we finish.
  useEffect(() => {
    if (status === "done" && videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play?.().catch(() => {});
    }
  }, [status]);

  function toggleSound() {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    setMuted(next);
    if (!next) v.play?.().catch(() => {});
  }

  return (
    <section
      id="demo"
      style={{
        background: "var(--bg)",
        padding: isMobile ? "56px 20px 8px" : "96px 32px 24px",
        scrollMarginTop: 72,
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: isMobile ? 28 : 44, maxWidth: 760 }}>
          <span className="eyebrow">Try it · live demo</span>
          <h2
            className="display"
            style={{
              fontSize: isMobile ? "clamp(32px, 9vw, 46px)" : "clamp(46px, 5.4vw, 76px)",
              margin: "12px 0 0",
              lineHeight: 1.02,
            }}
          >
            Pick a listing.<br />
            Watch your reel build itself.
          </h2>
          <p style={{ margin: "18px 0 0", color: "var(--ink-soft)", fontSize: isMobile ? 15 : 17, maxWidth: 560, lineHeight: 1.5 }}>
            Choose a property below and hit generate. Your on-camera reel renders in
            seconds — script, B-roll, captions and all — ready to post.
          </p>
        </div>

        {/* Studio card */}
        <div
          className="card"
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 320px",
            gap: isMobile ? 28 : 48,
            alignItems: "center",
            padding: isMobile ? 16 : 36,
            borderRadius: isMobile ? 22 : 28,
            background: "var(--bg-warm)",
            border: "1px solid var(--rule)",
            boxShadow: "var(--shadow-pop)",
            overflow: "hidden",
          }}
        >
          {/* ---- Left: picker + generate ---- */}
          <div style={{ minWidth: 0 }}>
            <div style={stepLbl}>1 · Pick a listing</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
              {REELS.map((r) => {
                const on = selected === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => pick(r.id)}
                    style={{
                      textAlign: "left",
                      display: "flex",
                      gap: 14,
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 16,
                      cursor: "pointer",
                      background: on ? "var(--ink)" : "var(--bg-card)",
                      color: on ? "var(--bg-warm)" : "var(--ink)",
                      border: on ? "1px solid var(--ink)" : "1px solid var(--rule)",
                      transition: "background 0.15s, color 0.15s, transform 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        flexShrink: 0,
                        backgroundImage: `url(${r.thumb})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center top",
                        border: on ? "1px solid rgba(246,242,234,0.25)" : "1px solid var(--rule)",
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.address}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontFamily: "var(--font-mono)",
                          marginTop: 3,
                          color: on ? "rgba(246,242,234,0.65)" : "var(--ink-soft)",
                        }}
                      >
                        {priceShort(r.price)} · {r.beds}bd · {r.baths}ba · {r.sqft.toLocaleString()} sqft
                      </div>
                    </div>
                    <span
                      aria-hidden
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: on ? "none" : "1.5px solid var(--rule)",
                        background: on ? "var(--lime)" : "transparent",
                        color: "var(--ink)",
                      }}
                    >
                      {on ? <Check size={13} strokeWidth={3} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Photos from the selected listing — what the reel is built from. */}
            <div style={{ ...stepLbl, marginTop: 24, marginBottom: 10 }}>
              From {reel.photos.length} listing photos
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 4,
                minWidth: 0,
                scrollSnapType: "x mandatory",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
              }}
            >
              {reel.photos.map((src) => (
                <div
                  key={src}
                  style={{
                    flex: "0 0 auto",
                    width: isMobile ? "28%" : 92,
                    aspectRatio: "3 / 2",
                    borderRadius: 10,
                    backgroundImage: `url(${src})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    border: "1px solid var(--rule)",
                    scrollSnapAlign: "start",
                  }}
                />
              ))}
            </div>

            <div style={{ ...stepLbl, marginTop: 26 }}>2 · Generate</div>
            <button
              onClick={generate}
              disabled={status === "generating"}
              className="btn btn-lime"
              style={{
                width: "100%",
                marginTop: 14,
                padding: "15px 20px",
                fontSize: 15,
                fontWeight: 700,
                opacity: status === "generating" ? 0.65 : 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {status === "generating" ? (
                <><Sparkles size={16} className="spin" /> Generating…</>
              ) : status === "done" ? (
                <><RefreshCw size={15} /> Regenerate</>
              ) : (
                <><Sparkles size={16} /> Generate reel →</>
              )}
            </button>

            {status === "done" && (
              <div
                style={{
                  marginTop: 14,
                  padding: "11px 13px",
                  borderRadius: 12,
                  background: "rgba(214,255,61,0.16)",
                  border: "1px solid rgba(143,170,30,0.4)",
                  fontSize: 12.5,
                  fontFamily: "var(--font-mono)",
                  color: "var(--ink)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Check size={14} /> Done in {elapsed}.{Math.abs(reel.sqft % 9)}s · auto-queued for 9:30 AM Wed
              </div>
            )}
          </div>

          {/* ---- Right: phone preview ---- */}
          <div ref={phoneRef} style={{ display: "flex", justifyContent: "center", scrollMarginTop: 80 }}>
            <div className="phone" style={{ maxWidth: "100%" }}>
              <div className="phone-notch" />
              <div className="phone-screen">
                <PhoneStage reel={reel} status={status} progress={progress} steps={steps} muted={muted} onToggleSound={toggleSound} videoRef={videoRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PhoneStage({ reel, status, progress, steps, muted, onToggleSound, videoRef }) {
  // DONE — the real reel.
  if (status === "done") {
    return (
      <div style={{ position: "absolute", inset: 0, background: "#000" }}>
        <video
          ref={videoRef}
          src={reel.video}
          poster={reel.poster}
          playsInline
          autoPlay
          loop
          muted={muted}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        {/* top handle / live tag */}
        <div style={topMeta}>
          <span>{reel.agent}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span className="dot-live" style={{ width: 6, height: 6, borderRadius: "50%" }} /> REEL
          </span>
        </div>
        {/* sound toggle */}
        <button
          onClick={onToggleSound}
          aria-label={muted ? "Unmute" : "Mute"}
          style={{
            position: "absolute",
            bottom: 16,
            right: 14,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: muted ? "var(--lime)" : "rgba(0,0,0,0.55)",
            color: muted ? "var(--ink)" : "#fff",
            backdropFilter: "blur(4px)",
          }}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        {muted && (
          <div
            style={{
              position: "absolute",
              bottom: 22,
              left: 14,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "#fff",
              background: "rgba(0,0,0,0.5)",
              padding: "4px 8px",
              borderRadius: 99,
            }}
          >
            Tap for sound
          </div>
        )}
      </div>
    );
  }

  // GENERATING — the render visual (cuts through the real B-roll + scanline + steps).
  if (status === "generating") {
    const broll = [...reel.photos, reel.poster];
    const frame = broll[Math.min(broll.length - 1, Math.floor((progress / 100) * broll.length))];
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${frame})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          transition: "background-image 0.15s",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.78) 100%)" }} />
        {/* scan line sweeping down with progress */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${progress * 0.92}%`,
            height: 70,
            background: "linear-gradient(transparent, rgba(214,255,61,0.55), transparent)",
          }}
        />
        <div style={{ position: "absolute", left: 16, right: 16, bottom: 18, zIndex: 2 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.8)" }}>
            RENDERING · {Math.floor(progress)}%
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 99, marginTop: 8 }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "var(--lime)", borderRadius: 99 }} />
          </div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 5 }}>
            {GEN_STEPS.map((s, i) => {
              const done = steps.includes(s);
              const active = !done && steps.length === i;
              return (
                <div
                  key={i}
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: done ? "var(--lime)" : active ? "#fff" : "rgba(255,255,255,0.35)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ width: 11, display: "inline-flex" }}>
                    {done ? <Check size={11} /> : active ? "›" : "·"}
                  </span>
                  {s}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // IDLE — poster with a play affordance.
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `url(${reel.poster})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)" }} />
      <div style={topMeta}>
        <span>{reel.agent}</span>
        <span>0:30</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.18)",
          backdropFilter: "blur(3px)",
          border: "1.5px solid rgba(255,255,255,0.6)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}
      >
        <Play size={22} fill="currentColor" style={{ marginLeft: 3 }} />
      </div>
      <div style={{ position: "absolute", left: 14, right: 14, bottom: 16 }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, fontFamily: "var(--font-display)", letterSpacing: "-0.01em", textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>
          {reel.address}
        </div>
        <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: "var(--font-mono)", marginTop: 2 }}>
          {reel.city} · {priceShort(reel.price)}
        </div>
      </div>
    </div>
  );
}

const stepLbl = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--ink-soft)",
};

const topMeta = {
  position: "absolute",
  top: 12,
  left: 14,
  right: 14,
  zIndex: 2,
  display: "flex",
  justifyContent: "space-between",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.08em",
  color: "rgba(255,255,255,0.9)",
  textShadow: "0 1px 4px rgba(0,0,0,0.5)",
};
