import { Resend } from "resend";
import { buildDailyBrief, type DailyBrief } from "@/lib/daily-brief";
import { renderBriefEmail } from "@/lib/brief-email";
import { connectDB } from "@/lib/mongodb";
import { SentEmailModel } from "@/models/SentEmail";

// Resend 預設寄件人（未驗證網域時使用），只能寄給 Resend 帳號本人的信箱
const FROM = "每日晨報 <onboarding@resend.dev>";
const TO = "onlysin0305@gmail.com";

export function isBrief(v: unknown): v is DailyBrief {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as DailyBrief).date === "string" &&
    Array.isArray((v as DailyBrief).news)
  );
}

export type SendResult = {
  ok: boolean;
  to: string;
  id?: string;
  error?: string;
  savedId?: string;
  dbError?: string;
};

/** 把這次寄信結果存到 MongoDB；存檔失敗只回報，不影響寄信結果 */
async function saveRecord(
  brief: DailyBrief,
  subject: string,
  result: { resendId?: string; error?: string },
): Promise<{ savedId?: string; dbError?: string }> {
  try {
    await connectDB();
    const doc = await SentEmailModel.create({
      from: FROM,
      to: TO,
      subject,
      status: result.error ? "failed" : "sent",
      resendId: result.resendId,
      error: result.error,
      briefDate: brief.date,
      weather: brief.weather,
      stock: brief.stock,
      news: brief.news,
      summary: brief.summary,
      briefErrors: brief.errors,
    });
    return { savedId: String(doc._id) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[send-brief] 寫入 MongoDB 失敗：", msg);
    return { dbError: msg };
  }
}

/** 寄出晨報並存檔。沒傳 brief 就重新產生（排程用） */
export async function sendBrief(brief?: DailyBrief): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY) return { ok: false, to: TO, error: "缺少 RESEND_API_KEY" };

  const b = brief ?? (await buildDailyBrief());
  const { subject, html, text } = renderBriefEmail(b);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({ from: FROM, to: TO, subject, html, text });

  // 不論寄信成功或失敗都留紀錄
  const db = await saveRecord(b, subject, { resendId: data?.id, error: error?.message });

  return error
    ? { ok: false, to: TO, error: error.message, ...db }
    : { ok: true, to: TO, id: data?.id, ...db };
}
