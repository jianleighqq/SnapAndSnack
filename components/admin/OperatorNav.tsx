"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users, Settings, Camera, Image as ImageIcon, MonitorPlay, LogOut } from "lucide-react";
import { Pill, PillLink } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import { cn } from "@/components/ui/cn";

export default function OperatorNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!pathname.startsWith("/admin")) {
    return null;
  }

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.warn("Logout error:", err);
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  const navItems = [
    {
      name: "Queue Board",
      href: "/admin/queue",
      icon: Users,
    },
    {
      name: "Event Setup",
      href: "/admin/setup",
      icon: Settings,
    },
    {
      name: "Shoot Console",
      href: "/admin/shoot",
      icon: Camera,
    },
    {
      name: "Gallery",
      href: "/admin/gallery",
      icon: ImageIcon,
    },
  ];

  return (
    <header className="sticky top-0 z-40 w-full max-w-full border-b border-ink/15 bg-paper/95 text-ink backdrop-blur">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
          {/* Brand identifier */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link
              href="/admin/queue"
              className="flex items-center gap-2 font-display text-lg sm:text-xl uppercase tracking-wide transition-colors hover:text-accent whitespace-nowrap"
            >
              <img
                src="/logo.png"
                alt="Snap & Snack logo"
                className="h-6 sm:h-7 w-auto object-contain shrink-0"
              />
              <span className="whitespace-nowrap">Snap &amp; Snack</span>
            </Link>
            <Label className="hidden border-l border-ink/15 pl-3 sm:inline-block shrink-0">
              Operator
            </Label>
          </div>

          {/* Navigation links */}
          <nav className="flex items-center gap-1 shrink-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/admin/queue" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.name}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "interactive-nav-item flex min-h-[44px] min-w-[40px] sm:min-w-[44px] items-center justify-center gap-1.5 rounded-full px-2.5 text-sm font-medium transition-colors sm:px-3 lg:px-4",
                    isActive ? "bg-ink text-paper" : "text-ink/70 hover:text-ink"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden md:inline">{item.name}</span>
                </Link>
              );
            })}

            {/* Back to Booth screen & Logout */}
            <div className="ml-1 sm:ml-2 flex items-center gap-1 sm:gap-2 border-l border-ink/15 pl-1.5 sm:pl-3 shrink-0">
              <PillLink
                href="/"
                variant="secondary"
                className="min-h-[44px] px-2.5 sm:px-4 justify-center"
                title="Return to guest-facing booth screen"
              >
                <MonitorPlay className="h-4 w-4 text-accent shrink-0" />
                <span className="hidden lg:inline">Booth Screen</span>
              </PillLink>

              <Pill
                variant="secondary"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="min-h-[44px] px-2.5 sm:px-3 text-xs font-mono uppercase tracking-wider text-muted hover:text-danger hover:border-danger/40 justify-center"
                title="Log out of operator console"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden lg:inline">Log out</span>
              </Pill>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
