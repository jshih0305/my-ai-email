import OpenAI from "openai";
import Parser from "rss-parser";

const TZ = "Asia/Taipei";

/** 取得台北時區的 YYYY-MM-DD */
export function taipeiDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

// ---------- 天氣：Open-Meteo（免 token） ----------

const WMO: Record<number, string> = {
  0: "晴天", 1: "大致晴朗", 2: "局部多雲", 3: "陰天",
  45: "有霧", 48: "霧淞",
  51: "毛毛雨（小）", 53: "毛毛雨（中）", 55: "毛毛雨（大）",
  61: "小雨", 63: "中雨", 65: "大雨",
  71: "小雪", 73: "中雪", 75: "大雪",
  80: "陣雨（小）", 81: "陣雨（中）", 82: "陣雨（大）",
  95: "雷雨", 96: "雷雨伴隨冰雹", 99: "強雷雨伴隨冰雹",
};

export type Weather = {
  location: string;
  date: string;
  description: string;
  currentTemp: number;
  maxTemp: number;
  minTemp: number;
  rainChance: number;
};

export async function getWeather(): Promise<Weather> {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=25.033&longitude=121.5654" +
    "&current=temperature_2m,weather_code" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    `&timezone=${encodeURIComponent(TZ)}&forecast_days=1`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const j = await res.json();
  const code = j.daily.weather_code[0] as number;
  return {
    location: "台北",
    date: j.daily.time[0],
    description: WMO[code] ?? `天氣代碼 ${code}`,
    currentTemp: j.current.temperature_2m,
    maxTemp: j.daily.temperature_2m_max[0],
    minTemp: j.daily.temperature_2m_min[0],
    rainChance: j.daily.precipitation_probability_max[0],
  };
}

// ---------- 股價：證交所 TWSE STOCK_DAY（免 token） ----------

export type StockDay = {
  stockNo: string;
  name: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  volume: number;
};

const num = (s: string) => Number(s.replace(/,/g, "").replace(/^X/, ""));

/** 民國日期 115/11/02 -> 2026-11-02 */
const rocToIso = (s: string) => {
  const [y, m, d] = s.split("/");
  return `${Number(y) + 1911}-${m}-${d}`;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchTwseMonth(stockNo: string, yyyymm01: string, retries = 1) {
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${yyyymm01}&stockNo=${stockNo}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 my-ai-email" },
  });
  const text = await res.text();
  // 證交所在請求過於頻繁時會回傳 HTML 封鎖頁，而不是 JSON
  if (!res.ok || !text.trimStart().startsWith("{")) {
    if (retries > 0) {
      await sleep(1500);
      return fetchTwseMonth(stockNo, yyyymm01, retries - 1);
    }
    throw new Error(
      `證交所 API 回傳非 JSON（HTTP ${res.status}），可能是請求過於頻繁被暫時封鎖，請稍後再試`,
    );
  }
  const j = JSON.parse(text);
  if (j.stat !== "OK") return [] as string[][];
  return j.data as string[][];
}

// 前一交易日股價當天不會變，記憶體快取一天；同時進來的請求共用同一個 Promise
const stockCache = new Map<string, Promise<StockDay>>();

/** 抓「今天以前」最近一個交易日（昨天若休市就往前找），每天只打一次證交所 */
export function getPrevTradingDay(stockNo = "2330"): Promise<StockDay> {
  const key = `${stockNo}:${taipeiDate()}`;
  let p = stockCache.get(key);
  if (!p) {
    stockCache.clear(); // 只保留當天
    p = fetchPrevTradingDay(stockNo).catch((e) => {
      stockCache.delete(key); // 失敗不快取，下次重試
      throw e;
    });
    stockCache.set(key, p);
  }
  return p;
}

async function fetchPrevTradingDay(stockNo: string): Promise<StockDay> {
  const today = taipeiDate();
  const [y, m] = today.split("-").map(Number);
  const thisMonth = `${y}${String(m).padStart(2, "0")}01`;
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const prevMonth = `${py}${String(pm).padStart(2, "0")}01`;

  let rows = (await fetchTwseMonth(stockNo, thisMonth)).filter(
    (r) => rocToIso(r[0]) < today,
  );
  if (rows.length === 0) {
    rows = (await fetchTwseMonth(stockNo, prevMonth)).filter(
      (r) => rocToIso(r[0]) < today,
    );
  }
  const r = rows.at(-1);
  if (!r) throw new Error("找不到前一個交易日資料");
  return {
    stockNo,
    name: "台積電",
    date: rocToIso(r[0]),
    open: num(r[3]),
    high: num(r[4]),
    low: num(r[5]),
    close: num(r[6]),
    change: num(r[7]),
    volume: num(r[1]),
  };
}

// ---------- 科技新聞：RSS ----------

export type NewsItem = { title: string; link: string; pubDate: string };

const RSS_URL = "https://technews.tw/feed/";

export async function getTechNews(limit = 8): Promise<NewsItem[]> {
  const res = await fetch(RSS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`RSS ${res.status}`);
  const feed = await new Parser().parseString(await res.text());
  const today = taipeiDate();
  const items = feed.items
    .filter((i) => i.title && i.link && i.isoDate)
    .map((i) => ({ title: i.title!, link: i.link!, pubDate: i.isoDate! }));
  const todays = items.filter((i) => taipeiDate(new Date(i.pubDate)) === today);
  // 今天若還沒有新聞，就退回最新幾則
  return (todays.length ? todays : items).slice(0, limit);
}

// ---------- OpenAI 統整 ----------

export type Summary = {
  weatherSummary: string;
  stockSummary: string;
  newsSummary: { title: string; summary: string; link: string }[];
  encouragement: string;
};

export async function summarize(input: {
  weather: Weather | null;
  stock: StockDay | null;
  news: NewsItem[];
}): Promise<Summary> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你是一位溫暖的每日晨報助理，使用繁體中文。根據使用者提供的資料，回傳 JSON，欄位為：" +
          "weatherSummary（今日天氣重點與穿著/帶傘建議）、" +
          "stockSummary（台積電前一交易日股價表現簡評，勿給投資建議）、" +
          "newsSummary（陣列，挑 3~5 則重點科技新聞，每則含 title、summary、link）、" +
          "encouragement（結合上述資訊，寫一段 2~3 句鼓勵我的話）。資料為 null 代表取得失敗，請略過該部分並註明。",
      },
      { role: "user", content: JSON.stringify(input) },
    ],
  });
  const text = completion.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text) as Summary;
}

// ---------- 組合整份晨報 ----------

export type DailyBrief = {
  date: string;
  weather: Weather | null;
  stock: StockDay | null;
  news: NewsItem[];
  summary: Summary | null;
  errors?: Record<string, string>;
};

export async function buildDailyBrief(): Promise<DailyBrief> {
  const [weather, stock, news] = await Promise.allSettled([
    getWeather(),
    getPrevTradingDay("2330"),
    getTechNews(),
  ]);

  const errors: Record<string, string> = {};
  const pick = <T,>(key: string, r: PromiseSettledResult<T>): T | null => {
    if (r.status === "fulfilled") return r.value;
    errors[key] = String(r.reason?.message ?? r.reason);
    return null;
  };

  const data = {
    weather: pick("weather", weather),
    stock: pick("stock", stock),
    news: pick("news", news) ?? [],
  };

  let summary: Summary | null = null;
  try {
    summary = await summarize(data);
  } catch (e) {
    errors.openai = e instanceof Error ? e.message : String(e);
  }

  return {
    date: taipeiDate(),
    ...data,
    summary,
    ...(Object.keys(errors).length ? { errors } : {}),
  };
}
