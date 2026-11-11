import React from "react";
import ShootConsole from "@/components/booth/ShootConsole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Shoot Console · Snap & Snack",
  description: "Touch photo booth capture console",
};

export default function BoothShootPage() {
  return <ShootConsole />;
}
