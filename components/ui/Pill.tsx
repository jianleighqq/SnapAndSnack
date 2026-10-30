import React from "react";
import Link from "next/link";
import { cn } from "./cn";

export type PillVariant = "primary" | "secondary" | "accent" | "danger" | "ghost";
export type PillSize = "md" | "lg" | "icon" | "icon-lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-40";

const variants: Record<PillVariant, string> = {
  primary: "bg-ink text-paper hover:bg-ink/85",
  secondary: "border border-ink/20 text-ink hover:border-ink hover:bg-ink hover:text-paper",
  accent: "bg-accent text-white hover:bg-accent/90",
  danger: "bg-danger text-white hover:bg-danger/90",
  ghost: "text-ink hover:bg-ink/5",
};

// md = 44px (operator minimum), lg = 64px (booth touch minimum).
const sizes: Record<PillSize, string> = {
  md: "min-h-[44px] px-5 text-sm",
  lg: "min-h-[64px] px-8 text-lg",
  icon: "h-11 w-11 shrink-0",
  "icon-lg": "h-16 w-16 shrink-0",
};

export function pillClasses(variant: PillVariant = "primary", size: PillSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant;
  size?: PillSize;
}

export function Pill({ variant = "primary", size = "md", className, type = "button", ...rest }: PillProps) {
  return <button type={type} className={pillClasses(variant, size, className)} {...rest} />;
}

type LinkProps = React.ComponentProps<typeof Link>;

export interface PillLinkProps extends Omit<LinkProps, "className"> {
  variant?: PillVariant;
  size?: PillSize;
  className?: string;
}

export function PillLink({ variant = "primary", size = "md", className, ...rest }: PillLinkProps) {
  return <Link className={pillClasses(variant, size, className)} {...rest} />;
}
