// 10자 사원 주식회사 · 팀 중간 서버 (Cloudflare Worker)
// 게임은 API 키 없이 이 서버를 부르고, 이 서버가 팀 키로 ChatKHU를 대신 부릅니다.
//
// 설정 (Cloudflare 대시보드 → 이 Worker → Settings → Variables and Secrets)
//   CHATKHU_KEY  (Secret, 필수)  ChatKHU API Gateway 키. 절대 이 코드에 직접 쓰지 마세요!
//   ADMIN_CODE   (Secret, 선택)  공유 순위표 초기화 때 입력하는 관리자 코드
// 공유 순위표·로그인 (선택): Settings → Bindings → KV namespace 를 BOARD 라는 이름으로 연결
//   연결하지 않으면 로그인 없이, 순위표는 지금처럼 각 기기에만 저장됩니다.
//
//   ALLOW_FILE_ORIGIN (Variable, 선택)  팀원이 index.html 파일을 직접 열어 테스트할 때만 1. 전시·심사 때는 지워 두세요.
//
// 크레딧 도둑 방지 장치
//   1. 우리 게임 주소에서 온 요청만 받음 (ALLOWED_ORIGINS)
//   2. 횟수 제한은 용도별로 따로 셉니다. 전시장처럼 여러 명이 IP 하나를 같이 써도 AI를 많이 썼다고 가입까지 막히지 않게.
//      AI: 같은 IP 10분에 150번 (한 판에 기본 6번, 업종 다시 뽑기 포함 최대 7번 → 약 20판)
//      가입·로그인·손님 시작: 같은 IP 10분에 60번 / 불러오기·순위 기록 등: 같은 IP 10분에 150번 / 관리자 코드: 같은 IP 10분에 10번
//      이어하기 저장: 한 사람이 2초에 한 번, 10분에 60번까지
//   3. 정해진 모델만, 출력 길이와 요청 크기 제한 (게임 요청문은 실제로 최대 약 3,500자)
//   4. 우리 게임 요청문(첫 줄 머리말)으로 시작하는 요청만 통과

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
  "http://localhost:8000",
  "http://127.0.0.1:8000"
];
// index.html 파일을 직접 열면 주소가 "null"로 옵니다. 기본은 막고, 팀원 테스트 때만 ALLOW_FILE_ORIGIN = 1 로 엽니다.
function allowedOrigin(origin, env) {
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin === "null" && env.ALLOW_FILE_ORIGIN === "1") return origin;
  return "";
}

const ALLOWED_MODELS = ["gemini-3.8-flash", "claude-sonnet-5-5", "gpt-5.6-terra", "claude-haiku-5-5", "solar-pro4"];
const DEFAULT_MODEL = "gemini-3.8-flash";
// js/ai.js의 요청문 3개(업종·창업·분기)는 모두 이 문장으로 시작합니다. ai.js 첫 줄을 바꾸면 여기도 같이 바꾸고 다시 배포하세요.
// (tests/server.test.js가 ai.js 요청문이 이 머리말로 시작하는지 확인합니다)
const GAME_HEADER = '너는 회사 경영 게임 "10자 사원 주식회사"의 AI 진행자다.';
// 실제 요청문은 직원 6명·모든 칸 최대 길이·이전 분기 3개일 때 약 3,000~3,500자라서 8,000자면 넉넉합니다.
const MAX_PROMPT_CHARS = 8000;
const MAX_TOKENS = 8000;
const MAX_BODY_BYTES = 256 * 1024;      // 요청 하나의 최대 크기 (이어하기 저장은 실제로 약 20KB, 길어도 약 45KB)
const CHATKHU_TIMEOUT_MS = 100 * 1000;  // ChatKHU가 100초 넘게 답이 없으면 끊고 알려 줌 (게임은 110초까지 기다림)

const RATE_WINDOW_MS = 10 * 60 * 1000;  // 아래 횟수는 모두 10분 동안
const CHAT_LIMIT = 150;     // AI: 같은 IP (한 판 최대 7번 → 약 20판. 전시장에서 모자라면 이 숫자만 올리기)
const START_LIMIT = 60;     // 가입·로그인·손님 시작: 같은 IP (저장소 쓰기가 생기는 요청)
const ACCOUNT_LIMIT = 150;  // 불러오기·로그아웃·저장 지우기·순위 기록: 같은 IP
const ADMIN_LIMIT = 10;     // 관리자 코드(초기화·기록 옮기기): 같은 IP (코드 맞히기 방지)
const SAVE_LIMIT = 60;      // 이어하기 저장: 같은 사람 (게임이 모아서 보내 보통 한 판에 약 11~20번)
const SAVE_GAP_MS = 2000;   // 이어하기 저장: 같은 사람은 2초에 한 번까지 (KV는 같은 키에 1초에 한 번만 쓸 수 있음)
const START_PATHS = ["/signup", "/login", "/guest"];

