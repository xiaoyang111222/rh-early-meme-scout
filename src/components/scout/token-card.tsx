import { useEffect, useState } from "react";
import {
  ExternalLink,
  Eye,
  Radio,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterLights, LightCount, SoftLightsRow } from "@/components/scout/lights";
import { DECISION_MS, RISK_FOOTER, TIER_SIZE } from "@/lib/scout/constants";
import {
  countdown,
  formatAge,
  formatPct,
  formatTop10,
  formatUsd,
  shortAddr,
} from "@/lib/scout/format";
import type { Candidate } from "@/lib/scout/types";
import { useWatchlist } from "@/store/watchlist";
import { cn } from "@/lib/utils";

function verdictBadge(c: Candidate) {
  if (c.verdict === "ALERT") return { variant: "go" as const, label: `ALERT · T${c.tier}` };
  if (c.verdict === "LATE") return { variant: "late" as const, label: "LATE" };
  return { variant: "stop" as const, label: "SKIP" };
}

export function TokenCard({
  c,
  onInspect,
}: {
  c: Candidate;
  onInspect?: (address: string) => void;
}) {
  const watch = useWatchlist((s) => s.watch);
  const watching = useWatchlist((s) =>
    s.items.some((x) => x.address.toLowerCase() === c.address.toLowerCase()),
  );
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!deadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [deadline]);

  const left = deadline ? deadline - now : null;
  const expired = left != null && left <= 0;
  const v = verdictBadge(c);

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgb(255_255_255_/_8%)]",
        c.verdict === "ALERT" && "shadow-[0_0_0_1px_rgb(63_157_115_/_35%)]",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-mono text-lg font-medium tracking-tight">
              ${c.symbol}
            </h3>
            <Badge variant={v.variant}>{v.label}</Badge>
            <Badge variant={c.stage === "graduated" ? "go" : "default"}>
              {c.stage === "graduated" ? "刚毕业" : c.stage === "bonding" ? "曲线中" : "未知阶段"}
            </Badge>
            {c.stockPair ? (
              <Badge variant="warn">配对 {c.stockPair.symbol}</Badge>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{c.name}</p>
          <button
            type="button"
            className="mt-1 font-mono text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              void navigator.clipboard.writeText(c.address);
              toast("地址已复制");
            }}
          >
            {shortAddr(c.address)}
          </button>
        </div>
        <div className="text-right">
          <LightCount lights={c.lights} />
          <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
            {formatAge(c.ageMs)}
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <Stat label="市值" value={formatUsd(c.mcapUsd)} />
        <Stat label="流动性" value={formatUsd(c.liquidityUsd)} />
        <Stat label="持有人" value={c.holders == null ? "UNKNOWN" : String(c.holders)} />
        <Stat label="前十" value={formatTop10(c.top10ExLp)} />
        <Stat
          label="1h"
          value={`${formatPct(c.priceChangeH1)} · ${formatUsd(c.volumeH1)}`}
        />
        <Stat
          label="聪明钱"
          value={`${c.smartBuyers2h.length} 钱包 / ≥$200`}
        />
        <Stat label="报价" value={c.quoteSymbol ?? "—"} />
        <Stat label="锁仓" value={c.lpLocked == null ? "UNKNOWN" : c.lpLocked ? "已锁" : "未锁"} />
      </dl>

      <FilterLights lights={c.lights} />
      <SoftLightsRow soft={c.soft} />

      {c.narrative ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">{c.narrative}</p>
      ) : null}

      {c.reasons.length ? (
        <p className="text-xs text-muted-foreground">{c.reasons[0]}</p>
      ) : null}

      {c.verdict === "ALERT" && c.tier ? (
        <div className="rounded-lg bg-secondary px-3 py-2 text-sm">
          <p className="font-medium">
            建议档位 Tier {c.tier} · ${TIER_SIZE[c.tier]} · 止损 -30%
            {c.tier === 1 ? " · 止盈 +200% 全清" : " · +100% 先卖一半"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            3 分钟决策窗口，超时视为放弃。禁止因 FOMO 加仓突破自己的线。
          </p>
        </div>
      ) : null}

      {deadline && !expired ? (
        <div className="flex items-center gap-2 font-mono text-sm tabular-nums text-warn">
          <Timer className="size-4" />
          决策剩余 {countdown(left ?? 0)}
        </div>
      ) : expired ? (
        <p className="text-sm text-stop">窗口已过，视为放弃。</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {c.verdict === "ALERT" ? (
          <Button
            size="sm"
            onClick={() => setDeadline(Date.now() + DECISION_MS)}
            disabled={Boolean(deadline) && !expired}
          >
            <Timer />
            开始 3 分钟
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const r = watch(c);
            if (!r.ok) toast.error(r.reason);
            else toast("已加入观察仓，48h 横盘钟开始计时");
          }}
          disabled={watching}
        >
          <Eye />
          {watching ? "观察中" : "观察"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onInspect?.(c.address)}>
          <Radio />
          体检
        </Button>
        {c.tweetUrl ? (
          <Button size="sm" variant="ghost" asChild>
            <a href={c.tweetUrl} target="_blank" rel="noreferrer">
              <ExternalLink />
              原文
            </a>
          </Button>
        ) : null}
        {c.dexUrl ? (
          <Button size="sm" variant="ghost" asChild>
            <a href={c.dexUrl} target="_blank" rel="noreferrer">
              <ExternalLink />
              Dex
            </a>
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" asChild>
          <a href={c.explorerUrl} target="_blank" rel="noreferrer">
            <ExternalLink />
            浏览器
          </a>
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground/80">
        {RISK_FOOTER}
      </p>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}
