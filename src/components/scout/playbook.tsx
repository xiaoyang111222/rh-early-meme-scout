import { HARD_LABELS, TIER_SIZE } from "@/lib/scout/constants";

export function Playbook() {
  return (
    <div className="flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground">
      <section>
        <h2 className="text-foreground font-medium">机器人定位</h2>
        <p className="mt-2">
          发现 + 打分 + 告警，不下单。信号优先级：推特原文 → 链上大额买入 → Pons 刚毕业 → DexScreener → 新闻。你看到新闻时通常已是出货层。
        </p>
      </section>
      <section>
        <h2 className="text-foreground font-medium">五条硬过滤</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {Object.values(HARD_LABELS).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
        <p className="mt-2">
          拿不到的数据写 UNKNOWN，并当失败。结构四条（流动性 / 持有人 / 前十 / 锁仓）必须全绿才进入分级；第 5 条聪明钱用来打档，否则原帖的 $10 / $30 档永远走不到。
        </p>
      </section>
      <section>
        <h2 className="text-foreground font-medium">仓位（只建议）</h2>
        <ul className="mt-2 space-y-1">
          <li>Tier 1 飞刀试水 ${TIER_SIZE[1]} · 止损 -30% · 止盈 +200% 全清</li>
          <li>Tier 2 单人验证 ${TIER_SIZE[2]} · 止损 -30% · +100% 先卖一半</li>
          <li>Tier 3 双聪明钱 ${TIER_SIZE[3]} · 同样止损止盈</li>
          <li>同时最多 5 个观察仓 · 横盘 48h 释放资金 · 3 分钟决策窗口</li>
        </ul>
      </section>
      <section>
        <h2 className="text-foreground font-medium">数据怎么来</h2>
        <p className="mt-2">
          Pons 工厂事件走 Blockscout；盘口走 DexScreener；持有人 / 前十 / 锁仓走浏览器与 Pons locker。fomo.family 没有公开标签接口，聪明钱用 2 小时内「合约打给 EOA、金额 ≥ $200」的独立买家做代理，并在卡片上写明。
        </p>
      </section>
    </div>
  );
}
