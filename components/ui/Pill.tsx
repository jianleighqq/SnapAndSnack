import React from "react";
import Link from "next/link";
import { cn } from "./cn";

export type PillVariant = "primary" | "secondary" | "accent" | "danger" | "ghost";
export type PillSize = "sm" | "md" | "lg" | "icon" | "icon-lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8541E] focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-auto";

const variants: Record<PillVariant, string> = {
  primary: "interactive-primary",
  secondary: "interactive-secondary border border-ink/20 text-ink bg-transparent",
  accent: "interactive-base bg-accent text-white hover:bg-accent/90 active:scale-[0.98]",
  danger: "interactive-base bg-danger text-white hover:bg-danger/90 active:scale-[0.98]",
  ghost: "interactive-secondary text-ink bg-transparent border-transparent",
};

// sm = 36px, md = 44px (operator minimum), lg = 64px (booth touch minimum).
const sizes: Record<PillSize, string> = {
  sm: "min-h-[36px] px-3.5 text-xs",
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
  isSelected?: boolean;
}

export function Pill({ variant = "primary", size = "md", isSelected = false, className, type = "button", ...rest }: PillProps) {
  return (
    <button
      type={type}
      data-selected={isSelected ? "true" : undefined}
      className={cn(pillClasses(variant, size, className), isSelected && "is-selected")}
      {...rest}
    />
  );
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
