import React from "react";
import type { Metadata } from "next";
import ShootConsole from "@/components/booth/ShootConsole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Shoot Console",
  description: "Touch photo booth capture console",
  robots: { index: false, follow: false },
};

export default function BoothShootPage() {
  return <ShootConsole />;
}
