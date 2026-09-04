import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md bg-secondary px-3 text-sm text-foreground shadow-[0_0_0_1px_rgb(255_255_255_/_10%)] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}
