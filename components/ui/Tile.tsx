import React from "react";
import { cn } from "./cn";

export type TileTone = "surface" | "paper" | "accent" | "sun" | "ink";

const tones: Record<TileTone, string> = {
  surface: "bg-surface text-ink",
  paper: "bg-paper text-ink",
  accent: "bg-accent text-white",
  // Sun yellow always needs dark text, even in dark mode.
  sun: "bg-sun text-[#161513]",
  ink: "bg-ink text-paper",
};

export interface TileProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: TileTone;
  interactive?: boolean;
  isSelected?: boolean;
}

/** Flat rounded color block (radius 20, no border, no shadow). */
export function Tile({
  tone = "surface",
  interactive = false,
  isSelected = false,
  className,
  ...rest
}: TileProps) {
  return (
    <div
      data-selected={isSelected ? "true" : undefined}
      className={cn(
        "rounded-tile",
        tones[tone],
        interactive && "interactive-tile cursor-pointer",
        isSelected && "is-selected",
        className
      )}
      {...rest}
    />
  );
}
