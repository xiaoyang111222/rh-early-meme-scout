import { cn } from "@/lib/utils";

export function Separator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="separator"
      className={cn("h-px w-full bg-border", className)}
      {...props}
    />
  );
}
