import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gallery",
  robots: { index: false, follow: false },
};

export default function AdminGalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
