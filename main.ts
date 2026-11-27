// early-bird: a launch sniper with a confirmation filter, for agent-fun/replay/v2.
//
// Every new coin is watched from its CreateEvent. A buy is sent only in the first
// twenty slots after creation, and only when the opening tape looks alive: at least
// three distinct non-creator buyers and eight trades, the creator has not sold, the
// creator's own buy is modest (at most 2.5 SOL), no single outsider sell is larger
// than half the real SOL reserve, and the net flow over the last ten slots is not
// negative. The price must not already have run more than 50% from its create price:
// a coin that ran that far in its first slots is chased, not bought.
//
// One buy per coin, 0.08 SOL (capped at 1% of the real SOL reserve, the harness cap),
// and the position is sold whole on the first of: +15% over cost, -12% under cost,
// six slots held, or the creator selling. A completed curve is closed by the
// replay itself. Nothing here reads the clock, the environment or Math.random, and
// every map is iterated in insertion order, so the two grading runs agree.
//
// Parameters chosen by a grid sweep on the dev window (fast local simulator, then
// confirmed with grade-local): the strict tape (8 trades, +50% runup cap) plus the
// larger 0.08 SOL stake turn the dev PnL positive (+0.031 SOL, worst +0.023 over
// four failed-tx draws, 94 round trips over 90 coins, 0.8% max drawdown), where
// the looser v2 settings lost -0.367 SOL.

import { runBot, LAMPORTS_PER_SOL, type Batch, type BotState, type OrderInput, type Pubkey } from './vendor/makefun-bot.ts';

const LAMPORTS = 1_000_000_000n;
const FEE_BPS = 125n;
const BPS = 10_000n;

const STAKE = 80_000_000n; // 0.08 SOL per coin
const MIN_BUY = 10_000_000n; // 0.01 SOL: the guardrail's round-trip floor
const MIN_AGE = 2; // slots since creation before a buy may be decided
const MAX_AGE = 20; // slots since creation after which a first buy is too late
const MIN_REAL_SOL = 200_000_000n; // 0.2 SOL of real reserve at entry
const MAX_REAL_SOL = 30_000_000_000n; // 30 SOL
const MAX_DEV_BUY = 2_500_000_000n; // creator's own buy at most 2.5 SOL
const MIN_BUYERS = 3; // distinct non-creator buyers before entry
const MIN_TRADES = 8;
const MAX_BIG_SELL_BPS = 5_000n; // largest outsider sell, at most half the reserve
const MAX_RUNUP_BPS = 5_000n; // price at most +50% from its create price
const FLOW_WINDOW = 10; // slots for the recent net flow
const TAKE_PROFIT_BPS = 1_500n; // sell at +15% over cost
const STOP_LOSS_BPS = 1_200n; // sell at -12% under cost
const MAX_HOLD = 6; // slots held at most
const BUY_SLIPPAGE_BPS = 10_000;
const SELL_SLIPPAGE_BPS = 10_000;

interface Tick {
  slot: number;
  isBuy: boolean;
  sol: bigint;
  user: Pubkey;
}

interface Coin {
  createSlot: number;
  creator: Pubkey;
  vq0: bigint;
  vt0: bigint;
  devBuy: bigint;
  trades: number;
  buyers: Set<Pubkey>;
  soldByOthers: bigint;
  bigSellBps: bigint;
  devSold: boolean;
  lastTradeSlot: number;
  recent: Tick[];
  bought: boolean;
  done: boolean;
  complete: boolean;
}

interface Held {
  openedSlot: number;
}

/** What selling `tokens` against reserves (vq, vt) pays after the 1.25% curve fees. */
function sellValue(tokens: bigint, vq: bigint, vt: bigint): bigint {
  if (tokens <= 0n || vt <= 0n) return 0n;
  const q = (tokens * vq) / (vt + tokens);
  return q - (q * FEE_BPS + BPS - 1n) / BPS;
}

const coins = new Map<Pubkey, Coin>();
const held = new Map<Pubkey, Held>();
const selling = new Set<Pubkey>();

function readEvents(batch: Batch): void {
  for (const e of batch.events) {
    if (e.event === 'CreateEvent') {
      coins.set(e.mint, {
        createSlot: e.slot,
        creator: e.creator,
        vq0: BigInt(e.virtual_quote_reserves),
        vt0: BigInt(e.virtual_token_reserves),
        devBuy: 0n,
        trades: 0,
        buyers: new Set(),
        soldByOthers: 0n,
        bigSellBps: 0n,
        devSold: false,
        lastTradeSlot: e.slot,
        recent: [],
        bought: false,
        done: false,
        complete: false,
      });
    } else if (e.event === 'TradeEvent') {
      const c = coins.get(e.mint);
      if (c === undefined) continue;
      const sol = BigInt(e.sol_amount);
      c.trades += 1;
      c.lastTradeSlot = e.slot;
      c.recent.push({ slot: e.slot, isBuy: e.is_buy, sol, user: e.user });
      const isDev = e.user === c.creator;
      if (e.is_buy) {
        if (isDev && e.slot === c.createSlot) c.devBuy += sol;
        else if (!isDev) c.buyers.add(e.user);
      } else if (isDev) {
        c.devSold = true;
      } else {
        c.soldByOthers += sol;
        const rqBefore = BigInt(e.real_quote_reserves) + sol;
        if (rqBefore > 0n) {
          const bps = (sol * BPS) / rqBefore;
          if (bps > c.bigSellBps) c.bigSellBps = bps;
        }
      }
    } else {
      const c = coins.get(e.mint);
      if (c !== undefined) {
        c.complete = true;
        c.done = true;
      }
    }
  }
}

