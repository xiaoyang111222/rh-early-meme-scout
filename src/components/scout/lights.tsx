import { HARD_LABELS, SOFT_LABELS } from "@/lib/scout/constants";
import type { HardKey, Light, Lights, SoftKey, SoftLights } from "@/lib/scout/types";
import { cn } from "@/lib/utils";

const HARD_KEYS = Object.keys(HARD_LABELS) as HardKey[];
const SOFT_KEYS = Object.keys(SOFT_LABELS) as SoftKey[];

function Dot({ value }: { value: Light }) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        value === "PASS" && "bg-go",
        value === "FAIL" && "bg-stop",
        value === "UNKNOWN" && "bg-warn",
      )}
    />
  );
}

export function FilterLights({
  lights,
  compact = false,
}: {
  lights: Lights;
  compact?: boolean;
}) {
  return (
    <ul className={cn("grid gap-1.5", compact ? "grid-cols-1" : "sm:grid-cols-1")}>
      {HARD_KEYS.map((k) => (
        <li
          key={k}
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Dot value={lights[k]} />
          <span className="min-w-0 flex-1 truncate">{HARD_LABELS[k]}</span>
          <span
            className={cn(
              "font-mono tabular-nums",
              lights[k] === "PASS" && "text-go",
              lights[k] === "FAIL" && "text-stop",
              lights[k] === "UNKNOWN" && "text-warn",
            )}
          >
            {lights[k]}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SoftLightsRow({ soft }: { soft: SoftLights }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {SOFT_KEYS.map((k) => (
        <li
          key={k}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Dot value={soft[k]} />
          {SOFT_LABELS[k]}
        </li>
      ))}
    </ul>
  );
}

export function LightCount({ lights }: { lights: Lights }) {
  const n = HARD_KEYS.filter((k) => lights[k] === "PASS").length;
  return (
    <span
      className={cn(
        "font-mono text-sm tabular-nums",
        n === 5 ? "text-go" : n >= 4 ? "text-warn" : "text-muted-foreground",
      )}
    >
      {n}/5
    </span>
  );
}
