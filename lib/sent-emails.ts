import { connectDB } from "@/lib/mongodb";
import { SentEmailModel } from "@/models/SentEmail";
import type { NewsItem, StockDay, Summary, Weather } from "@/lib/daily-brief";
import type { Market } from "@/lib/market";

// 對外公開的欄位（不含收件人/寄件人信箱與 Resend ID）
export type SentEmailItem = {
  id: string;
  subject: string;
  status: "sent" | "failed";
  error?: string;
  briefDate: string;
  weather: Weather | null;
  market: Market | null;
  stock: StockDay | null; // 舊紀錄才有
  news: NewsItem[];
  summary: Summary | null;
  briefErrors?: Record<string, string>;
  createdAt: string;
};

export type SentEmailPage = {
  items: SentEmailItem[];
  nextCursor: string | null; // 下一頁要帶的 before 參數
};

/** 依寄出時間新到舊讀取；before 為上一頁最後一筆的 createdAt（ISO） */
export async function listSentEmails({
  limit = 20,
  before,
}: { limit?: number; before?: string } = {}): Promise<SentEmailPage> {
  await connectDB();

  const filter: Record<string, unknown> = {};
  if (before) {
    const d = new Date(before);
    if (!Number.isNaN(d.getTime())) filter.createdAt = { $lt: d };
  }

  // 多抓一筆判斷是否還有下一頁
  const docs = await SentEmailModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .select("subject status error briefDate weather market stock news summary briefErrors createdAt")
    .lean();

  const hasMore = docs.length > limit;
  const items: SentEmailItem[] = docs.slice(0, limit).map((d) => ({
    id: String(d._id),
    subject: d.subject,
    status: d.status as "sent" | "failed",
    error: d.error ?? undefined,
    briefDate: d.briefDate,
    weather: (d.weather as Weather) ?? null,
    market: (d.market as Market) ?? null,
    stock: (d.stock as StockDay) ?? null,
    news: (d.news as NewsItem[]) ?? [],
    summary: (d.summary as Summary) ?? null,
    briefErrors: (d.briefErrors as Record<string, string>) ?? undefined,
    createdAt: new Date(d.createdAt).toISOString(),
  }));

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].createdAt : null,
  };
}
