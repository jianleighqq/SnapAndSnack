import React from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export const buttonTokens = {
  primary: "interactive-primary",
  secondary: "interactive-secondary border border-ink/20 text-ink bg-transparent",
  outline: "interactive-secondary border border-ink/20 text-ink bg-transparent",
  ghost: "interactive-secondary text-ink bg-transparent border-transparent",
  tile: "interactive-tile",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isSelected?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  isSelected = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const sizeClasses: Record<ButtonSize, string> = {
    sm: "min-h-[36px] px-3.5 text-xs",
    md: "min-h-[44px] px-5 text-sm",
    lg: "min-h-[56px] px-8 text-base",
    icon: "h-11 w-11 p-0",
  };

  return (
    <button
      type={type}
      data-selected={isSelected ? "true" : undefined}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-full font-medium",
        buttonTokens[variant],
        sizeClasses[size],
        isSelected && "is-selected",
        className
      )}
      {...props}
    />
  );
}

