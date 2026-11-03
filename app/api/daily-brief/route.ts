import { connection } from "next/server";
import { buildDailyBrief } from "@/lib/daily-brief";

// GET /api/daily-brief
export async function GET() {
  // 每次請求都即時執行，不被預先渲染/快取
  await connection();
  return Response.json(await buildDailyBrief());
}
