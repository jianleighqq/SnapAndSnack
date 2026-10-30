import React from "react";
import { Label } from "./Label";
import { Hairline } from "./Hairline";
import { cn } from "./cn";

export interface PageHeaderProps {
  label: string;
  title: string;
  /** Optional single word (or short phrase) shown in the accent color after the title. */
  accent?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/** Operator page title: mono label, big Anton headline with one accent word, hairline below. */
export function PageHeader({ label, title, accent, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("shrink-0", className)}>
      <div className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Label>{label}</Label>
          <h1 className="mt-2 font-display text-5xl uppercase leading-[0.9] tracking-tight sm:text-6xl">
            {title}
            {accent && <span className="text-accent"> {accent}</span>}
          </h1>
          {description && <p className="mt-3 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
      <Hairline />
    </header>
  );
}
