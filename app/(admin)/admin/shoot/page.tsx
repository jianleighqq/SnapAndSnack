import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shoot Console",
  robots: { index: false, follow: false },
};

export default function OperatorShootPage() {
  permanentRedirect("/booth/shoot");
}
