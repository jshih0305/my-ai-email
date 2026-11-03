import { isAuthorized, unauthorized } from "@/lib/cron-auth";
import { isBrief, sendBrief } from "@/lib/send-brief";

// POST /api/send-brief（前端按鈕用，同步等寄信結果）
// Header：Authorization: Bearer <CRON_SECRET>
// body 可帶前端已載入的晨報（避免重新呼叫 OpenAI）；沒帶就在伺服器重新產生
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = await request.json().catch(() => null);
    const result = await sendBrief(isBrief(body?.brief) ? body.brief : undefined);
    return Response.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return Response.json(
      { ok: false, error: `寄信失敗：${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
