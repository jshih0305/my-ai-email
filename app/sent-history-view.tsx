"use client";

import { useCallback, useEffect, useState } from "react";
import BriefDetail from "@/app/components/brief-detail";
import type { SentEmailItem, SentEmailPage } from "@/lib/sent-emails";

async function fetchPage(before?: string, signal?: AbortSignal): Promise<SentEmailPage> {
  const qs = new URLSearchParams({ limit: "20" });
  if (before) qs.set("before", before);
  const res = await fetch(`/api/sent-emails?${qs}`, { cache: "no-store", signal });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function SentHistoryView() {
  const [items, setItems] = useState<SentEmailItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 讀第一頁（初次載入、重新整理、寄信後都用這個）
  const applyFirstPage = useCallback((p: Promise<SentEmailPage>) => {
    return p.then(
      (page) => {
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setSelectedId(page.items[0]?.id ?? null);
        setError(null);
        setLoading(false);
      },
      (e) => {
        if (isAbort(e)) return;
        setError(errMsg(e));
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    applyFirstPage(fetchPage(undefined, ctrl.signal));
    return () => ctrl.abort();
  }, [applyFirstPage]);

  const reload = () => {
    setLoading(true);
    applyFirstPage(fetchPage());
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(nextCursor);
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">每日晨報・寄信紀錄</h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">
            {loading ? "　" : `共載入 ${items.length} 筆${nextCursor ? "（還有更多）" : ""}`}
          </p>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {loading ? "載入中…" : "重新整理"}
        </button>
      </header>

      {error && (
        <p className="mb-6 rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      {loading && items.length === 0 ? (
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          <div className="h-80 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
          <div className="h-80 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
        </div>
      ) : items.length === 0 && !error ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
          還沒有寄信紀錄，排程寄出後會顯示在這裡。
        </p>
      ) : (
        <div className={`grid items-start gap-6 md:grid-cols-[280px_1fr] ${loading ? "opacity-60" : ""}`}>
          {/* 左側：紀錄列表 */}
          <nav aria-label="寄信紀錄" className="md:sticky md:top-6">
            <ul className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              {items.map((it) => {
                const active = it.id === selectedId;
                return (
                  <li key={it.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800">
                    <button
                      onClick={() => setSelectedId(it.id)}
                      aria-current={active ? "true" : undefined}
                      className={`w-full px-4 py-3 text-left transition ${
                        active
                          ? "bg-indigo-50 dark:bg-indigo-950/50"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{it.briefDate}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            it.status === "sent"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                          }`}
                        >
                          {it.status === "sent" ? "已寄出" : "失敗"}
                        </span>
                      </div>
                      <div className="mt-0.5 text-sm tabular-nums text-zinc-500">
                        寄出時間 {fmtDateTime(it.createdAt)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {nextCursor && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-3 w-full rounded-full border border-zinc-300 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {loadingMore ? "載入中…" : "載入更多"}
              </button>
            )}
          </nav>

          {/* 右側：選取那一封的內容 */}
          {selected && (
            <article>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">{selected.subject}</h2>
                <p className="text-sm text-zinc-500">寄出時間 {fmtDateTime(selected.createdAt)}</p>
                {selected.status === "failed" && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    寄送失敗：{selected.error}
                  </p>
                )}
              </div>
              <BriefDetail
                brief={{
                  weather: selected.weather,
                  stock: selected.stock,
                  news: selected.news,
                  summary: selected.summary,
                  errors: selected.briefErrors,
                }}
              />
            </article>
          )}
        </div>
      )}
    </main>
  );
}
