import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export interface SeparatorProps extends HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
}

export const Separator = forwardRef<HTMLHRElement, SeparatorProps>(
  ({ className, orientation = "horizontal", ...props }, ref) => (
    <hr
      ref={ref}
      className={cn(
        "bg-[var(--color-border)] border-0",
        orientation === "horizontal" ? "h-px w-full" : "w-px h-full",
        className
      )}
      {...props}
    />
  )
);

Separator.displayName = "Separator";