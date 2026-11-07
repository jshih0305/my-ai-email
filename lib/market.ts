// ---------- 市場資料：FinMind（台指期夜盤、費半、道瓊） ----------
// 文件：https://finmind.github.io/  免費等級每小時 600 次，每天只抓一次很夠用

const FINMIND_URL = "https://api.finmindtrade.com/api/v4/data";

/** 一天的行情（漲跌是跟前一個交易日收盤比） */
export type Quote = {
  date: string; // YYYY-MM-DD，資料所屬交易日
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePct: number;
};

/** 台指期夜盤：FinMind / 期交所把夜盤算在「下一個交易日」 */
export type NightFutures = Quote & {
  contract: string; // 合約月份，例如 202611
  volume: number; // 口
  sessionStart: string | null; // 夜盤開始那天（前一個交易日）15:00，到隔天（日曆日）05:00
};

/** YYYY-MM-DD 加一天（日曆日） */
function nextDay(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

/**
 * 夜盤實際交易時段（台北時間）。注意：夜盤收在開盤隔天 05:00，
 * 不是 date（下一個交易日）—— 週五夜盤是週五 15:00 ~ 週六 05:00，但 date 會是下週一。
 */
export function nightSession(n: Pick<NightFutures, "date" | "sessionStart">) {
  return {
    start: n.sessionStart,
    end: n.sessionStart ? nextDay(n.sessionStart) : n.date,
  };
}

const md = (d: string) => d.slice(5).replace("-", "/");

/** 顯示用：「11/06 15:00 ~ 11/07 05:00」 */
export function nightSessionLabel(n: Pick<NightFutures, "date" | "sessionStart">): string {
  const { start, end } = nightSession(n);
  return `${start ? `${md(start)} 15:00 ~ ` : ""}${md(end)} 05:00`;
}

export type Market = {
  night: NightFutures | null;
  sox: Quote | null; // 費城半導體 ^SOX
  dji: Quote | null; // 道瓊工業 ^DJI
};

/** 台北時間 N 天前的 YYYY-MM-DD */
function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(d);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function finmind<T>(dataset: string, dataId: string, startDate: string): Promise<T[]> {
  const params = new URLSearchParams({ dataset, data_id: dataId, start_date: startDate });
  const token = process.env.FINMIND_TOKEN;
  const res = await fetch(`${FINMIND_URL}?${params}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  let j: { status?: number; msg?: string; data?: T[] };
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`FinMind 回傳非 JSON（HTTP ${res.status}）`);
  }
  // 額度用完時 HTTP 仍可能是 200，但 status 會是 402 之類
  if (!res.ok || j.status !== 200) {
    throw new Error(`FinMind ${dataset} 失敗：${j.msg ?? `HTTP ${res.status}`}`);
  }
  return j.data ?? [];
}

type FuturesRow = {
  date: string;
  futures_id: string;
  contract_date: string;
  open: number;
  max: number;
  min: number;
  close: number;
  spread: number;
  spread_per: number;
  volume: number;
  trading_session: "position" | "after_market";
};

/** 最新一場台指期（TX）夜盤，取成交量最大的單月合約（通常就是近月） */
export async function getNightFutures(): Promise<NightFutures> {
  // 往回抓 20 天，避免遇到農曆年等長假找不到資料
  const rows = await finmind<FuturesRow>("TaiwanFuturesDaily", "TX", daysAgo(20));

  const night = rows.filter(
    (r) => r.trading_session === "after_market" && /^\d{6}$/.test(r.contract_date) && r.close > 0,
  );
  const latestDate = night.map((r) => r.date).sort().at(-1);
  if (!latestDate) throw new Error("FinMind 找不到台指期夜盤資料");

  const r = night
    .filter((x) => x.date === latestDate)
    .reduce((a, b) => (b.volume > a.volume ? b : a));

  // 資料裡出現過的日期都是交易日；latestDate 的前一個交易日就是夜盤開始那天
  const tradingDays = [...new Set(rows.map((x) => x.date))].sort();
  const sessionStart = tradingDays.filter((d) => d < latestDate).at(-1) ?? null;

  return {
    date: r.date,
    contract: r.contract_date,
    open: r.open,
    high: r.max,
    low: r.min,
    close: r.close,
    change: r.spread,
    changePct: r.spread_per,
    volume: r.volume,
    sessionStart,
  };
}

type USRow = { date: string; Open: number; High: number; Low: number; Close: number };

/** 美股指數最新一個交易日（日期為美國當地交易日），漲跌用前一天收盤計算 */
export async function getUSIndex(symbol: "^SOX" | "^DJI"): Promise<Quote> {
  const rows = (await finmind<USRow>("USStockPrice", symbol, daysAgo(14)))
    .filter((r) => r.Close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = rows.at(-1);
  const prev = rows.at(-2);
  if (!last || !prev) throw new Error(`FinMind 找不到 ${symbol} 資料`);

  const change = last.Close - prev.Close;
  return {
    date: last.date,
    open: round2(last.Open),
    high: round2(last.High),
    low: round2(last.Low),
    close: round2(last.Close),
    change: round2(change),
    changePct: round2((change / prev.Close) * 100),
  };
}
