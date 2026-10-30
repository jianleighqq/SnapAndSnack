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
}

/** Flat rounded color block (radius 20, no border, no shadow). */
export function Tile({ tone = "surface", className, ...rest }: TileProps) {
  return <div className={cn("rounded-tile", tones[tone], className)} {...rest} />;
}