const hits = new Map(); // "용도:IP" 또는 "save:아이디" → 최근 요청 시각들 (서버가 재시작되면 초기화되는 간단한 제한)

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

// key 하나당 10분에 limit번까지. minGapMs를 주면 바로 전 요청과 그만큼 떨어져 있어야 합니다.
function rateLimited(key, now, limit, minGapMs = 0) {
  const recent = (hits.get(key) || []).filter(t => now - t < RATE_WINDOW_MS);
  const tooSoon = minGapMs > 0 && recent.length > 0 && now - recent[recent.length - 1] < minGapMs;
  if (recent.length >= limit || tooSoon) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear(); // 메모리 보호
  return false;
}

// ===== 공유 순위표와 대결 업종 (Cloudflare KV, 바인딩 이름 BOARD) =====
// 기록 하나를 키 하나에 저장해서, 여러 명이 동시에 저장해도 서로 덮어쓰지 않습니다.
// 기록 내용은 키의 metadata에 넣어 list 한 번으로 전부 읽습니다.

const MAX_ENTRIES = 1000;
// 지금 1년(4분기) 통장 규칙으로 실제 나올 수 있는 누적 순이익 범위 (단위 만원, js/game.js 숫자로 계산)
//   최고: 4분기 모두 성과 100점 매출(100점 x 100) + 매 분기 투자 성공(+600) = 42,400 (급여는 0으로 넉넉하게)
//   최저: 4분기 모두 영업 중단(−1억 x 4) = −40,000 (영업 중단 손실이 정상 분기 최악 손실 9,400보다 크게 정해져 있음)
// game.js의 규칙 숫자를 바꾸면 여기도 같이 바꾸세요. tests/game.test.js가 둘이 맞는지 확인합니다.
const MAX_PROFIT = 4 * (100 * 100 + 1600 - 1000);
const MIN_PROFIT = -4 * 10000;
let boardCache = { at: 0, entries: null };     // 무료 사용량 아끼려고 10초 동안 기억
const BOARD_CACHE_MS = 10 * 1000;

