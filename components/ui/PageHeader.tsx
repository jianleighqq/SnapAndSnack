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

/** Operator page title: mono label, fluid Anton headline with one accent word, hairline below. */
export function PageHeader({ label, title, accent, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("shrink-0 w-full max-w-full", className)}>
      <div className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <Label>{label}</Label>
          <h1 className="mt-2 font-display text-[clamp(2.25rem,7vw,3.75rem)] uppercase leading-[0.92] tracking-tight">
            {title}
            {accent && <span className="text-accent"> {accent}</span>}
          </h1>
          {description && <p className="mt-2.5 max-w-2xl text-xs sm:text-sm text-muted">{description}</p>}
        </div>
        {actions && (
          <div className="flex w-full sm:w-auto shrink-0 flex-wrap items-center gap-2 sm:gap-3">
            {actions}
          </div>
        )}
      </div>
      <Hairline />
    </header>
  );
}
