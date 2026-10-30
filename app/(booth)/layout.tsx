import React from "react";

export default function BoothLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-screen select-none overflow-hidden bg-paper text-ink">
      {children}
    </div>
  );
}
