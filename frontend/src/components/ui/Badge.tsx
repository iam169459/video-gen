"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants = {
      default: "bg-primary/10 text-primary border border-primary/20",
      secondary: "bg-secondary text-secondary-foreground border border-secondary",
      destructive: "bg-destructive/10 text-destructive border border-destructive/20",
      outline: "text-foreground border border-input",
      success: "bg-green-500/10 text-green-500 border border-green-500/20",
      warning: "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20",
      info: "bg-blue-500/10 text-blue-500 border border-blue-500/20",
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border",
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";

export { Badge };