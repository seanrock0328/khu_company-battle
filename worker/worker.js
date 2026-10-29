// 10자 사원 주식회사 · 팀 중간 서버 (Cloudflare Worker)
// 게임은 API 키 없이 이 서버를 부르고, 이 서버가 팀 키로 ChatKHU를 대신 부릅니다.
//
// 설정 (Cloudflare 대시보드 → 이 Worker → Settings → Variables and Secrets)
//   CHATKHU_KEY  (Secret, 필수)  ChatKHU API Gateway 키. 절대 이 코드에 직접 쓰지 마세요!
//   ADMIN_CODE   (Secret, 선택)  공유 순위표 초기화 때 입력하는 관리자 코드
// 공유 순위표·로그인 (선택): Settings → Bindings → KV namespace 를 BOARD 라는 이름으로 연결
//   연결하지 않으면 로그인 없이, 순위표는 지금처럼 각 기기에만 저장됩니다.
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

// ===== 공유 순위표와 대결 업종 (Cloudflare KV, 바인딩 이름 BOARD) =====
// 기록 하나를 키 하나에 저장해서, 여러 명이 동시에 저장해도 서로 덮어쓰지 않습니다.
// 기록 내용은 키의 metadata에 넣어 list 한 번으로 전부 읽습니다.

const MAX_ENTRIES = 1000;
let boardCache = { at: 0, entries: null };     // 무료 사용량 아끼려고 10초 동안 기억
const BOARD_CACHE_MS = 10 * 1000;

function cleanText(v, max) {
  return String(v ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}

function cleanEntry(e) {
  if (!e || typeof e !== "object") return null;
  const profit = Math.round(Number(e.profit));
  const at = Math.round(Number(e.at));
  if (!Number.isFinite(profit) || Math.abs(profit) > 10000000) return null;
  if (!Number.isFinite(at) || at < 1700000000000 || at > Date.now() + 60000) return null;
  const entry = {
    player: cleanText(e.player, 10), name: cleanText(e.name, 12), emoji: cleanText(e.emoji, 4),
    industry: cleanText(e.industry, 20), news: cleanText(e.news, 80), model: cleanText(e.model, 30),
    profit, at
  };
  if (!entry.player || !entry.industry) return null;
  return entry;
}

async function readEntries(env) {
  if (boardCache.entries && Date.now() - boardCache.at < BOARD_CACHE_MS) return boardCache.entries;
  const entries = [];
  let cursor;
  do {
    const page = await env.BOARD.list({ prefix: "e:", cursor, limit: 1000 });
    for (const k of page.keys) if (k.metadata) entries.push(k.metadata);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor && entries.length < MAX_ENTRIES);
  boardCache = { at: Date.now(), entries };
  return entries;
}

async function handleBoard(request, env, url, allowed) {
  if (!env.BOARD) return reply(501, { error: "공유 순위표가 설정되지 않았어요." }, allowed);
  const path = url.pathname;

  if (request.method === "GET" && path === "/board") {
    const season = await env.BOARD.get("season", "json");
    return reply(200, { season, entries: await readEntries(env) }, allowed);
  }
  if (request.method !== "POST") return reply(405, { error: "지원하지 않는 요청이에요." }, allowed);
  if (!allowed) return reply(403, { error: "허용되지 않은 주소에서 온 요청이에요." }, "");
  const body = await request.json().catch(() => null);
  if (!body) return reply(400, { error: "요청 형식이 잘못됐어요." }, allowed);

  if (path === "/board") {
    // 순위 기록은 로그인한 아이디로만 (남의 닉네임으로 기록하지 못하게)
    const owner = await sessionUser(env, body.token);
    if (!owner) return reply(401, { error: "로그인해야 순위에 기록돼요." }, allowed);
    const entry = cleanEntry({ ...(body.entry || {}), player: owner });
    if (!entry) return reply(400, { error: "기록 형식이 잘못됐어요." }, allowed);
    const key = `e:${entry.at}:${Math.random().toString(36).slice(2, 8)}`;
    await env.BOARD.put(key, "1", { metadata: entry });
    if (boardCache.entries) boardCache.entries.push(entry);
    return reply(200, { ok: true }, allowed);
  }
  if (path === "/season") {
    // 대결 업종은 처음 정한 사람 것을 모두가 씁니다
    const current = await env.BOARD.get("season", "json");
    if (current) return reply(200, { season: current }, allowed);
    const season = { industry: cleanText(body.industry, 20), emoji: cleanText(body.emoji, 4) || "🏢" };
    if (!season.industry) return reply(400, { error: "업종이 비어 있어요." }, allowed);
    await env.BOARD.put("season", JSON.stringify(season));
    return reply(200, { season }, allowed);
  }
  if (path === "/reset") {
    if (!env.ADMIN_CODE || cleanText(body.code, 100) !== env.ADMIN_CODE) {
      return reply(403, { error: "관리자 코드가 틀렸어요." }, allowed);
    }
    let cursor, removed = 0;
    do {
      const page = await env.BOARD.list({ prefix: "e:", cursor, limit: 1000 });
      await Promise.all(page.keys.map(k => env.BOARD.delete(k.name)));
      removed += page.keys.length;
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    await env.BOARD.delete("season");
    boardCache = { at: 0, entries: null };
    return reply(200, { ok: true, removed }, allowed);
  }
  return reply(404, { error: "없는 주소예요." }, allowed);
}

const ACCOUNT_PATHS = ["/signup", "/login", "/logout", "/me", "/save", "/save-clear"];

// ===== 계정: 회원가입, 로그인, 게임 이어하기 저장 =====
// 아이디는 대소문자 구분 없이 하나만 (닉네임 중복 방지). 비밀번호는 PBKDF2로 해시해서 저장하고 원문은 남기지 않습니다.
// KV 키: u:<아이디 소문자> 계정, s:<토큰> 로그인 세션(30일), g:<아이디 소문자> 이어하기 저장

const ID_RE = /^[0-9A-Za-z가-힣_]{2,10}$/;
const SESSION_TTL = 60 * 60 * 24 * 30;
const MAX_SAVE_BYTES = 200000;
const PBKDF2_ITERATIONS = 100000;

function normId(id) {
  return String(id ?? "").trim().toLowerCase();
}

function toB64(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function hashPassword(password, saltB64) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256);
  return toB64(bits);
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function newSession(env, id) {
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, "0")).join("");
  await env.BOARD.put(`s:${token}`, id, { expirationTtl: SESSION_TTL });
  return token;
}

