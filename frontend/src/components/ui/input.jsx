import * as React from "react";
import { cn } from "../../lib/utils";

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex w-full rounded-[--radius-md] border border-border-mid bg-input px-3.5 py-2.5",
        "text-[13px] font-[family-name:--font-mono] text-text-hi",
        "outline-none transition-[border-color,box-shadow] duration-200",
        "placeholder:text-text-low",
        "focus:border-amber focus:shadow-[0_0_0_3px_rgba(245,166,35,0.07)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
