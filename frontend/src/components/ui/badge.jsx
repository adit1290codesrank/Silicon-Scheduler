import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap border",
  {
    variants: {
      variant: {
        default: "bg-elevated border-border-dim text-text-mid",
        amber:   "bg-amber-2 border-amber/25 text-amber",
        green:   "bg-green-2 border-green/25 text-green",
        red:     "bg-red-2 border-red/25 text-red",
        blue:    "bg-blue-2 border-blue/25 text-blue",
        cyan:    "bg-cyan-2 border-cyan/25 text-cyan",
        violet:  "bg-violet-2 border-violet/25 text-violet",
        muted:   "bg-white/5 border-border-dim text-text-mid",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Badge = React.forwardRef(({ className, variant, ...props }, ref) => {
  return (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
});
Badge.displayName = "Badge";

export { Badge, badgeVariants };
