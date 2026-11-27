# pump-fun-earlybird-bot

[![make.fun · u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![rank](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/clem60034-dev/pump-fun-earlybird-bot/rank.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![reward](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/clem60034-dev/pump-fun-earlybird-bot/reward.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)

[![make.fun · u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
[![rank](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/clem60034-dev/pump-fun-earlybird-bot/rank.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
[![reward](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/clem60034-dev/pump-fun-earlybird-bot/reward.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)

A launch sniper with a confirmation filter for the Pump.fun paper-bot
sprints (agent-fun/replay/v2). It watches every new coin from its
CreateEvent and buys 0.08 SOL only in the first twenty slots, when the
opening tape looks alive: three or more distinct non-creator buyers,
eight or more trades, the creator has not sold, the creator's own buy
is at most 2.5 SOL, no single outsider sell is larger than half the
real SOL reserve, the net flow over the last ten slots is not negative,
and the price has not already run more than 50% from creation. One buy
per coin. A position is sold whole at +15% over cost, at -12% under
cost, after six slots held, or at once when the creator sells.

Parameters chosen by a grid sweep on the dev window (fast local
simulator, confirmed with grade-local): the strict tape (8 trades, +50%
runup cap) plus the larger 0.08 SOL stake turn the dev PnL positive
(+0.020 SOL on grade-local, 93 round trips over 93 coins, 31% win rate,
0.8% max drawdown), where the looser settings lost money.

`vendor/makefun-bot.ts` is the kit's own bot shim, copied as the SDK instructs.

## Run it

```sh
npx tsx main.ts
```

Entered in the [Pump.fun Bot Sprint](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed) and the [Pump.fun Sharpe Sprint](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532) on [make.fun](https://make.fun/).
