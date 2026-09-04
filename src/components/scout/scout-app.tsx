import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Eye,
  Landmark,
  Radar,
  RefreshCw,
  Search,
} from "lucide-react";
import { InspectPanel } from "@/components/scout/inspect-panel";
import { Playbook } from "@/components/scout/playbook";
import { StockPanel } from "@/components/scout/stock-panel";
import { TokenCard } from "@/components/scout/token-card";
import { WatchPanel } from "@/components/scout/watch-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { scanRadar } from "@/lib/scout/actions";
import { formatAge } from "@/lib/scout/format";
import type { Candidate } from "@/lib/scout/types";
import { useWatchlist } from "@/store/watchlist";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "radar", label: "雷达", icon: Radar },
  { id: "watch", label: "观察仓", icon: Eye },
  { id: "inspect", label: "验合约", icon: Search },
  { id: "pairs", label: "配对", icon: Landmark },
  { id: "book", label: "手册", icon: BookOpen },
] as const;

type TabId = (typeof TABS)[number]["id"];
type Chip = "alerts" | "all" | "graduated" | "paired" | "late";

export function ScoutApp() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>("radar");
  const [chip, setChip] = useState<Chip>("all");
  const [inspectCa, setInspectCa] = useState<string | undefined>();
  const watchCount = useWatchlist((s) => s.items.length);

  const radar = useQuery({
    queryKey: ["radar"],
    queryFn: () => scanRadar({ data: {} }),
    staleTime: 90_000,
    refetchInterval: 10 * 60_000,
  });

  const rescan = useMutation({
    mutationFn: () => scanRadar({ data: { force: true } }),
    onSuccess: (data) => qc.setQueryData(["radar"], data),
  });

  const data = radar.data;
  const paired = useMemo(
    () => (data?.candidates ?? []).filter((c) => c.stockPair),
    [data],
  );

  const shown = useMemo(() => {
    const list = data?.candidates ?? [];
    if (chip === "alerts") return list.filter((c) => c.verdict === "ALERT");
    if (chip === "graduated") return list.filter((c) => c.stage === "graduated");
    if (chip === "paired") return list.filter((c) => c.stockPair);
    if (chip === "late") return list.filter((c) => c.verdict === "LATE");
    return list;
  }, [data, chip]);

  function openInspect(address: string) {
    setInspectCa(address);
    setTab("inspect");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-24 pt-6 sm:pb-10 sm:pt-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
            Robinhood Chain · 4663
          </p>
          <h1 className="mt-1 text-3xl font-medium tracking-tight sm:text-4xl">
            Early Meme Scout
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            第一层叙事 → 刚毕业新币 → 链上体检 → 聪明钱确认 → 五条硬过滤 → 分级仓位。只告警，不替你按下买入。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => rescan.mutate()}
            disabled={rescan.isPending || radar.isFetching}
          >
            <RefreshCw className={cn(rescan.isPending && "animate-spin")} />
            立即扫描
          </Button>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">发现 + 打分 + 告警</Badge>
        <Badge variant="outline">Pons 0–6h 毕业窗</Badge>
        <Badge variant="outline">主场 $10k–$500k</Badge>
        {data?.meta ? (
          <>
            <span className="font-mono tabular-nums">
              {data.meta.graduated} 毕业 / {data.meta.launched} 发射
            </span>
            <span className="font-mono tabular-nums">
              {formatAge(
                data.meta.scannedAt
                  ? Date.now() - new Date(data.meta.scannedAt).getTime()
                  : null,
              )}{" "}
              前
            </span>
            {!data.meta.dexOk ? <Badge variant="warn">Dex 盘口部分缺失</Badge> : null}
            {data.meta.error ? <Badge variant="stop">{data.meta.error}</Badge> : null}
          </>
        ) : null}
      </div>

      <nav className="mt-6 hidden gap-1 rounded-lg bg-secondary/70 p-1 sm:flex">
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
            icon={t.icon}
            label={t.label}
            count={t.id === "watch" ? watchCount : t.id === "radar" ? data?.alerts.length : undefined}
          />
        ))}
      </nav>

      <main className="mt-6 flex-1">
        {tab === "radar" ? (
          <RadarBoard
            loading={radar.isPending}
            error={radar.error ? (radar.error as Error).message : null}
            chip={chip}
            onChip={setChip}
            shown={shown}
            counts={{
              alerts: data?.alerts.length ?? 0,
              all: data?.candidates.length ?? 0,
              late: data?.late.length ?? 0,
              paired: paired.length,
              graduated:
                data?.candidates.filter((c) => c.stage === "graduated").length ?? 0,
            }}
            onInspect={openInspect}
          />
        ) : null}
        {tab === "watch" ? <WatchPanel /> : null}
        {tab === "inspect" ? (
          <InspectPanel
            preset={inspectCa}
            onClearPreset={() => setInspectCa(undefined)}
          />
        ) : null}
        {tab === "pairs" ? <StockPanel paired={paired} /> : null}
        {tab === "book" ? <Playbook /> : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-background/95 px-2 py-2 backdrop-blur sm:hidden">
        <div className="grid grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 text-xs",
                tab === t.id ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Radar;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm transition-colors duration-150",
        active ? "bg-card text-foreground shadow-[0_0_0_1px_rgb(255_255_255_/_8%)]" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
      {typeof count === "number" ? (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </button>
  );
}

function RadarBoard({
  loading,
  error,
  chip,
  onChip,
  shown,
  counts,
  onInspect,
}: {
  loading: boolean;
  error: string | null;
  chip: Chip;
  onChip: (c: Chip) => void;
  shown: Candidate[];
  counts: Record<Chip, number>;
  onInspect: (address: string) => void;
}) {
  const chips: { id: Chip; label: string }[] = [
    { id: "alerts", label: `告警 ${counts.alerts}` },
    { id: "all", label: `全部 ${counts.all}` },
    { id: "graduated", label: `刚毕业 ${counts.graduated}` },
    { id: "paired", label: `配对 ${counts.paired}` },
    { id: "late", label: `迟到 ${counts.late}` },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChip(c.id)}
            className={cn(
              "h-8 rounded-full px-3 text-xs transition-colors duration-150",
              chip === c.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error ? <p className="mt-4 text-sm text-stop">{error}</p> : null}

      {loading ? (
        <div className="mt-4 grid gap-3">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : shown.length ? (
        <div className="mt-4 grid gap-3">
          {shown.map((c) => (
            <TokenCard key={c.address} c={c} onInspect={onInspect} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-xl bg-card px-5 py-10 text-center shadow-[0_0_0_1px_rgb(255_255_255_/_8%)]">
          <p className="text-sm text-muted-foreground">
            {chip === "alerts"
              ? "这一窗没有 5/4 结构全绿的告警。这是正常的——大多数新币过不了过滤器。切到「全部」看红灯原因。"
              : "扫描窗是空的。等下一轮 Pons 毕业，或手动验一个 CA。"}
          </p>
        </div>
      )}
    </div>
  );
}
