import Link from "next/link";
import {
  Clapperboard,
  Home,
  Sparkles,
  UserRound,
  Wand2,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: UserRound,
    title: "Create your avatar",
    body: "Upload one photo. We turn it into a lifelike on-camera avatar that speaks in your voice.",
  },
  {
    icon: Home,
    title: "Add a listing",
    body: "Type the details or paste a listing URL — we pull address, price, photos, and features.",
  },
  {
    icon: Wand2,
    title: "Auto-write the script",
    body: "AI drafts a warm 60-second walkthrough narration from the listing. Edit it in a click.",
  },
  {
    icon: Clapperboard,
    title: "Generate the video",
    body: "Your avatar narrates the listing over its photos. Ready to download and share in minutes.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-5 pt-16 pb-20 sm:pt-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-foreground" />
            AI walkthrough videos, starring you
          </div>
          <h1 className="mt-6 max-w-4xl font-heading text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
            Turn every listing into a video{" "}
            <span className="rounded-2xl bg-accent px-3 py-1 text-accent-foreground">
              you star in
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Real Me builds a talking avatar of you, then generates personalized
            walkthrough videos for any property — no camera, no studio, no
            editing.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Link href="/signup">Start free</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full"
            >
              <Link href="/login">I have an account</Link>
            </Button>
          </div>

          <div className="mt-16 grid gap-4 rounded-4xl border border-border bg-card p-4 sm:grid-cols-[1.4fr_1fr]">
            <div className="flex aspect-video items-center justify-center rounded-3xl bg-gradient-to-br from-foreground to-foreground/80 text-background">
              <div className="flex flex-col items-center gap-3">
                <div className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Clapperboard className="size-7" />
                </div>
                <p className="font-mono text-xs uppercase tracking-widest text-background/70">
                  Generated walkthrough · 0:62
                </p>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3 p-4">
              <p className="font-heading text-2xl font-bold">123 Maple Court</p>
              <p className="text-sm text-muted-foreground">
                4 bd · 3 ba · 2,480 sqft
              </p>
              <p className="font-heading text-3xl font-extrabold">$849,000</p>
              <div className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Share2 className="size-4" /> Shareable in one tap
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/60 bg-card/40">
        <div className="mx-auto w-full max-w-6xl px-5 py-20">
          <h2 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
            Four steps to a finished video
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="flex flex-col rounded-3xl border border-border bg-card p-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-accent/30">
                    <step.icon className="size-5" />
                  </div>
                  <span className="font-mono text-sm text-muted-foreground">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-5 font-heading text-lg font-bold">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-5 py-20">
        <div className="flex flex-col items-center gap-6 rounded-4xl bg-foreground px-6 py-16 text-center text-background">
          <h2 className="max-w-2xl font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
            Your next listing video is five minutes away
          </h2>
          <Button
            asChild
            size="lg"
            className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Link href="/signup">Create your avatar</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
