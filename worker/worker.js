// 10자 사원 주식회사 · 팀 중간 서버 (Cloudflare Worker)
// 게임은 API 키 없이 이 서버를 부르고, 이 서버가 팀 키로 ChatKHU를 대신 부릅니다.
//
// 설정 (Cloudflare 대시보드 → 이 Worker → Settings → Variables and Secrets)
//   CHATKHU_KEY  (Secret, 필수)  ChatKHU API Gateway 키. 절대 이 코드에 직접 쓰지 마세요!
//
// 크레딧 도둑 방지 장치
//   1. 우리 게임 주소에서 온 요청만 받음 (ALLOWED_ORIGINS)
//   2. 같은 IP는 10분에 40번까지 (한 판에 5번 부르므로 넉넉함)
//   3. 정해진 모델만, 출력 길이와 요청 크기 제한
//   4. 우리 게임 요청문(표시 문구 포함)만 통과

const CHATKHU_URL = "https://factchat-cloud.mindlogic.ai/v1/gateway/chat/completions/";
const CHATKHU_MODELS_URL = "https://factchat-cloud.mindlogic.ai/v1/gateway/models/";

// ChatKHU 방화벽이 봇으로 보고 막지 않도록 일반적인 요청 머리말을 붙입니다
function chatkhuHeaders(key) {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; khu-company-battle/1.0; +https://seanrock0328.github.io/khu_company-battle/)",
    "Authorization": `Bearer ${key}`
  };
}

const ALLOWED_ORIGINS = [
  "https://seanrock0328.github.io",
  "null",                    // 팀원이 index.html 파일을 직접 열어 테스트할 때
  "http://localhost:8000",
  "http://127.0.0.1:8000"
];

const ALLOWED_MODELS = ["gemini-3.8-flash", "claude-sonnet-5-5", "gpt-5.6-terra", "claude-haiku-5-5", "solar-pro4"];
const DEFAULT_MODEL = "gemini-3.8-flash";
const GAME_MARKER = "10자 사원 주식회사";
const MAX_PROMPT_CHARS = 20000;
const MAX_TOKENS = 8000;
const RATE_LIMIT = 40;               // 같은 IP가
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10분 동안

const hits = new Map(); // IP → 최근 요청 시각들 (서버가 재시작되면 초기화되는 간단한 제한)

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function reply(status, data, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(origin ? corsHeaders(origin) : {}) }
  });
}

function rateLimited(ip, now) {
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // 메모리 보호
  return false;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "";

    if (request.method === "OPTIONS") {
      return allowed ? new Response(null, { status: 204, headers: corsHeaders(allowed) }) : new Response(null, { status: 403 });
    }
    if (request.method === "GET") {
      // 진단: 주소 뒤에 /diag 를 붙여 열면 이 서버에서 ChatKHU에 접속되는지 확인합니다 (크레딧 안 씀)
      if (new URL(request.url).pathname === "/diag") {
        let status = 0, body = "";
        try {
          const r = await fetch(CHATKHU_MODELS_URL, { headers: chatkhuHeaders(env.CHATKHU_KEY || "") });
          status = r.status;
          body = (await r.text()).slice(0, 120);
        } catch (e) {
          body = String(e).slice(0, 120);
        }
        return reply(200, {
          chatkhuStatus: status,
          ok: status === 200,
          hint: status === 200 ? "정상: ChatKHU에 접속됩니다" : status === 401 ? "키 문제: CHATKHU_KEY를 확인하세요" : status === 403 ? "차단: ChatKHU가 이 서버를 막고 있어요" : "기타 문제",
          serverLocation: request.cf ? `${request.cf.colo} (${request.cf.country})` : "",
          bodyStart: body
        }, allowed);
      }
      return reply(200, { ok: true, service: "10자 사원 주식회사 중간 서버", keySet: !!env.CHATKHU_KEY, version: 2 }, allowed);
    }
    if (request.method !== "POST") return reply(405, { error: "POST만 받아요." }, allowed);
    if (!allowed) return reply(403, { error: "허용되지 않은 주소에서 온 요청이에요." }, "");
    if (!env.CHATKHU_KEY) return reply(500, { error: "서버에 CHATKHU_KEY가 설정되지 않았어요." }, allowed);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(ip, Date.now())) {
      return reply(429, { error: "잠깐 쉬었다 해 주세요. 10분 뒤 다시 할 수 있어요." }, allowed);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return reply(400, { error: "요청 형식이 잘못됐어요." }, allowed);
    }
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    if (!prompt || prompt.length > MAX_PROMPT_CHARS || !prompt.includes(GAME_MARKER)) {
      return reply(400, { error: "게임 요청문이 아니에요." }, allowed);
    }
    const model = ALLOWED_MODELS.includes(body.model) ? body.model : DEFAULT_MODEL;

    let res;
    try {
      res = await fetch(CHATKHU_URL, {
        method: "POST",
        headers: chatkhuHeaders(env.CHATKHU_KEY),
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: MAX_TOKENS })
      });
    } catch {
      return reply(502, { error: "중간 서버가 ChatKHU에 접속하지 못했어요." }, allowed);
    }

    const raw = await res.text();
    if (!res.ok) {
      // 키가 응답에 섞여 나갈 일은 없지만, 혹시 몰라 앞부분만 전달
      return reply(res.status, { error: `ChatKHU 오류 (${res.status})`, detail: raw.slice(0, 150) }, allowed);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return reply(502, { error: "ChatKHU 응답을 읽지 못했어요." }, allowed);
    }
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    const text = Array.isArray(content) ? content.map(p => p.text || "").join("") : (content || "");
    if (!text) return reply(502, { error: "ChatKHU 답변이 비어 있어요." }, allowed);
    return reply(200, { text, model }, allowed);
  }
};
