const ALLOWED_ORIGIN = "https://teamechogg1412-code.github.io";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": ALLOWED_ORIGIN,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, apikey, content-type"
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const origin = req.headers.get("origin") || "";
  if (origin !== ALLOWED_ORIGIN) return json({ ok: false, error: "origin_not_allowed" }, 403);

  let payload: { ref?: string; page?: string } = {};
  try {
    payload = JSON.parse(await req.text());
  } catch (_) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const ref = String(payload.ref || "").trim().slice(0, 80);
  const page = String(payload.page || "unknown").trim().slice(0, 40);
  if (!ref) return json({ ok: false, error: "ref_required" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID") || "";
  if (!supabaseUrl || !anonKey || !botToken || !chatId) {
    return json({ ok: false, error: "server_not_configured" }, 503);
  }

  // 알림 요청 자체도 등록·유효한 ref만 허용한다.
  const claimRes = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_campaign_link`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ p_ref: ref })
  });
  if (!claimRes.ok) return json({ ok: false, error: "ref_check_failed" }, 403);
  const claim = await claimRes.json();
  const state = String(Array.isArray(claim) ? claim[0] : claim);
  if (state !== "valid") return json({ ok: false, error: "invalid_ref" }, 403);

  const when = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const text = `[배우 계약·독립 시뮬레이터] 방문\n페이지: ${page}\nref: ${ref}\n시간: ${when}`;
  const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  if (!telegramRes.ok) return json({ ok: false, error: "telegram_failed" }, 502);
  return json({ ok: true });
});
