import React from "react";
import OperatorNav from "@/components/admin/OperatorNav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <OperatorNav />
      <div className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
        {children}
      </div>
    </div>
  );
}
