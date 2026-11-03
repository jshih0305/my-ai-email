import { after } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/cron-auth";
import { sendBrief } from "@/lib/send-brief";

// 背景工作（抓資料 + OpenAI + 寄信）最多允許跑 60 秒（部署平台支援時生效）
export const maxDuration = 60;

// GET/POST /api/cron/send-brief（給 cron-job.org 排程呼叫）
// Header：Authorization: Bearer <CRON_SECRET>
//
// 產生晨報約需 20~30 秒，cron-job.org 等待上限約 30 秒，
// 所以先立刻回 202，再用 after() 在背景產生並寄出，結果會存進 MongoDB。
async function handler(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  after(async () => {
    try {
      const r = await sendBrief();
      console.log("[cron] send-brief", r.ok ? "成功" : "失敗", JSON.stringify(r));
    } catch (e) {
      console.error("[cron] send-brief 例外：", e);
    }
  });

  return Response.json({ ok: true, accepted: true, message: "已排入背景寄送" }, { status: 202 });
}

export { handler as GET, handler as POST };
