# RH Early Meme Scout

Robinhood Chain（chainId `4663`）早期 meme 研究台：Pons 刚毕业雷达、五条硬过滤、仓位建议、观察仓哨兵。

**只做发现 / 打分 / 告警，不下单。** 绝大多数新币会归零。只用愿意全亏的钱。

## 本地运行

```bash
npm install
npm run dev
```

开发服务器默认 `http://localhost:8080`。

```bash
npm run build
npm run typecheck
```

## 数据从哪来

| 模块 | 来源 |
| --- | --- |
| 新币 / 毕业 | Pons 工厂事件（Blockscout） |
| 盘口 | DexScreener |
| 持有人 / 前十 / 锁仓 | Blockscout + Pons locker |
| 聪明钱 | 链上 ≥ $200 买入代理（不是 fomo 标签） |
| 股票代币 | Robinhood Stock Token API |

拿不到的数字写 `UNKNOWN`，并当红灯。

## 仓位（仅建议）

- Tier 1 $10 · 止损 -30% · 止盈 +200% 全清
- Tier 2 $30 · 止损 -30% · +100% 先卖一半
- Tier 3 $60 · 同样止损止盈
- 同时最多 5 个观察仓 · 横盘 48h 释放资金
