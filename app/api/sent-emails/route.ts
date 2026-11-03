import { connection, type NextRequest } from "next/server";
import { listSentEmails } from "@/lib/sent-emails";

// GET /api/sent-emails?limit=20&before=<ISO 時間>
// 讀取 MongoDB 中的寄信紀錄，新到舊排序
export async function GET(request: NextRequest) {
  await connection();

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 20, 1), 50);
  const before = sp.get("before") ?? undefined;

  try {
    return Response.json(await listSentEmails({ limit, before }));
  } catch (e) {
    return Response.json(
      { error: `讀取資料庫失敗：${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
