import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "font-heading text-xl font-extrabold tracking-tight inline-flex items-center gap-1.5",
        className,
      )}
    >
      <span className="inline-block size-3 rounded-full bg-accent ring-2 ring-foreground/10" />
      REAL ME<span className="text-muted-foreground"> AI</span>
    </Link>
  );
}
