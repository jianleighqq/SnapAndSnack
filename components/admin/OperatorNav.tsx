"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users, Settings, Camera, QrCode, Image as ImageIcon, MonitorPlay, LogOut } from "lucide-react";
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
    <header className="sticky top-0 z-40 border-b border-ink/15 bg-paper/90 text-ink backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Brand identifier */}
          <div className="flex items-center gap-3">
            <Link
              href="/admin/queue"
              className="flex items-center gap-2.5 font-display text-xl uppercase tracking-wide transition-colors hover:text-accent"
            >
              <img
                src="/logo.png"
                alt="Snap & Snack logo"
                className="h-7 w-auto object-contain"
              />
              <span>Snap &amp; Snack</span>
            </Link>
            <Label className="hidden border-l border-ink/15 pl-3 sm:inline-block">Operator</Label>
          </div>

          {/* Navigation links */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== "/admin/queue" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "interactive-nav-item flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-medium lg:px-4",
                    isActive ? "bg-ink text-paper" : "text-ink/70"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden md:inline">{item.name}</span>
                </Link>
              );
            })}

            {/* Back to Booth screen & Logout */}
            <div className="ml-2 flex items-center gap-2 border-l border-ink/15 pl-3">
              <PillLink
                href="/"
                variant="secondary"
                className="px-4"
                title="Return to guest-facing booth screen"
              >
                <MonitorPlay className="h-4 w-4 text-accent" />
                <span className="hidden lg:inline">Booth Screen</span>
              </PillLink>

              <Pill
                variant="secondary"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="px-3 text-xs font-mono uppercase tracking-wider text-muted hover:text-danger hover:border-danger/40"
                title="Log out of operator console"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Log out</span>
              </Pill>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