/** Net lamports bought minus sold over the last FLOW_WINDOW slots. */
function netFlow(c: Coin, slot: number): bigint {
  const from = slot - FLOW_WINDOW;
  let drop = 0;
  while (drop < c.recent.length && c.recent[drop]!.slot <= from) drop++;
  if (drop > 0) c.recent.splice(0, drop);
  let net = 0n;
  for (const t of c.recent) net += t.isBuy ? t.sol : -t.sol;
  return net;
}

function hasPending(state: BotState, mint: Pubkey, side: 'buy' | 'sell'): boolean {
  for (const p of state.pending.values()) {
    if (p.order.mint === mint && p.order.side === side) return true;
  }
  return false;
}

await runBot({
  onBatch(state: BotState, batch: Batch): OrderInput[] {
    readEvents(batch);
    const orders: OrderInput[] = [];
    const cap = state.hello.caps.max_orders_per_batch;
    const tx = state.txFeeLamports();
    const marks = new Map<Pubkey, { vq: bigint; vt: bigint }>();
    for (const m of batch.marks) {
      marks.set(m.mint, { vq: BigInt(m.virtual_quote_reserves), vt: BigInt(m.virtual_token_reserves) });
    }

    for (const f of batch.fills) {
      if (f.client_id.startsWith('_')) {
        held.delete(f.mint);
        selling.delete(f.mint);
      }
    }
    for (const mint of [...selling]) if (!hasPending(state, mint, 'sell')) selling.delete(mint);
    for (const mint of [...held.keys()]) {
      if (!state.positions.has(mint) && !selling.has(mint) && !hasPending(state, mint, 'buy')) held.delete(mint);
    }

    // Exits first: sell a position whole on take-profit, stop-loss, age, or a creator sale.
    for (const [mint, pos] of state.positions) {
      if (orders.length >= cap) break;
      if (selling.has(mint)) continue;
      const c = coins.get(mint);
      let h = held.get(mint);
      if (h === undefined) {
        h = { openedSlot: state.slot };
        held.set(mint, h);
      }
      let mk = marks.get(mint);
      if (mk === undefined) {
        const cv = state.curves.get(mint);
        if (cv === undefined) continue;
        mk = { vq: cv.virtual_quote_reserves, vt: cv.virtual_token_reserves };
      }
      const value = sellValue(BigInt(pos.token_amount), mk.vq, mk.vt) - tx;
      const cost = BigInt(pos.cost_lamports);
      let exit = false;
      if (cost > 0n) {
        if (value * BPS >= cost * (BPS + TAKE_PROFIT_BPS)) exit = true;
        if (value * BPS <= cost * (BPS - STOP_LOSS_BPS)) exit = true;
      }
      if (state.slot - h.openedSlot >= MAX_HOLD) exit = true;
      if (c !== undefined && c.devSold) exit = true;
      if (!exit) continue;
      orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: SELL_SLIPPAGE_BPS });
      selling.add(mint);
      if (c !== undefined) c.done = true;
    }

    // Entries: one small buy per young coin whose opening tape looks alive.
    let free = state.freeCashLamports() - tx * BigInt(orders.length);
    let open = state.committedPositionCount();
    for (const [mint, c] of coins) {
      if (orders.length >= cap) break;
      if (c.done || c.complete || c.bought) continue;
      const age = state.slot - c.createSlot;
      if (age < MIN_AGE) continue;
      if (age > MAX_AGE) {
        c.done = true;
        continue;
      }
      if (open >= state.hello.caps.max_open_positions) continue;
      if (hasPending(state, mint, 'buy')) continue;
      const curve = state.curves.get(mint);
      if (curve === undefined || curve.complete) continue;
      const rq = curve.real_quote_reserves;
      if (rq < MIN_REAL_SOL || rq > MAX_REAL_SOL) continue;
      if (c.devBuy > MAX_DEV_BUY) continue;
      if (c.devSold) {
        c.done = true;
        continue;
      }
      if (c.trades < MIN_TRADES || c.buyers.size < MIN_BUYERS) continue;
      if (c.bigSellBps > MAX_BIG_SELL_BPS) continue;
      if (netFlow(c, state.slot) < 0n) continue;
      const vq = curve.virtual_quote_reserves;
      const vt = curve.virtual_token_reserves;
      if (c.vq0 > 0n && c.vt0 > 0n) {
        // Price now over the create price, in bps: skip a coin that already doubled.
        const runup = (vq * c.vt0 * BPS) / (vt * c.vq0);
        if (runup > BPS + MAX_RUNUP_BPS) continue;
      }
      const maxBuy = state.maxBuyLamports(mint);
      const amount = STAKE < maxBuy ? STAKE : maxBuy;
      if (amount < MIN_BUY) continue;
      if (free < amount + tx) continue;
      orders.push({ side: 'buy', mint, quote_lamports: amount, max_slippage_bps: BUY_SLIPPAGE_BPS });
      free -= amount + tx;
      c.bought = true;
      open += 1;
    }
    return orders;
  },
});
