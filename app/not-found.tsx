import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5 text-center">
      <Logo className="text-2xl" />
      <div>
        <p className="font-heading text-6xl font-extrabold">404</p>
        <p className="mt-2 text-muted-foreground">
          We couldn&apos;t find that page.
        </p>
      </div>
      <Button
        asChild
        className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
      >
        <Link href="/">Back home</Link>
      </Button>
    </div>
  );
}
