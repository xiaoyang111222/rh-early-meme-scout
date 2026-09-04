import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { listStocks } from "@/lib/scout/actions";
import { shortAddr } from "@/lib/scout/format";
import type { Candidate } from "@/lib/scout/types";

export function StockPanel({ paired }: { paired: Candidate[] }) {
  const q = useQuery({
    queryKey: ["rh-stocks"],
    queryFn: () => listStocks(),
    staleTime: 10 * 60_000,
  });

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-sm font-medium">扫描窗内的 Stock-Paired</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          只有「股票侧是 RH 链上真实股票代币 + meme 侧结构过滤也过」才标配对。复制 FAMI 框架不能代替五条硬过滤。
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {paired.length ? (
            paired.map((c) => (
              <div
                key={c.address}
                className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2.5 shadow-[0_0_0_1px_rgb(255_255_255_/_8%)]"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm">${c.symbol}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.stockPair?.symbol} · {c.stockPair?.name}
                  </p>
                </div>
                <Badge variant={c.verdict === "ALERT" ? "go" : "outline"}>
                  {c.verdict}
                </Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">这一窗没有明确配对的新币。</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium">Robinhood 股票代币池</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          来自官方 Stock Token API。小市值高空头仍需你自己核对，机器人不编造空头比例。
        </p>
        {q.isPending ? (
          <p className="mt-3 text-sm text-muted-foreground">加载股票池…</p>
        ) : q.isError ? (
          <p className="mt-3 text-sm text-stop">股票池暂不可用</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_rgb(255_255_255_/_8%)]">
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">代码</th>
                    <th className="px-3 py-2 font-medium">名称</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">合约</th>
                  </tr>
                </thead>
                <tbody>
                  {(q.data ?? []).map((s) => (
                    <tr key={s.contract} className="border-t border-hairline">
                      <td className="px-3 py-2 font-mono">{s.symbol}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.name}</td>
                      <td className="hidden px-3 py-2 font-mono text-xs text-muted-foreground sm:table-cell">
                        {shortAddr(s.contract)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
