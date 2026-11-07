import type { NewsItem, StockDay, Summary, Weather } from "@/lib/daily-brief";
import { nightSessionLabel, type Market, type Quote } from "@/lib/market";

export type BriefData = {
  weather: Weather | null;
  market?: Market | null;
  stock?: StockDay | null; // 舊紀錄才有
  news: NewsItem[];
  summary: Summary | null;
  errors?: Record<string, string>;
};

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <span aria-hidden>{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function AiNote({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="mt-4 rounded-xl bg-indigo-50 p-3 text-sm leading-6 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200">
      <span className="mr-1 font-semibold">AI 摘要：</span>
      {text}
    </p>
  );
}

function ErrorNote({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="text-sm text-red-600 dark:text-red-400">取得失敗：{text}</p>;
}

/** 2026-11-06 -> 11/06 */
const md = (d: string) => d.slice(5).replace("-", "/");

/** 一列行情：名稱/日期在左，收盤與漲跌在右（台股慣例：漲紅跌綠） */
function MarketRow({
  name,
  sub,
  quote,
  error,
}: {
  name: string;
  sub?: string | null;
  quote?: Quote | null;
  error?: string;
}) {
  const color = !quote
    ? ""
    : quote.change > 0
      ? "text-red-600 dark:text-red-400"
      : quote.change < 0
        ? "text-green-600 dark:text-green-400"
        : "";
  const arrow = !quote ? "" : quote.change > 0 ? "▲" : quote.change < 0 ? "▼" : "";
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
      <div className="min-w-0">
        <div className="font-medium">{name}</div>
        {quote ? (
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{sub}</div>
        ) : (
          <ErrorNote text={error ?? "無資料"} />
        )}
      </div>
      {quote && (
        <div className="shrink-0 text-right tabular-nums">
          <div className="text-xl font-semibold">{quote.close.toLocaleString()}</div>
          <div className={`text-sm font-semibold ${color}`}>
            {arrow}
            {Math.abs(quote.change).toLocaleString()}（{quote.changePct.toFixed(2)}%）
          </div>
        </div>
      )}
    </div>
  );
}

/** 新聞上方的小標籤：國際/台灣、類別、來源 */
function NewsTags({ tags }: { tags: (string | undefined)[] }) {
  const list = tags.filter(Boolean) as string[];
  if (!list.length) return null;
  return (
    <div className="mb-1 flex flex-wrap gap-1.5">
      {list.map((t, i) => (
        <span
          key={`${i}-${t}`}
          className={`rounded-full px-2 py-0.5 text-xs ${
            i === 0 && t === "國際"
              ? "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

/** 顯示一份晨報的完整內容（天氣、股價、新聞、鼓勵） */
export default function BriefDetail({ brief }: { brief: BriefData }) {
  const { weather, market, stock, news = [], summary, errors } = brief;
  const up = (stock?.change ?? 0) > 0;
  const down = (stock?.change ?? 0) < 0;
  // 台股慣例：漲紅跌綠
  const changeColor = up ? "text-red-600" : down ? "text-green-600" : "";
  const prevClose = stock ? stock.close - stock.change : 0;
  const pct = stock && prevClose ? (stock.change / prevClose) * 100 : 0;

  return (
    <div className="grid gap-6">
      {/* 鼓勵的話 */}
      <section className="rounded-2xl bg-gradient-to-br from-amber-100 to-rose-100 p-6 dark:from-amber-900/40 dark:to-rose-900/40">
        <h2 className="mb-2 text-lg font-semibold">💪 今天給你的話</h2>
        {summary?.encouragement ? (
          <p className="text-lg leading-8">{summary.encouragement}</p>
        ) : (
          <ErrorNote text={errors?.openai ?? "沒有產生內容"} />
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* 天氣 */}
        <Card title={`天氣・${weather?.location ?? "台北"}`} icon="🌤️">
          {weather ? (
            <>
              <p className="mb-3 text-2xl font-semibold">{weather.description}</p>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="當時溫度" value={`${weather.currentTemp}°C`} />
                <Stat label="降雨機率" value={`${weather.rainChance}%`} />
                <Stat label="最高溫" value={`${weather.maxTemp}°C`} />
                <Stat label="最低溫" value={`${weather.minTemp}°C`} />
              </div>
            </>
          ) : (
            <ErrorNote text={errors?.weather ?? "無資料"} />
          )}
          <AiNote text={summary?.weatherSummary} />
        </Card>

        {/* 市場：台指期夜盤、費半、道瓊（舊紀錄沒有 market，改顯示台積電） */}
        {market || !stock ? (
          <Card title="台指期夜盤・美股" icon="📊">
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              <MarketRow
                name="台指期夜盤"
                sub={
                  market?.night
                    ? `${nightSessionLabel(market.night)}・${market.night.volume.toLocaleString()} 口`
                    : undefined
                }
                quote={market?.night}
                error={errors?.night}
              />
              <MarketRow
                name="費城半導體"
                sub={market?.sox && `美國 ${md(market.sox.date)}`}
                quote={market?.sox}
                error={errors?.sox}
              />
              <MarketRow
                name="道瓊工業"
                sub={market?.dji && `美國 ${md(market.dji.date)}`}
                quote={market?.dji}
                error={errors?.dji}
              />
            </div>
            <AiNote text={summary?.marketSummary} />
          </Card>
        ) : (
        <Card
          title={`${stock?.name ?? "台積電"} ${stock?.stockNo ?? "2330"}・${stock?.date ?? ""}`}
          icon="📈"
        >
          {stock ? (
            <>
              <p className="mb-3 flex items-baseline gap-3">
                <span className="text-3xl font-bold tabular-nums">
                  {stock.close.toLocaleString()}
                </span>
                <span className={`font-semibold tabular-nums ${changeColor}`}>
                  {up ? "▲" : down ? "▼" : ""}
                  {Math.abs(stock.change).toLocaleString()}（{pct.toFixed(2)}%）
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="開盤" value={stock.open.toLocaleString()} />
                <Stat
                  label="成交量（張）"
                  value={Math.round(stock.volume / 1000).toLocaleString()}
                />
                <Stat label="最高" value={stock.high.toLocaleString()} />
                <Stat label="最低" value={stock.low.toLocaleString()} />
              </div>
            </>
          ) : (
            <ErrorNote text={errors?.stock ?? "無資料"} />
          )}
          <AiNote text={summary?.stockSummary} />
        </Card>
        )}
      </div>

      {/* 新聞：AI 挑選的重點；AI 失敗時退回顯示最新標題 */}
      <Card title="今日重點新聞" icon="📰">
        {summary?.newsSummary?.length ? (
          <ul className="space-y-5">
            {summary.newsSummary.map((n) => (
              <li key={n.link}>
                <NewsTags
                  tags={[n.scope, n.category, news.find((x) => x.link === n.link)?.source]}
                />
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                >
                  {n.title}
                </a>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {n.summary}
                </p>
              </li>
            ))}
          </ul>
        ) : news.length ? (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {news.slice(0, 8).map((n) => (
              <li key={n.link} className="flex items-start justify-between gap-4 py-2.5">
                <a href={n.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {n.title}
                </a>
                <span className="shrink-0 text-sm tabular-nums text-zinc-500">
                  {fmtTime(n.pubDate)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ErrorNote text={errors?.news ?? "沒有新聞"} />
        )}
      </Card>
    </div>
  );
}
