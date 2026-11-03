import { timingSafeEqual } from "node:crypto";

/**
 * 驗證請求是否帶有正確的 CRON_SECRET。
 * 接受 `Authorization: Bearer <CRON_SECRET>`（cron-job.org 可在 Advanced → Headers 設定）。
 */
export function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 沒設定 secret 一律拒絕，避免變成公開寄信

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  // 長度不同直接 false；相同長度用常數時間比較，避免時序攻擊
  return a.length === b.length && timingSafeEqual(a, b);
}

export const unauthorized = () =>
  Response.json({ ok: false, error: "Unauthorized：缺少或錯誤的 CRON_SECRET" }, { status: 401 });
