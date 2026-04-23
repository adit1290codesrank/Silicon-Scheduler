import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[--radius-md] font-[family-name:--font-mono] text-[13px] font-medium cursor-pointer transition-all duration-150 ease-out disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-amber text-black font-bold hover:bg-[#ffb733] hover:shadow-[0_0_20px_rgba(245,166,35,0.3)] hover:-translate-y-px",
        secondary:
          "bg-elevated text-text-hi border border-border-mid hover:bg-card hover:border-border-lit",
        destructive:
          "bg-red-2 text-red border border-red/25 hover:bg-red/20",
        ghost:
          "bg-transparent text-text-mid border border-border-mid hover:bg-surface hover:text-text-hi",
        outline:
          "bg-transparent text-text-mid border border-border-mid hover:bg-surface hover:text-text-hi",
        link: "text-amber underline-offset-4 hover:underline",
      },
      size: {
        default: "px-5 py-2.5 text-[13px]",
        sm: "px-3 py-1.5 text-[12px] rounded-[--radius-sm]",
        lg: "px-7 py-3.5 text-[14px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
