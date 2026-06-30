"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Home,
  Clapperboard,
  Settings,
  LogOut,
  UserCircle2,
} from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

// The product's mental model, in order: see everything (Dashboard), add the
// property (Listings), make the video (Videos), manage your twin (Avatar).
// Settings is secondary — tucked into the footer / mobile top bar, not a tab.
const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/listings", label: "Listings", icon: Home },
  { href: "/videos", label: "Videos", icon: Clapperboard },
  { href: "/settings/avatar", label: "Avatar", icon: UserCircle2 },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-card hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </Link>
  );
}

export function AppNav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    // "/settings" must not light up for "/settings/avatar" (Avatar's own tab).
    href === "/settings"
      ? pathname === "/settings"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border/60 p-5 md:flex">
        <Logo href="/" />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          {/* Settings lives here (secondary), not in the primary tab set. */}
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
              isActive("/settings")
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-card hover:text-foreground",
            )}
          >
            <Settings className="size-4" />
            <span>Settings</span>
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
          {email ? (
            <p className="truncate px-4 pt-1 font-mono text-xs text-muted-foreground">
              {email}
            </p>
          ) : null}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/60 bg-background/80 px-5 py-3 backdrop-blur md:hidden">
        <Logo href="/" />
        <div className="flex items-center gap-4">
          <Link
            href="/settings"
            aria-label="Settings"
            className="text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-5" />
          </Link>
          <form action={signOut}>
            <button type="submit" aria-label="Sign out" className="text-muted-foreground">
              <LogOut className="size-5" />
            </button>
          </form>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border/60 bg-background/95 px-2 py-2 backdrop-blur md:hidden">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 text-xs font-medium",
              isActive(item.href)
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            <item.icon
              className={cn(
                "size-5",
                isActive(item.href) && "text-foreground",
              )}
            />
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
