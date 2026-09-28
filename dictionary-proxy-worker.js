// Cloudflare Worker: forwards requests from the GitHub Pages app to NIKL.
// Deploy this as a Worker, then paste its workers.dev URL into the page.
const ALLOWED_ORIGIN = "https://wlgns9784-spec.github.io";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    if (origin !== ALLOWED_ORIGIN) return new Response("Origin not allowed", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "POST") return json({ error: "POST only" }, 405, origin);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "요청 본문을 읽을 수 없습니다." }, 400, origin); }

    const key = String(body.key || "").trim();
    const dictionary = body.dictionary === "stdict" ? "stdict" : body.dictionary === "opendict" ? "opendict" : "";
    const q = String(body.q || "").trim();
    const start = Math.max(1, Math.min(1000, Number.parseInt(body.start, 10) || 1));
    const num = Math.max(10, Math.min(100, Number.parseInt(body.num, 10) || 100));
    if (!key || !dictionary || !q) return json({ error: "인증키, 사전, 검색어를 확인해 주세요." }, 400, origin);

    const host = dictionary === "stdict" ? "stdict.korean.go.kr" : "opendict.korean.go.kr";
    const params = new URLSearchParams({ key, q, req_type: "json", part: "word", sort: "dict", start: String(start), num: String(num) });
    const apiPath = dictionary === "stdict" ? "/api/search.do" : "/api/search";
    const upstreamUrl = `https://${host}${apiPath}?${params.toString()}`;

    try {
      const upstream = await fetch(upstreamUrl, { headers: { "Accept": "application/json" } });
      const payload = await upstream.text();
      let parsed;
      try { parsed = JSON.parse(payload); }
      catch {
        const detail = payload.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
        return json({ error: `사전 API에서 JSON이 아닌 응답을 받았습니다 (${upstream.status})${detail ? `: ${detail}` : ""}.`, detail }, 502, origin);
      }
      return json(parsed, upstream.ok ? 200 : upstream.status, origin);
    } catch {
      return json({ error: "국립국어원 API에 연결하지 못했습니다. Worker 로그와 API 상태를 확인해 주세요." }, 502, origin);
    }
  },
};

