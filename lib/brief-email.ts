import type { DailyBrief } from "@/lib/daily-brief";

// 所有外部文字都要跳脫，避免破壞 HTML
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// 只允許 http(s) 連結
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? esc(u) : "#");

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang TC','Microsoft JhengHei',Arial,sans-serif";

function section(title: string, body: string) {
  return `
  <tr><td style="padding:0 24px 20px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:12px">
      <tr><td style="padding:20px">
        <h2 style="margin:0 0 12px;font-size:17px;color:#18181b">${title}</h2>
        ${body}
      </td></tr>
    </table>
  </td></tr>`;
}

const aiNote = (t?: string) =>
  t
    ? `<p style="margin:12px 0 0;padding:12px;background:#eef2ff;border-radius:8px;font-size:14px;line-height:1.7;color:#312e81"><b>AI 摘要：</b>${esc(t)}</p>`
    : "";

const errNote = (t?: string) =>
  `<p style="margin:0;color:#dc2626;font-size:14px">取得失敗：${esc(t ?? "無資料")}</p>`;

function statRow(cells: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells
    .map(
      ([label, value]) => `
    <td width="${Math.floor(100 / cells.length)}%" style="padding:4px">
      <div style="background:#f4f4f5;border-radius:8px;padding:10px">
        <div style="font-size:12px;color:#71717a">${esc(label)}</div>
        <div style="font-size:16px;font-weight:600;color:#18181b;margin-top:2px">${esc(value)}</div>
      </div>
    </td>`,
    )
    .join("")}</tr></table>`;
}

export function renderBriefEmail(b: DailyBrief): { subject: string; html: string; text: string } {
  const { weather: w, stock: s, news, summary, errors } = b;

  // ----- 鼓勵 -----
  const encouragement = `
  <tr><td style="padding:0 24px 20px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border-radius:12px">
      <tr><td style="padding:20px">
        <h2 style="margin:0 0 8px;font-size:17px;color:#78350f">💪 今天給你的話</h2>
        <p style="margin:0;font-size:16px;line-height:1.8;color:#451a03">${esc(
          summary?.encouragement ?? "今天也要好好照顧自己！",
        )}</p>
      </td></tr>
    </table>
  </td></tr>`;

  // ----- 天氣 -----
  const weatherBody = w
    ? `<p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b">${esc(w.description)}</p>
       ${statRow([
         ["目前", `${w.currentTemp}°C`],
         ["最高", `${w.maxTemp}°C`],
         ["最低", `${w.minTemp}°C`],
         ["降雨", `${w.rainChance}%`],
       ])}${aiNote(summary?.weatherSummary)}`
    : errNote(errors?.weather);

  // ----- 股價（台股：漲紅跌綠）-----
  let stockBody = errNote(errors?.stock);
  if (s) {
    const color = s.change > 0 ? "#dc2626" : s.change < 0 ? "#16a34a" : "#18181b";
    const arrow = s.change > 0 ? "▲" : s.change < 0 ? "▼" : "";
    const prev = s.close - s.change;
    const pct = prev ? ((s.change / prev) * 100).toFixed(2) : "0.00";
    stockBody = `
      <p style="margin:0 0 8px">
        <span style="font-size:26px;font-weight:700;color:#18181b">${s.close.toLocaleString()}</span>
        <span style="font-size:15px;font-weight:600;color:${color};margin-left:8px">${arrow}${Math.abs(
          s.change,
        ).toLocaleString()}（${pct}%）</span>
      </p>
      ${statRow([
        ["開盤", s.open.toLocaleString()],
        ["最高", s.high.toLocaleString()],
        ["最低", s.low.toLocaleString()],
        ["成交量(張)", Math.round(s.volume / 1000).toLocaleString()],
      ])}${aiNote(summary?.stockSummary)}`;
  }

  // ----- AI 精選新聞 -----
  const picks = summary?.newsSummary?.length
    ? section(
        "🤖 AI 精選科技新聞",
        summary.newsSummary
          .map(
            (n) => `
        <div style="margin-bottom:14px">
          <a href="${safeUrl(n.link)}" style="font-size:15px;font-weight:600;color:#4338ca;text-decoration:none">${esc(n.title)}</a>
          <p style="margin:4px 0 0;font-size:14px;line-height:1.7;color:#52525b">${esc(n.summary)}</p>
        </div>`,
          )
          .join(""),
      )
    : "";

  // ----- 全部新聞 -----
  const newsBody = news.length
    ? `<ul style="margin:0;padding-left:18px">${news
        .map(
          (n) =>
            `<li style="margin-bottom:8px;font-size:14px;line-height:1.6"><a href="${safeUrl(
              n.link,
            )}" style="color:#18181b">${esc(n.title)}</a></li>`,
        )
        .join("")}</ul>`
    : errNote(errors?.news ?? "今天沒有新聞");

  const html = `<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>每日晨報 ${esc(b.date)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:${FONT}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px">
        <tr><td style="padding:28px 24px 20px">
          <h1 style="margin:0;font-size:24px;color:#18181b">☀️ 每日晨報</h1>
          <p style="margin:4px 0 0;font-size:14px;color:#71717a">${esc(b.date)}</p>
        </td></tr>
        ${encouragement}
        ${section(`🌤️ 今日天氣・${esc(w?.location ?? "台北")}`, weatherBody)}
        ${section(`📈 台積電 2330・${esc(s?.date ?? "")}`, stockBody)}
        ${picks}
        ${section("📰 今日科技新聞", newsBody)}
        <tr><td style="padding:8px 24px 28px;font-size:12px;color:#a1a1aa;text-align:center">
          由 my-ai-email 自動產生・股價資訊僅供參考，非投資建議
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // 純文字版本（不支援 HTML 的郵件軟體會顯示這個）
  const text = [
    `每日晨報 ${b.date}`,
    "",
    `【今天給你的話】${summary?.encouragement ?? ""}`,
    "",
    w
      ? `【天氣・${w.location}】${w.description}，${w.minTemp}~${w.maxTemp}°C，降雨 ${w.rainChance}%`
      : "【天氣】取得失敗",
    s ? `【台積電 ${s.date}】收盤 ${s.close}，漲跌 ${s.change}` : "【台積電】取得失敗",
    "",
    "【科技新聞】",
    ...news.map((n) => `- ${n.title} ${n.link}`),
  ].join("\n");

  return { subject: `☀️ 每日晨報 ${b.date}`, html, text };
}