function cleanText(v, max) {
  return String(v ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}

function cleanEntry(e) {
  if (!e || typeof e !== "object") return null;
  const profit = Math.round(Number(e.profit));
  const at = Math.round(Number(e.at));
  if (!Number.isFinite(profit) || profit > MAX_PROFIT || profit < MIN_PROFIT) return null;
  if (!Number.isFinite(at) || at < 1700000000000 || at > Date.now() + 60000) return null;
  const entry = {
    player: cleanText(e.player, 14), name: cleanText(e.name, 12), emoji: cleanText(e.emoji, 4),
    industry: cleanText(e.industry, 20), news: cleanText(e.news, 80), model: cleanText(e.model, 30),
    profit, at
  };
  if (!entry.player || !entry.industry) return null;
  return entry;
}

// 관리자가 지운 기록 표시: 초기화 시각(resetAt)과 하나씩 지운 기록 목록(removed: "닉네임|at").
// KV 목록(list)은 지운 뒤에도 1분쯤 옛 기록을 보여 줄 수 있고, 다른 기기가 열어 둔 화면이 옛 기록을 다시 올릴 수 있어서
// 키를 지우는 것과 별도로 이 표시로 걸러 냅니다. (보여 줄 때, 새로 올릴 때 모두)
const RESET_GRACE_MS = 60 * 1000; // 기기 시계가 조금 늦어도 초기화 직후 새 판이 막히지 않게
const MAX_REMOVED = 1000;
const entrySig = e => `${String(e.player || "").toLowerCase()}|${Math.round(Number(e.at))}`;
async function boardMeta(env) {
  const m = await env.BOARD.get("board-meta", "json").catch(() => null);
  return { resetAt: Number(m?.resetAt) || 0, removed: Array.isArray(m?.removed) ? m.removed : [] };
}
function isHidden(entry, meta) {
  // rx = 서버가 기록을 받은 시각(서버 시계라 기기 시계와 상관없음). 예전 기록은 rx가 없어 at으로 판단
  return (entry.rx || entry.at) <= meta.resetAt || meta.removed.includes(entrySig(entry));
}
function adminOk(env, body) {
  return !!env.ADMIN_CODE && cleanText(body.code, 100) === env.ADMIN_CODE;
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
    const meta = await boardMeta(env);
    const entries = (await readEntries(env)).filter(e => !isHidden(e, meta));
    return reply(200, { season, entries, resetAt: meta.resetAt, removed: meta.removed }, allowed);
  }
  if (request.method !== "POST") return reply(405, { error: "지원하지 않는 요청이에요." }, allowed);
  if (!allowed) return reply(403, { error: "허용되지 않은 주소에서 온 요청이에요." }, "");
  const body = await request.json().catch(() => null);
  if (!body) return reply(400, { error: "요청 형식이 잘못됐어요." }, allowed);

  if (path === "/board") {
    // 순위 기록은 로그인한 아이디로만 (남의 닉네임으로 기록하지 못하게)
    const owner = displayName(await sessionUser(env, body.token)); // 손님은 "닉네임(손님)"
    if (!owner) return reply(401, { error: "로그인해야 순위에 기록돼요." }, allowed);
    const entry = cleanEntry({ ...(body.entry || {}), player: owner });
    if (!entry) return reply(400, { error: "기록 형식이 잘못됐어요." }, allowed);
    // 관리자가 지운 기록이나 초기화 전 기록을 다른 기기가 다시 올리면 조용히 무시 (기기에서 다시 올리기를 멈추도록 ok)
    const meta = await boardMeta(env);
    if (meta.removed.includes(entrySig(entry)) || entry.at <= meta.resetAt - RESET_GRACE_MS) return reply(200, { ok: true, ignored: true }, allowed);
    // 같은 판(gameId)은 같은 키: 이어하기로 결산 화면을 다시 열어도 순위표에는 한 번만 올라갑니다
    const gameId = String(body.entry?.gameId ?? "");
    const key = /^[0-9a-z]{6,24}$/.test(gameId)
      ? `e:g:${normId(owner)}:${gameId}`
      : `e:${entry.at}:${Math.random().toString(36).slice(2, 8)}`;
    if (key.startsWith("e:g:") && await env.BOARD.get(key) !== null) return reply(200, { ok: true, duplicate: true }, allowed);
    entry.rx = Date.now();
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
  // 관리자: 기기에만 남아 있던 기록을 공유 순위표로 옮기기 (이름 그대로, 같은 기록은 한 번만)
  if (path === "/import") {
    if (!env.ADMIN_CODE || cleanText(body.code, 100) !== env.ADMIN_CODE) {
      return reply(403, { error: "관리자 코드가 틀렸어요." }, allowed);
    }
    const incoming = Array.isArray(body.entries) ? body.entries.slice(0, 200) : [];
    const have = new Set((await readEntries(env)).map(e => e.at));
    const meta = await boardMeta(env);
    let added = 0;
    for (const raw of incoming) {
      const entry = cleanEntry(raw);
      if (!entry || have.has(entry.at) || meta.removed.includes(entrySig(entry))) continue;
      entry.rx = Date.now();
      await env.BOARD.put(`e:${entry.at}:${Math.random().toString(36).slice(2, 8)}`, "1", { metadata: entry });
      if (boardCache.entries) boardCache.entries.push(entry);
      have.add(entry.at);
      added++;
    }
    return reply(200, { ok: true, added, skipped: incoming.length - added }, allowed);
  }
  // 관리자 코드 확인 (순위표의 관리자 모드 켜기)
  if (path === "/admin") {
    if (!adminOk(env, body)) return reply(403, { error: "관리자 코드가 틀렸어요." }, allowed);
    return reply(200, { ok: true }, allowed);
  }
  // 관리자: 기록 하나 지우기 (닉네임 + 기록 시각으로 찾음)
  if (path === "/delete") {
    if (!adminOk(env, body)) return reply(403, { error: "관리자 코드가 틀렸어요." }, allowed);
    const target = { player: cleanText(body.player, 14), at: Math.round(Number(body.at)) };
    if (!target.player || !Number.isFinite(target.at)) return reply(400, { error: "지울 기록을 찾지 못했어요." }, allowed);
    const sig = entrySig(target);
    const meta = await boardMeta(env);
    if (!meta.removed.includes(sig)) meta.removed = meta.removed.concat(sig).slice(-MAX_REMOVED);
    await env.BOARD.put("board-meta", JSON.stringify(meta));
    let deleted = 0, cursor;
    do {
      const page = await env.BOARD.list({ prefix: "e:", cursor, limit: 1000 });
      const hits = page.keys.filter(k => k.metadata && entrySig(k.metadata) === sig);
      await Promise.all(hits.map(k => env.BOARD.delete(k.name)));
      deleted += hits.length;
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    if (boardCache.entries) boardCache.entries = boardCache.entries.filter(e => entrySig(e) !== sig);
    return reply(200, { ok: true, deleted }, allowed);
  }
  if (path === "/reset") {
    if (!env.ADMIN_CODE || cleanText(body.code, 100) !== env.ADMIN_CODE) {
      return reply(403, { error: "관리자 코드가 틀렸어요." }, allowed);
    }
    // 초기화 시각을 먼저 기록: 키 삭제가 퍼지기 전에도, 다른 기기가 옛 기록을 다시 올려도 순위표에 안 보입니다
    await env.BOARD.put("board-meta", JSON.stringify({ resetAt: Date.now(), removed: [] }));
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

const ACCOUNT_PATHS = ["/signup", "/login", "/guest", "/logout", "/me", "/save", "/save-clear"];
const GUEST_PREFIX = "guest:";
const GUEST_TTL = 60 * 60 * 24; // 손님 닉네임과 로그인은 하루 동안

// 세션 값: 회원은 아이디, 손님은 "guest:닉네임"
function displayName(sessionValue) {
  if (!sessionValue) return null;
  return sessionValue.startsWith(GUEST_PREFIX) ? `${sessionValue.slice(GUEST_PREFIX.length)}(손님)` : sessionValue;
}

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

async function newSession(env, id, ttl = SESSION_TTL) {
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, "0")).join("");
  await env.BOARD.put(`s:${token}`, id, { expirationTtl: ttl });
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

  // 손님: 닉네임만으로 바로 시작 (가입한 아이디와 같은 이름, 오늘 다른 손님이 쓴 이름은 불가)
  if (path === "/guest") {
    const name = String(body.name ?? "").trim();
    if (!ID_RE.test(name)) return reply(400, { error: "닉네임은 2~10자, 한글·영문·숫자·_만 쓸 수 있어요." }, allowed);
    if (await env.BOARD.get(`u:${normId(name)}`)) return reply(409, { error: "가입한 사장님이 쓰는 이름이에요. 다른 닉네임을 골라 주세요." }, allowed);
    if (await env.BOARD.get(`gn:${normId(name)}`)) return reply(409, { error: "오늘 다른 손님이 쓴 닉네임이에요. 다른 닉네임을 골라 주세요." }, allowed);
    await env.BOARD.put(`gn:${normId(name)}`, "1", { expirationTtl: GUEST_TTL });
    return reply(200, { id: name, guest: true, token: await newSession(env, GUEST_PREFIX + name, GUEST_TTL) }, allowed);
  }

  // 아래는 로그인한 사람만
  const session = await sessionUser(env, body.token);
  if (!session) return reply(401, { error: "로그인이 풀렸어요. 다시 로그인해 주세요." }, allowed);
  const guest = session.startsWith(GUEST_PREFIX);
  const id = guest ? session.slice(GUEST_PREFIX.length) : session;
  const saveKey = `g:${normId(id)}`;

  if (path === "/logout") {
    await env.BOARD.delete(`s:${body.token}`);
    return reply(200, { ok: true }, allowed);
  }
  // 손님은 이어하기 저장을 하지 않습니다
  if (guest && (path === "/save" || path === "/save-clear")) return reply(200, { ok: true, skipped: true }, allowed);
  if (guest && path === "/me") return reply(200, { id, guest: true, save: null }, allowed);

  if (path === "/me") {
    return reply(200, { id, save: await env.BOARD.get(saveKey, "json") }, allowed);
  }
  if (path === "/save") {
    // 무료 저장 한도(하루 1,000번) 보호: 같은 사람은 2초에 한 번, 10분에 60번까지
    if (rateLimited(`save:${saveKey}`, Date.now(), SAVE_LIMIT, SAVE_GAP_MS)) {
      return reply(429, { error: "저장이 너무 잦아요. 잠시 뒤 다시 저장할게요." }, allowed);
    }
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
    const allowed = allowedOrigin(origin, env);

    if (request.method === "OPTIONS") {
      return allowed ? new Response(null, { status: 204, headers: corsHeaders(allowed) }) : new Response(null, { status: 403 });
    }
    // 너무 큰 요청은 읽지 않고 거절 (브라우저는 보낼 때 크기를 함께 알려 줌)
    if (request.method === "POST" && Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) {
      return reply(413, { error: "보낸 내용이 너무 커요." }, allowed);
    }
    const url = new URL(request.url);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (ACCOUNT_PATHS.includes(url.pathname)) {
      if (!env.BOARD) return reply(501, { error: "로그인 저장소가 설정되지 않았어요." }, allowed);
      if (request.method !== "POST") return reply(405, { error: "POST만 받아요." }, allowed);
      if (!allowed) return reply(403, { error: "허용되지 않은 주소에서 온 요청이에요." }, "");
      // 가입·로그인·손님 시작은 따로, 나머지는 같은 통에서 셉니다. 이어하기 저장(/save)은 사람마다 따로 셉니다 (handleAccount 안)
      const limited = START_PATHS.includes(url.pathname)
        ? rateLimited(`start:${ip}`, Date.now(), START_LIMIT)
        : url.pathname !== "/save" && rateLimited(`acct:${ip}`, Date.now(), ACCOUNT_LIMIT);
      if (limited) return reply(429, { error: "잠깐 쉬었다 해 주세요." }, allowed);
      const body = await request.json().catch(() => null);
      if (!body) return reply(400, { error: "요청 형식이 잘못됐어요." }, allowed);
      try {
        return await handleAccount(url.pathname, body, env, allowed);
      } catch (e) {
        return reply(500, { error: "계정 처리 중 오류가 났어요." }, allowed);
      }
    }

    if (["/board", "/season", "/reset", "/import", "/delete", "/admin"].includes(url.pathname)) {
      if (request.method === "POST") {
        const admin = ["/reset", "/import", "/delete", "/admin"].includes(url.pathname);
        let limited;
        if (admin) {
          // 관리자 코드는 "틀린 시도"만 셉니다 (10분에 10번 틀리면 그 IP는 맞는 코드도 잠시 막힘).
          // 맞는 코드로 기록을 여러 개 지우는 것은 막지 않습니다.
          const now = Date.now();
          const fails = (hits.get(`admin:${ip}`) || []).filter(t => now - t < RATE_WINDOW_MS).length;
          const body = await request.clone().json().catch(() => ({}));
          limited = fails >= ADMIN_LIMIT || (!adminOk(env, body || {}) && rateLimited(`admin:${ip}`, now, ADMIN_LIMIT));
        } else {
          limited = rateLimited(`acct:${ip}`, Date.now(), ACCOUNT_LIMIT);
        }
        if (limited) return reply(429, { error: "잠깐 쉬었다 해 주세요." }, allowed);
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
      return reply(200, { ok: true, service: "10자 사원 주식회사 중간 서버", keySet: !!env.CHATKHU_KEY, board: !!env.BOARD, accounts: !!env.BOARD, guests: !!env.BOARD, adminCode: !!env.ADMIN_CODE, fileTest: env.ALLOW_FILE_ORIGIN === "1", boardAdmin: true, version: 9 }, allowed);
    }
    if (request.method !== "POST") return reply(405, { error: "POST만 받아요." }, allowed);
    if (!allowed) return reply(403, { error: "허용되지 않은 주소에서 온 요청이에요." }, "");
    if (!env.CHATKHU_KEY) return reply(500, { error: "서버에 CHATKHU_KEY가 설정되지 않았어요." }, allowed);

    if (rateLimited(`chat:${ip}`, Date.now(), CHAT_LIMIT)) {
      return reply(429, { error: "잠깐 쉬었다 해 주세요. 10분 뒤 다시 할 수 있어요." }, allowed);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return reply(400, { error: "요청 형식이 잘못됐어요." }, allowed);
    }
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    if (prompt.length > MAX_PROMPT_CHARS) {
      return reply(400, { error: "요청문이 너무 길어요. 아래 '복사·붙여넣기로 하기'로 진행해 주세요." }, allowed);
    }
    if (!prompt.startsWith(GAME_HEADER)) {
      return reply(400, { error: "게임 요청문이 아니에요." }, allowed);
    }
    const model = ALLOWED_MODELS.includes(body.model) ? body.model : DEFAULT_MODEL;

    // ChatKHU가 너무 오래 답하지 않으면 끊고, 게임이 다시 시도·붙여넣기·연습 모드를 고를 수 있게 알려 줍니다
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHATKHU_TIMEOUT_MS);
    let res, raw;
    try {
      res = await fetch(CHATKHU_URL, {
        method: "POST",
        headers: chatkhuHeaders(env.CHATKHU_KEY),
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: MAX_TOKENS }),
        signal: controller.signal
      });
      raw = await res.text();
    } catch (e) {
      if (e && e.name === "AbortError") {
        return reply(504, { error: `ChatKHU가 ${CHATKHU_TIMEOUT_MS / 1000}초 동안 답하지 않았어요. 다시 시도하거나 다른 모델을 골라 주세요.` }, allowed);
      }
      return reply(502, { error: "중간 서버가 ChatKHU에 접속하지 못했어요." }, allowed);
    } finally {
      clearTimeout(timer);
    }

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
