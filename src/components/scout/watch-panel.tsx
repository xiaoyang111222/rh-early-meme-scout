import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { refreshQuotes } from "@/lib/scout/actions";
import { TIER_SIZE } from "@/lib/scout/constants";
import { formatAge, formatPct, formatUsd, shortAddr } from "@/lib/scout/format";
import {
  sentryFlags,
  useWatchlist,
  type WatchEntry,
} from "@/store/watchlist";
import { cn } from "@/lib/utils";

export function WatchPanel() {
  const items = useWatchlist((s) => s.items);
  const drop = useWatchlist((s) => s.drop);
  const patchQuotes = useWatchlist((s) => s.patchQuotes);

  const quotes = useMutation({
    mutationFn: (addresses: string[]) => refreshQuotes({ data: { addresses } }),
    onSuccess: (rows) => patchQuotes(rows),
  });

  useEffect(() => {
    if (!items.length) return;
    void quotes.mutateAsync(items.map((x) => x.address));
    const id = window.setInterval(() => {
      void quotes.mutateAsync(items.map((x) => x.address));
    }, 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((x) => x.address).join(",")]);

  if (!items.length) {
    return (
      <div className="rounded-xl bg-card px-5 py-10 text-center shadow-[0_0_0_1px_rgb(255_255_255_/_8%)]">
        <p className="text-sm text-muted-foreground">
          观察仓空着。雷达出 5/5 或你拍板的票，最多同时 5 个。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        持仓哨兵每分钟刷新价格。-30% 止损、+100% / +200% 止盈、48h 无新高则释放资金。
      </p>
      {items.map((it) => (
        <WatchRow key={it.address} entry={it} onDrop={() => drop(it.address)} />
      ))}
    </div>
  );
}

function WatchRow({ entry, onDrop }: { entry: WatchEntry; onDrop: () => void }) {
  const f = sentryFlags(entry);
  return (
    <article className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgb(255_255_255_/_8%)] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-mono text-base">${entry.symbol}</h3>
          {entry.tier ? (
            <Badge variant="outline">T{entry.tier} · ${TIER_SIZE[entry.tier]}</Badge>
          ) : (
            <Badge variant="outline">观察</Badge>
          )}
          {f.sl ? <Badge variant="stop">止损 -30%</Badge> : null}
          {f.tpHalf && !f.tpFull ? <Badge variant="go">可卖一半</Badge> : null}
          {f.tpFull ? <Badge variant="go">止盈 +200%</Badge> : null}
          {f.flatten ? <Badge variant="warn">48h 横盘 · 释放资金</Badge> : null}
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {shortAddr(entry.address)} · 已观察 {formatAge(f.age)}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p
            className={cn(
              "font-mono text-lg tabular-nums",
              (f.pnl ?? 0) < 0 ? "text-stop" : (f.pnl ?? 0) > 0 ? "text-go" : "text-foreground",
            )}
          >
            {formatPct(f.pnl)}
          </p>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatUsd(entry.lastMcap)}
          </p>
        </div>
        <Button size="icon" variant="ghost" onClick={onDrop} aria-label="释放">
          <Trash2 className="size-4" />
        </Button>
      </div>
    </article>
  );
}
