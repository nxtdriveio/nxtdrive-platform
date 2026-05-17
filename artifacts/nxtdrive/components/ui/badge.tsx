import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground",
        primary: "bg-primary-soft text-primary",
        success:
          "bg-[color-mix(in_oklab,var(--success)_15%,transparent)] text-success",
        warning:
          "bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] text-warning",
        danger:
          "bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] text-danger",
        info: "bg-[color-mix(in_oklab,var(--info)_15%,transparent)] text-info",
        outline: "border border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