// 토큰으로 로그인한 아이디 찾기 (없으면 null)
async function sessionUser(env, token) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return null;
  return env.BOARD.get(`s:${token}`);
}

async function handleAccount(path, body, env, allowed) {
  if (path === "/signup" || path === "/login") {
    const id = String(body.id ?? "").trim();
    const password = String(body.password ?? "");
    if (!ID_RE.test(id)) return reply(400, { error: "아이디는 2~10자, 한글·영문·숫자·_만 쓸 수 있어요." }, allowed);
    if (password.length < 4 || password.length > 64) return reply(400, { error: "비밀번호는 4~64자로 해 주세요." }, allowed);
    const key = `u:${normId(id)}`;
    const user = await env.BOARD.get(key, "json");

    if (path === "/signup") {
      if (user) return reply(409, { error: "이미 쓰고 있는 아이디예요. 다른 아이디를 골라 주세요." }, allowed);
      const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
      await env.BOARD.put(key, JSON.stringify({ id, salt, hash: await hashPassword(password, salt), created: Date.now() }));
      return reply(200, { id, token: await newSession(env, id) }, allowed);
    }
    if (!user || !sameText(await hashPassword(password, user.salt), user.hash)) {
      return reply(401, { error: "아이디 또는 비밀번호가 틀렸어요." }, allowed);
    }
    return reply(200, { id: user.id, token: await newSession(env, user.id) }, allowed);
  }

  // 아래는 로그인한 사람만
  const id = await sessionUser(env, body.token);
  if (!id) return reply(401, { error: "로그인이 풀렸어요. 다시 로그인해 주세요." }, allowed);
  const saveKey = `g:${normId(id)}`;

  if (path === "/logout") {
    await env.BOARD.delete(`s:${body.token}`);
    return reply(200, { ok: true }, allowed);
  }
  if (path === "/me") {
    return reply(200, { id, save: await env.BOARD.get(saveKey, "json") }, allowed);
  }
  if (path === "/save") {
    const text = JSON.stringify(body.save ?? null);
    if (!body.save || typeof body.save !== "object") return reply(400, { error: "저장할 내용이 없어요." }, allowed);
    if (text.length > MAX_SAVE_BYTES) return reply(413, { error: "저장할 내용이 너무 커요." }, allowed);
    await env.BOARD.put(saveKey, text);
    return reply(200, { ok: true }, allowed);
  }
  if (path === "/save-clear") {
    await env.BOARD.delete(saveKey);
    return reply(200, { ok: true }, allowed);
  }
  return reply(404, { error: "없는 주소예요." }, allowed);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "";

    if (request.method === "OPTIONS") {
      return allowed ? new Response(null, { status: 204, headers: corsHeaders(allowed) }) : new Response(null, { status: 403 });
    }
    const url = new URL(request.url);
    if (ACCOUNT_PATHS.includes(url.pathname)) {
      if (!env.BOARD) return reply(501, { error: "로그인 저장소가 설정되지 않았어요." }, allowed);
      if (request.method !== "POST") return reply(405, { error: "POST만 받아요." }, allowed);
      if (!allowed) return reply(403, { error: "허용되지 않은 주소에서 온 요청이에요." }, "");
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      if (url.pathname !== "/save" && rateLimited(ip, Date.now())) return reply(429, { error: "잠깐 쉬었다 해 주세요." }, allowed);
      const body = await request.json().catch(() => null);
      if (!body) return reply(400, { error: "요청 형식이 잘못됐어요." }, allowed);
      try {
        return await handleAccount(url.pathname, body, env, allowed);
      } catch (e) {
        return reply(500, { error: "계정 처리 중 오류가 났어요." }, allowed);
      }
    }

    if (["/board", "/season", "/reset"].includes(url.pathname)) {
      if (request.method === "POST") {
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        if (rateLimited(ip, Date.now())) return reply(429, { error: "잠깐 쉬었다 해 주세요." }, allowed);
      }
      try {
        return await handleBoard(request, env, url, allowed);
      } catch (e) {
        return reply(500, { error: "순위표 처리 중 오류가 났어요." }, allowed);
      }
    }

    if (request.method === "GET") {
      // 진단: 주소 뒤에 /diag 를 붙여 열면 이 서버에서 ChatKHU에 접속되는지 확인합니다 (크레딧 안 씀)
      if (url.pathname === "/diag") {
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
      return reply(200, { ok: true, service: "10자 사원 주식회사 중간 서버", keySet: !!env.CHATKHU_KEY, board: !!env.BOARD, accounts: !!env.BOARD, adminCode: !!env.ADMIN_CODE, version: 4 }, allowed);
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
