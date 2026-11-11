"use client";

import React from "react";
import { usePathname } from "next/navigation";
import OperatorNav from "./OperatorNav";

export default function AdminLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isOperatorRoute = pathname.startsWith("/admin");

  if (!isOperatorRoute) {
    // Pure mobile-first container for guest phone pages (/guest and /gallery)
    return <main className="min-h-screen bg-paper text-ink">{children}</main>;
  }

  // Desktop operator shell for /admin/* screens
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <OperatorNav />
      <div className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
        {children}
      </div>
    </div>
  );
}

