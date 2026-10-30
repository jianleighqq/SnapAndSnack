import React from "react";
import { cn } from "./cn";

export interface TickerProps {
  items: string[];
  /** How many times to repeat the items so the strip fills wide screens. */
  repeat?: number;
  className?: string;
}

/** Static mono strip of repeated words. Decorative, so hidden from screen readers. */
export function Ticker({ items, repeat = 8, className }: TickerProps) {
  const sequence = Array.from({ length: repeat }, () => items).flat();

  return (
    <div aria-hidden="true" className={cn("overflow-hidden whitespace-nowrap", className)}>
      <div className="flex w-max items-center gap-5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
        {sequence.map((item, index) => (
          <React.Fragment key={index}>
            <span>( {item} )</span>
            <span className="text-accent">+</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
