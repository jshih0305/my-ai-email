import OpenAI from "openai";
import Parser from "rss-parser";
import { getNightFutures, getUSIndex, nightSession, type Market, type Quote } from "@/lib/market";

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

// ---------- 舊版台積電股價（只用來顯示舊的寄送紀錄） ----------

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

// ---------- 新聞：多個 RSS 來源，交給 AI 挑重點 ----------

export type NewsItem = { title: string; link: string; pubDate: string; source?: string };

const FEEDS = [
  { source: "TechNews 科技新報", url: "https://technews.tw/feed/" },
  { source: "iThome", url: "https://www.ithome.com.tw/rss" }, // 資安新聞多
  { source: "中央社 科技", url: "https://feeds.feedburner.com/rsscna/technology" },
  { source: "中央社 財經", url: "https://feeds.feedburner.com/rsscna/finance" },
  // 一般國際新聞很雜，但美國選舉、AI 法案、關稅等牽動科技股的大事只在這裡，交給 AI 篩
  { source: "中央社 國際", url: "https://feeds.feedburner.com/rsscna/intworld" },
];

const NEWS_WINDOW_MS = 24 * 3600_000; // 晨報在早上寄，「今天」的新聞還很少，改抓過去 24 小時
const PER_FEED = 25;

async function fetchFeed({ source, url }: (typeof FEEDS)[number]): Promise<NewsItem[]> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0 my-ai-email" },
  });
  if (!res.ok) throw new Error(`${source} RSS ${res.status}`);
  const feed = await new Parser().parseString(await res.text());
  const items = feed.items
    .filter((i) => i.title && i.link && i.isoDate)
    .map((i) => ({ title: i.title!.trim(), link: i.link!, pubDate: i.isoDate!, source }));
  const since = Date.now() - NEWS_WINDOW_MS;
  const recent = items.filter((i) => new Date(i.pubDate).getTime() >= since);
  // 這個來源 24 小時內沒新聞，就退回最新幾則
  return (recent.length ? recent : items.slice(0, 5)).slice(0, PER_FEED);
}

/** 所有來源合併、去重、新到舊；任一來源失敗不影響其他來源，全部失敗才算失敗 */
export async function getNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const ok = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (!ok.length) {
    const reasons = results.map((r) => (r.status === "rejected" ? String(r.reason?.message ?? r.reason) : ""));
    throw new Error(`所有新聞來源都失敗：${reasons.filter(Boolean).join("；")}`);
  }
  const seen = new Set<string>();
  return ok
    .filter((i) => !seen.has(i.title) && (seen.add(i.title), true))
    .sort((a, b) => b.pubDate.localeCompare(a.pubDate));
}

// ---------- OpenAI 統整 ----------

export type Summary = {
  weatherSummary: string;
  marketSummary?: string;
  /** 舊紀錄才有（台積電區塊已改成市場區塊） */
  stockSummary?: string;
  newsSummary: NewsPick[];
  encouragement: string;
};

export type NewsPick = {
  title: string;
  summary: string;
  link: string;
  scope?: "國際" | "台灣"; // 舊紀錄沒有
  category?: "科技" | "資安" | "金融" | "政經";
};

/** 給 AI 看的市場資料：把日期的意義講清楚，避免誤判是哪一天的行情 */
function describeMarket(m: Market) {
  return {
    台指期夜盤: m.night && {
      交易時段: (() => {
        const s = nightSession(m.night);
        return `${s.start ?? "前一交易日"} 15:00 ~ ${s.end} 05:00（台北時間）`;
      })(),
      此夜盤反映的台股交易日: m.night.date,
      合約: m.night.contract,
      開: m.night.open,
      高: m.night.high,
      低: m.night.low,
      收: m.night.close,
      漲跌點數: m.night.change,
      漲跌幅百分比: m.night.changePct,
      成交量口數: m.night.volume,
    },
    費城半導體指數: m.sox && { 美國交易日: m.sox.date, ...quoteFields(m.sox) },
    道瓊工業指數: m.dji && { 美國交易日: m.dji.date, ...quoteFields(m.dji) },
  };
}

const quoteFields = (q: Quote) => ({
  開: q.open,
  高: q.high,
  低: q.low,
  收: q.close,
  漲跌點數: q.change,
  漲跌幅百分比: q.changePct,
});

