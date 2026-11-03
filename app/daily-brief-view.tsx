"use client";

import { useCallback, useEffect, useState } from "react";
import type { NewsItem, StockDay, Summary, Weather } from "@/lib/daily-brief";

type Brief = {
  date: string;
  weather: Weather | null;
  stock: StockDay | null;
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

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

async function getBrief(signal?: AbortSignal): Promise<Brief> {
  const res = await fetch("/api/daily-brief", { cache: "no-store", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function DailyBriefView() {
  const [data, setData] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 拿到結果（或錯誤）後才更新狀態
  const apply = useCallback((p: Promise<Brief>) => {
    return p.then(
      (d) => {
        setData(d);
        setError(null);
        setLoading(false);
      },
      (e) => {
        if (e instanceof DOMException && e.name === "AbortError") return; // 被取消的請求不處理
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    // 開發模式 StrictMode 會執行 effect 兩次；cleanup 時取消第一次的請求
    const ctrl = new AbortController();
    apply(getBrief(ctrl.signal));
    return () => ctrl.abort();
  }, [apply]);

  const load = () => {
    setLoading(true);
    apply(getBrief());
  };

  // ----- 寄信 -----
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // CRON_SECRET 只放在元件記憶體中，不存到瀏覽器儲存空間；重新整理頁面就要重填
  const [secret, setSecret] = useState("");

  const sendEmail = async () => {
    setSending(true);
    setSendMsg(null);
    try {
      const res = await fetch("/api/send-brief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ brief: data }),
      });
      if (res.status === 401) throw new Error("CRON_SECRET 錯誤");
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setSendMsg({
        ok: true,
        text: j.dbError
          ? `已寄出到 ${j.to}，但存入資料庫失敗：${j.dbError}`
          : `已寄出到 ${j.to}，並已存入資料庫`,
      });
    } catch (e) {
      setSendMsg({ ok: false, text: `寄信失敗：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSending(false);
    }
  };

  const { weather, stock, news = [], summary, errors } = data ?? ({} as Partial<Brief>);
  const up = (stock?.change ?? 0) > 0;
  const down = (stock?.change ?? 0) < 0;
  // 台股慣例：漲紅跌綠
  const changeColor = up ? "text-red-600" : down ? "text-green-600" : "";
  const prevClose = stock ? stock.close - stock.change : 0;
  const pct = stock && prevClose ? (stock.change / prevClose) * 100 : 0;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">每日晨報</h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">{data?.date ?? "　"}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="輸入 CRON_SECRET"
              aria-label="CRON_SECRET"
              autoComplete="off"
              className="w-44 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              onClick={sendEmail}
              disabled={loading || sending || !data || !secret}
              className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {sending ? "寄送中…" : "✉️ 寄到信箱"}
            </button>
            <button
              onClick={load}
              disabled={loading || sending}
              className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {loading ? "載入中…" : "重新整理"}
            </button>
          </div>
          {sendMsg && (
            <p
              role="status"
              className={`text-sm ${sendMsg.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
            >
              {sendMsg.text}
            </p>
          )}
        </div>
      </header>

      {error && (
        <p className="mb-6 rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-950/50 dark:text-red-300">
          API 呼叫失敗：{error}
        </p>
      )}

      {loading && !data ? (
        <div className="grid gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900"
            />
          ))}
          <p className="text-center text-sm text-zinc-500">
            正在抓取天氣、股價、新聞並請 AI 統整，約需 10～30 秒…
          </p>
        </div>
      ) : data ? (
        <div className={`grid gap-6 ${loading ? "opacity-60" : ""}`}>
          {/* 鼓勵的話 */}
          <section className="rounded-2xl bg-gradient-to-br from-amber-100 to-rose-100 p-6 dark:from-amber-900/40 dark:to-rose-900/40">
            <h2 className="mb-2 text-lg font-semibold">💪 今天給你的話</h2>
            {summary?.encouragement ? (
              <p className="text-lg leading-8">{summary.encouragement}</p>
            ) : (
              <ErrorNote text={errors?.openai ?? "沒有產生內容"} />
            )}
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            {/* 天氣 */}
            <Card title={`今日天氣・${weather?.location ?? "台北"}`} icon="🌤️">
              {weather ? (
                <>
                  <p className="mb-3 text-2xl font-semibold">{weather.description}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="目前溫度" value={`${weather.currentTemp}°C`} />
                    <Stat label="降雨機率" value={`${weather.rainChance}%`} />
                    <Stat label="最高溫" value={`${weather.maxTemp}°C`} />
                    <Stat label="最低溫" value={`${weather.minTemp}°C`} />
                  </div>
                </>
              ) : (
                <ErrorNote text={errors?.weather} />
              )}
              <AiNote text={summary?.weatherSummary} />
            </Card>

            {/* 股價 */}
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
                    <Stat label="成交量（張）" value={Math.round(stock.volume / 1000).toLocaleString()} />
                    <Stat label="最高" value={stock.high.toLocaleString()} />
                    <Stat label="最低" value={stock.low.toLocaleString()} />
                  </div>
                </>
              ) : (
                <ErrorNote text={errors?.stock} />
              )}
              <AiNote text={summary?.stockSummary} />
            </Card>
          </div>

          {/* AI 精選新聞 */}
          {summary?.newsSummary?.length ? (
            <Card title="AI 精選科技新聞" icon="🤖">
              <ul className="space-y-4">
                {summary.newsSummary.map((n) => (
                  <li key={n.link}>
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
            </Card>
          ) : null}

          {/* 全部新聞 */}
          <Card title="今日科技新聞（RSS）" icon="📰">
            {news.length ? (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {news.map((n) => (
                  <li key={n.link} className="flex items-start justify-between gap-4 py-2.5">
                    <a
                      href={n.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {n.title}
                    </a>
                    <span className="shrink-0 text-sm tabular-nums text-zinc-500">
                      {fmtTime(n.pubDate)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ErrorNote text={errors?.news ?? "今天沒有新聞"} />
            )}
          </Card>
        </div>
      ) : null}
    </main>
  );
}
