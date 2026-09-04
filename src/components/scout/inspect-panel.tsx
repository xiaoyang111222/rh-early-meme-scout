import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { TokenCard } from "@/components/scout/token-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inspectToken, scoreTokenNarrative } from "@/lib/scout/actions";
import { isAddress } from "@/lib/scout/format";
import type { Candidate, NarrativeScore } from "@/lib/scout/types";

export function InspectPanel({
  preset,
  onClearPreset,
}: {
  preset?: string;
  onClearPreset?: () => void;
}) {
  const [ca, setCa] = useState(preset ?? "");
  const [result, setResult] = useState<Candidate | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [story, setStory] = useState<NarrativeScore | null>(null);

  const inspect = useMutation({
    mutationFn: (address: string) => inspectToken({ data: { address } }),
    onSuccess: (data) => {
      if ("error" in data) {
        setResult(null);
        setErr(data.error);
        return;
      }
      setErr(null);
      setResult(data);
      setStory(null);
      onClearPreset?.();
    },
    onError: (e: Error) => {
      setErr(e.message);
      setResult(null);
    },
  });

  useEffect(() => {
    if (preset && isAddress(preset)) {
      setCa(preset);
      inspect.mutate(preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const narrative = useMutation({
    mutationFn: (c: Candidate) =>
      scoreTokenNarrative({
        data: {
          name: c.name,
          symbol: c.symbol,
          narrative: c.narrative,
          tweetUrl: c.tweetUrl,
          stockPair: c.stockPair?.symbol ?? null,
        },
      }),
    onSuccess: setStory,
  });

  function run() {
    const v = ca.trim();
    if (!isAddress(v)) {
      setErr("需要 0x 开头的 40 位合约地址");
      return;
    }
    inspect.mutate(v);
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <Input
          value={ca}
          onChange={(e) => setCa(e.target.value)}
          placeholder="粘贴 Robinhood Chain 合约 0x…"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="font-mono"
        />
        <Button type="submit" disabled={inspect.isPending} className="sm:w-36">
          <Search />
          {inspect.isPending ? "体检中" : "跑五条过滤"}
        </Button>
      </form>
      {err ? <p className="text-sm text-stop">{err}</p> : null}
      {result ? (
        <div className="flex flex-col gap-3">
          <TokenCard c={result} />
          <div className="rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgb(255_255_255_/_8%)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium">叙事加分（排序用，不是入场条件）</h3>
              <Button
                size="sm"
                variant="secondary"
                disabled={narrative.isPending}
                onClick={() => narrative.mutate(result)}
              >
                {narrative.isPending ? "打分中" : "让 Grok 读叙事"}
              </Button>
            </div>
            {story ? (
              <div className="mt-3 space-y-1 text-sm">
                <p className="font-mono tabular-nums">
                  {story.ok ? `${story.scoreDelta > 0 ? "+" : ""}${story.scoreDelta}` : "—"} ·{" "}
                  {story.label} · {story.pairing}
                </p>
                <p className="text-muted-foreground">{story.summary}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                只在你点按钮时调用，不自动扫。媒体稿和二手转述不加分。
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          丢一个 CA，回传红绿灯、聪明钱代理（链上 ≥$200 买入，不是 fomo 标签）和建议档位。拿不到的数据写 UNKNOWN 并判红灯。
        </p>
      )}
    </div>
  );
}