export async function summarize(input: {
  weather: Weather | null;
  market: Market;
  news: NewsItem[];
}): Promise<Summary> {
  const { market, news, weather } = input;
  const payload = {
    今天日期: `${taipeiDate()}（星期${"日一二三四五六"[new Date(`${taipeiDate()}T00:00:00Z`).getUTCDay()]}）`,
    weather,
    market: describeMarket(market),
    news: news.map(({ title, link, source }) => ({ title, link, source })),
  };
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
          "marketSummary（4~6 句：先依 market 說明前一晚台指期夜盤、費城半導體、道瓊的概況與漲跌幅；" +
          "再綜合判斷「此夜盤反映的台股交易日」開盤與盤勢可能偏多、偏空或震盪，並點出費半對半導體/電子權值股的連動；" +
          "若該交易日不是今天（例如今天是週末或假日），要寫成「下一個交易日（M/D，星期X）」而不是「今天」；" +
          "要寫出資料日期，只有當夜盤結束日或美國交易日明顯早於最近一晚時才提醒資料可能尚未更新，否則不要加這類提醒；屬推估、勿給個股買賣建議）、" +
          "newsSummary（陣列，從 news 挑 6~8 則，每則含 title、summary（1~2 句說明重點與對市場/科技股的影響）、link、" +
          "scope（\"國際\" 或 \"台灣\"）、category（\"科技\"、\"資安\"、\"金融\" 或 \"政經\"）。" +
          "只挑重大、影響層面廣的新聞，依下列優先順序排列：" +
          "第一優先是影響國際層面的重大新聞，包括：大型科技公司與 AI 產業動向、跨國資安事件與重大漏洞、" +
          "全球股市大漲大跌與央行政策，以及會牽動科技/AI 股價的重大政治與政策事件" +
          "（如美國選舉結果、國會 AI/科技法案或禁令、關稅與出口管制、制裁），這類請標 category「政經」；" +
          "第二優先是影響台灣的重大新聞，包括台股大漲大跌或關鍵點位失守/站回、國安基金進場護盤、" +
          "台灣半導體與科技產業、本地重大資安事件、台灣金融政策。" +
          "必選規則：只要 news 裡有「美國或台灣的重大選舉/政策事件影響科技股」、「台股或全球股市劇烈波動」、「國安基金進場」這類新聞，就一定要選入，" +
          "同一事件多篇報導時選最能說明市場影響的一篇。" +
          "一般國際政治社會新聞（與市場或科技無關的外交、犯罪、醫療、動物等）、個別公司的例行月營收/財報快訊、" +
          "樂透開獎、產品小改版、生活娛樂與健康美容等不要選，除非真的沒有其他可選。" +
          "同一事件只選一則。title 與 link 必須原封不動取自 news，不可自行編造）、" +
          "encouragement（結合上述資訊，寫一段 2~3 句鼓勵我的話）。資料為 null 代表取得失敗，請略過該部分並註明。",
      },
      { role: "user", content: JSON.stringify(payload) },
    ],
  });
  const text = completion.choices[0]?.message?.content ?? "{}";
  const summary = JSON.parse(text) as Summary;
  // 只保留真的在來源裡的連結，避免 AI 編出不存在的新聞
  const links = new Set(news.map((n) => n.link));
  const rank = (n: NewsPick) => (n.scope === "台灣" ? 1 : 0);
  summary.newsSummary = (summary.newsSummary ?? [])
    .filter((n) => links.has(n.link))
    .sort((x, y) => rank(x) - rank(y)); // 國際優先；同層級維持 AI 排的重要性順序
  return summary;
}

// ---------- 組合整份晨報 ----------

export type DailyBrief = {
  date: string;
  weather: Weather | null;
  market: Market;
  news: NewsItem[];
  summary: Summary | null;
  errors?: Record<string, string>;
};

export async function buildDailyBrief(): Promise<DailyBrief> {
  const [weather, night, sox, dji, news] = await Promise.allSettled([
    getWeather(),
    getNightFutures(),
    getUSIndex("^SOX"),
    getUSIndex("^DJI"),
    getNews(),
  ]);

  const errors: Record<string, string> = {};
  const pick = <T,>(key: string, r: PromiseSettledResult<T>): T | null => {
    if (r.status === "fulfilled") return r.value;
    errors[key] = String(r.reason?.message ?? r.reason);
    return null;
  };

  const data = {
    weather: pick("weather", weather),
    market: {
      night: pick("night", night),
      sox: pick("sox", sox),
      dji: pick("dji", dji),
    },
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
