import type { Metadata } from "next";
import { PillLink } from "@/components/ui/Pill";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-paper text-ink">
      <div className="max-w-md space-y-4">
        <span className="font-mono text-xs uppercase tracking-widest text-muted">
          404 · Error
        </span>
        <h1 className="font-headline text-5xl uppercase tracking-tight text-ink sm:text-6xl">
          Page <span className="text-accent">Not Found</span>
        </h1>
        <p className="font-sans text-sm text-muted">
          The page you are looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="pt-4 flex justify-center">
          <PillLink href="/" variant="primary" size="lg">
            Return to Booth
          </PillLink>
        </div>
      </div>
    </main>
  );
}
