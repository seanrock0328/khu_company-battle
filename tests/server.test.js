// 팀 서버(worker/worker.js)와 서버를 부르는 게임 코드(js/ai.js, js/account.js) 확인
// 실행: node --test (tests 폴더의 테스트를 모두 실행, 추가 라이브러리 불필요)
// 진짜 팀 서버·ChatKHU는 절대 부르지 않습니다. 저장소(KV)와 ChatKHU는 이 파일 안의 가짜로 대신합니다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const GAME_ORIGIN = "https://seanrock0328.github.io";

// ===== 가짜 저장소(KV)와 서버 불러오기 =====

function memoryKV() {
  const data = new Map();
  const kv = {
    data, writes: 0,
    async get(key, type) {
      const e = data.get(key);
      if (!e) return null;
      return type === "json" ? JSON.parse(e.value) : e.value;
    },
    async put(key, value, opts = {}) { kv.writes++; data.set(key, { value: String(value), metadata: opts.metadata }); },
    async delete(key) { data.delete(key); },
    async list({ prefix = "" } = {}) {
      const keys = [...data.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name, metadata: data.get(name).metadata }));
      return { keys, list_complete: true };
    }
  };
  return kv;
}

function loadWorker(options = {}) {
  const chatkhu = []; // 가짜 ChatKHU가 받은 요청
  const context = vm.createContext({
    Response, Request, Headers, URL, TextEncoder, crypto, btoa, atob, console, AbortController,
    setTimeout: options.setTimeout || setTimeout, clearTimeout,
    fetch: options.fetch || (async (url, init) => {
      chatkhu.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
    })
  });
  vm.runInContext(read("worker/worker.js").replace("export default {", "globalThis.worker = {"), context);
  const clock = { now: Date.now() };
  context.__clock = clock;
  vm.runInContext("Date.now = () => __clock.now;", context);
  const env = { CHATKHU_KEY: "test-key", BOARD: memoryKV(), ADMIN_CODE: "admin-test", ...options.env };
  const call = async (pathname, { method = "POST", body, origin = GAME_ORIGIN, ip = "10.0.0.1", headers = {} } = {}) => {
    const init = { method, headers: { Origin: origin, "CF-Connecting-IP": ip, ...headers } };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers["Content-Type"] = "application/json";
      init.headers["Content-Length"] ??= String(Buffer.byteLength(init.body));
    }
    const res = await context.worker.fetch(new Request("https://worker.test" + pathname, init), env);
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return { call, env, clock, chatkhu, get: name => vm.runInContext(name, context) };
}

// 실제 게임 요청문 3개를 js/ai.js로 만들기 (모든 칸 최대 길이, 직원 6명, 이전 분기 3개, JSON에서 두 배가 되는 따옴표로 채움)
function realPrompts() {
  const saved = new Map();
  const context = vm.createContext({
    URL, URLSearchParams, location: new URL("file:///C:/game/index.html"),
    localStorage: { getItem: k => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: k => saved.delete(k) }
  });
  for (const file of ["data/presets.js", "js/game.js", "js/ai.js"]) vm.runInContext(read(file), context);
  return vm.runInContext(`
    var rep = n => '"'.repeat(n);
    var c = game.company;
    c.player = rep(PLAYER_MAX); c.name = rep(NAME_MAX); c.detail = rep(DETAIL_MAX); c.motto = rep(MOTTO_MAX);
    c.industry = rep(20); c.emoji = "🐟"; c.funding = "parents";
    makeCandidates(c);
    for (const r of HIRE_RANKS) { const x = c.candidates[r][0]; x.name = rep(6); c.hires[r] = x.id; }
    c.events = EVENT_ORDER.map(type => ({ type, title: rep(15), text: rep(50) }));
    var prompts = { industry: buildIndustryRequest(), founding: buildFoundingRequest() };
    for (let i = 0; i < 3; i++) c.rounds[i] = { order: rep(ORDER_MAX), result: { score: 100, news: rep(60) }, choice: "praise" };
    game.round = 3; c.rounds[3] = { order: rep(ORDER_MAX), result: null, investment: 1000, power: "dinner" };
    prompts.event = buildEventRequest();
    prompts;
  `, context);
}

// ===== 1. 횟수 제한을 용도별로 =====

test("서버: 전시장처럼 IP 하나에서 20판을 해도 AI·손님 시작·순위 기록이 서로 막지 않는다", async () => {
  const w = loadWorker();
  const prompt = w.get("GAME_HEADER") + "\n테스트";
  for (let game = 1; game <= 20; game++) {
    const guest = await w.call("/guest", { body: { name: `손님${game}` } });
    assert.equal(guest.status, 200, `${game}판째 손님 시작`);
    for (let k = 0; k < 7; k++) {
      assert.equal((await w.call("/", { body: { prompt } })).status, 200, `${game}판째 AI ${k + 1}번째`);
    }
    const entry = { profit: 1000, at: w.clock.now - game, industry: "붕어빵" };
    assert.equal((await w.call("/board", { body: { token: guest.data.token, entry } })).status, 200, `${game}판째 순위 기록`);
  }
  // AI는 10분에 150번에서 멈추지만, 가입·손님 시작은 따로 세서 계속 됩니다
  for (let k = 0; k < 10; k++) assert.equal((await w.call("/", { body: { prompt } })).status, 200);
  assert.equal((await w.call("/", { body: { prompt } })).status, 429);
  assert.equal((await w.call("/guest", { body: { name: "늦은손님" } })).status, 200);
  assert.equal((await w.call("/signup", { body: { id: "새사장", password: "1234" } })).status, 200);
  // 다른 IP는 영향 없음, 10분 지나면 다시 됨
  assert.equal((await w.call("/", { body: { prompt }, ip: "10.0.0.2" })).status, 200);
  w.clock.now += 10 * 60 * 1000;
  assert.equal((await w.call("/", { body: { prompt } })).status, 200);
});

test("서버: 가입·로그인·손님 시작은 같은 IP 10분에 60번까지이고, 그래도 불러오기·순위 기록은 된다", async () => {
  const w = loadWorker();
  const first = await w.call("/guest", { body: { name: "손님0" } });
  for (let k = 1; k < 60; k++) assert.equal((await w.call("/guest", { body: { name: `손님${k}` } })).status, 200, `${k + 1}번째`);
  assert.equal((await w.call("/guest", { body: { name: "손님초과" } })).status, 429);
  assert.equal((await w.call("/login", { body: { id: "없는사람", password: "1234" } })).status, 429);
  assert.equal((await w.call("/me", { body: { token: first.data.token } })).status, 200);
  assert.equal((await w.call("/board", { body: { token: first.data.token, entry: { profit: 1, at: w.clock.now, industry: "AI" } } })).status, 200);
  assert.equal((await w.call("/guest", { body: { name: "다른망손님" }, ip: "10.0.0.9" })).status, 200);
});

test("서버: 관리자 코드는 같은 IP 10분에 10번까지만 시도하고, 일반 순위 기록은 막지 않는다", async () => {
  const w = loadWorker();
  for (let k = 0; k < 10; k++) assert.equal((await w.call("/reset", { body: { code: `틀림${k}` } })).status, 403);
  assert.equal((await w.call("/reset", { body: { code: "admin-test" } })).status, 429);
  const guest = await w.call("/guest", { body: { name: "손님" } });
  assert.equal((await w.call("/board", { body: { token: guest.data.token, entry: { profit: 1, at: w.clock.now, industry: "AI" } } })).status, 200);
});

// ===== 2. 이어하기 저장 보호 =====

test("서버: 이어하기 저장은 같은 사람이 2초에 한 번, 10분에 60번까지이고 너무 큰 요청은 읽지 않는다", async () => {
  const w = loadWorker();
  const { data } = await w.call("/signup", { body: { id: "사장님", password: "1234" } });
  const save = () => w.call("/save", { body: { token: data.token, save: { v: 2, phase: "news", company: {} } } });
  const writesBefore = w.env.BOARD.writes;
  assert.equal((await save()).status, 200);
  w.clock.now += 500;
  assert.equal((await save()).status, 429, "0.5초 만에 또 저장");
  for (let k = 0; k < 59; k++) {
    w.clock.now += 2000;
    assert.equal((await save()).status, 200, `${k + 2}번째 저장`);
  }
  w.clock.now += 2000;
  assert.equal((await save()).status, 429, "10분 안에 61번째 저장");
  assert.equal(w.env.BOARD.writes - writesBefore, 60, "저장소에 실제로 쓴 횟수");
  // 저장은 따로 세므로 불러오기(/me)는 막히지 않음
  assert.equal((await w.call("/me", { body: { token: data.token } })).status, 200);
  w.clock.now += 10 * 60 * 1000;
  assert.equal((await save()).status, 200, "10분 뒤");
  // 크기를 먼저 보고 거절 (본문을 읽거나 저장하지 않음)
  const big = await w.call("/save", { body: { token: data.token, save: { company: {} } }, headers: { "Content-Length": String(300 * 1024) } });
  assert.equal(big.status, 413);
});

test("서버: 실제 한 판 저장(약 20KB)은 크기 제한에 걸리지 않는다", async () => {
  const w = loadWorker();
  const { data } = await w.call("/signup", { body: { id: "큰저장", password: "1234" } });
  const company = { candidates: Array.from({ length: 18 }, (_, i) => ({ id: i, intro: "가".repeat(120), answer: "가".repeat(160) })),
    rounds: Array.from({ length: 4 }, () => ({ result: { news: "가".repeat(240), up: Array(6).fill({ say: "가".repeat(60) }) } })) };
  const res = await w.call("/save", { body: { token: data.token, save: { v: 2, phase: "settled", company } } });
  assert.equal(res.status, 200);
});

// ===== 3. 크레딧 보호 =====

test("서버: 파일로 연 화면(Origin null)은 ALLOW_FILE_ORIGIN=1일 때만 받는다", async () => {
  const off = loadWorker();
  const prompt = off.get("GAME_HEADER") + "\n테스트";
  assert.equal((await off.call("/", { method: "OPTIONS", origin: "null" })).status, 403);
  assert.equal((await off.call("/", { body: { prompt }, origin: "null" })).status, 403);
  assert.equal((await off.call("/guest", { body: { name: "파일손님" }, origin: "null" })).status, 403);
  assert.equal(off.chatkhu.length, 0);
  assert.equal((await off.call("/", { method: "GET" })).data.fileTest, false);
  assert.equal((await off.call("/", { body: { prompt } })).status, 200, "게임 주소는 그대로 됨");

  const on = loadWorker({ env: { ALLOW_FILE_ORIGIN: "1" } });
  const pre = await on.call("/", { method: "OPTIONS", origin: "null" });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("Access-Control-Allow-Origin"), "null");
  assert.equal((await on.call("/", { body: { prompt }, origin: "null" })).status, 200);
  const info = (await on.call("/", { method: "GET" })).data;
  assert.equal(info.fileTest, true);
  assert.equal(info.version, 8);
});

test("서버: 실제 게임 요청문은 통과하고, 머리말로 시작하지 않거나 너무 긴 요청은 ChatKHU에 보내지 않는다", async () => {
  const w = loadWorker();
  const header = w.get("GAME_HEADER");
  const max = w.get("MAX_PROMPT_CHARS");
  const prompts = realPrompts();
  for (const [name, prompt] of Object.entries(prompts)) {
    assert.ok(prompt.startsWith(header), `${name} 요청문이 머리말로 시작 (ai.js 첫 줄을 바꿨으면 worker.js GAME_HEADER도)`);
    assert.ok(prompt.length * 2 <= max, `${name} 요청문 ${prompt.length}자: 제한 ${max}자의 절반 이하`);
    assert.equal((await w.call("/", { body: { prompt } })).status, 200, name);
  }
  assert.equal(w.chatkhu.length, 3);
  assert.equal(w.chatkhu[2].messages[0].content, prompts.event);
  for (const prompt of ["아무 질문. " + header, "10자 사원 주식회사 아무 질문", header + "가".repeat(max)]) {
    assert.equal((await w.call("/", { body: { prompt } })).status, 400);
  }
  assert.match((await w.call("/", { body: { prompt: header + "가".repeat(max) } })).data.error, /너무 길어요/);
  assert.equal(w.chatkhu.length, 3, "막힌 요청은 ChatKHU로 가지 않음");
});

// ===== 4. 시간 제한 =====

// 응답하지 않다가, 끊으면(abort) 그때 실패하는 가짜 fetch
const hangingFetch = async (url, init = {}) => new Promise((_, reject) => {
  init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
});

test("서버: ChatKHU가 답하지 않으면 끊고 504와 안내 문구를 돌려준다", async () => {
  const w = loadWorker({ fetch: hangingFetch, setTimeout: fn => setTimeout(fn, 0) });
  const res = await w.call("/", { body: { prompt: w.get("GAME_HEADER") } });
  assert.equal(res.status, 504);
  assert.match(res.data.error, /100초 동안 답하지 않았어요/);
});

// js/ai.js + js/account.js를 가짜 화면·가짜 시계·가짜 서버로 불러오기
function loadClient({ token = "a".repeat(64), respond }) {
  const saved = new Map(token ? [["company_battle_token", token], ["company_battle_id", "사장님"]] : []);
  const clock = { now: 1_800_000_000_000 };
  const timers = [];
  let timerId = 0;
  const requests = [];
  const state = { screen: "" };
  const elements = new Map();
  const listeners = {};
  const element = id => ({
    hidden: false, disabled: false, value: "", textContent: "", innerHTML: "", style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: cls => cls === "active" && state.screen === id },
    addEventListener() {}, appendChild() {}, prepend() {}, before() {}, insertAdjacentHTML() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null
  });
  const document = {
    head: element(), createElement: () => element(), querySelector: () => element(), querySelectorAll: () => [],
    getElementById: id => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); },
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn)
  };
  const context = vm.createContext({
    URL, URLSearchParams, Response, AbortController, DOMException, console, document, __state: state, __clock: clock,
    localStorage: { getItem: k => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: k => saved.delete(k) },
    setTimeout: (fn, ms = 0) => { timers.push({ id: ++timerId, at: clock.now + ms, fn }); return timerId; },
    clearTimeout: id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    fetch: async (url, init = {}) => {
      const p = new URL(url).pathname;
      const body = init.body ? JSON.parse(init.body) : null;
      requests.push({ path: p, at: clock.now, body });
      const r = await respond(p, body, init);
      return new Response(JSON.stringify(r.data ?? {}), { status: r.status ?? 200 });
    }
  });
  vm.runInContext(`
    globalThis.window = globalThis;
    Date.now = () => __clock.now;
    var game = { company: { player: "", rounds: [] }, round: 0 };
    var nextCandidateId = 1, interviewIndex = 0, ROUNDS = 4, lastPlacedAt = null, log = [], aiToken = 0;
    function toast(m) { log.push(m); }
    function esc(s) { return String(s ?? ""); }
    function showScreen(id) { __state.screen = id; }
    function startGame() { log.push("startGame"); }
    function renderFound() {}
    function renderFoundingNews() {}
    function startRound() { game.company.rounds[game.round] ||= { order: "", result: null, investment: 0 }; }
    function showRoundResult() { return Promise.resolve(); }
    function settleRound(c, choice) { c.rounds[game.round].choice = choice; return {}; }
    function renderFinal() {}
    function recordResult() { return null; }
  `, context);
  vm.runInContext(read("js/ai.js"), context);
  vm.runInContext(read("js/account.js"), context);
  // main.js의 checkpointGame과 같은 신호 (면접·지시 쓰기·투자·필살기 저장)
  const emit = phase => (listeners["company-state-change"] || []).forEach(fn => fn({ detail: { phase } }));
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
  const advance = async ms => {
    const end = clock.now + ms;
    await settle();
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > end) break;
      const t = timers.shift();
      clock.now = Math.max(clock.now, t.at);
      t.fn();
      await settle();
    }
    clock.now = end;
    await settle();
  };
  return { run: code => vm.runInContext(code, context), requests, advance, state, emit, saved };
}

const okServer = p => p === "/" ? { data: { accounts: true } } : p === "/me" ? { data: { id: "사장님", save: null } } : { data: { ok: true } };
const saves = c => c.requests.filter(r => r.path === "/save");

test("게임: 회원 한 판의 서버 저장은 모아서 보내고(3초 이상 간격), 중요한 순간은 빠짐없이, 지우기는 마지막에 간다", async () => {
  const c = loadClient({ respond: okServer });
  await c.advance(0);
  assert.ok(c.requests.some(r => r.path === "/me"));
  c.emit("funding");                         // 봉투 개봉
  await c.advance(20000);                    // 창업 AI
  c.run("renderFoundingNews()");             // 면접 전
  await c.advance(5000);
  for (let k = 0; k < 18; k++) { c.emit("interview"); await c.advance(3000); } // 질문·채용 18번
  c.run("game.round = 0; startRound()");     // 1분기 시작 (채용 결과)
  for (let round = 0; round < 4; round++) {
    for (let k = 0; k < 5; k++) { c.emit("event"); await c.advance(1500); } // 지시 쓰기·투자 고르기
    c.emit("event");                         // 지시 내리기
    await c.advance(15000);                  // AI
    c.run("showRoundResult()");              // 보고 받음
    await c.advance(round === 1 ? 500 : 6000); // 2분기에는 0.5초 만에 바로 칭찬
    c.run('settleRound(game.company, "praise")');
    if (round < 3) {
      await c.advance(round === 1 ? 500 : 4000);
      c.run("game.round++; startRound()");   // 다음 분기 시작: 따로 저장 안 함
      if (round === 1) await c.advance(4000);
    }
  }
  await c.advance(5000);
  c.run("renderFinal()");
  await c.advance(60000);

  const list = saves(c);
  for (let k = 1; k < list.length; k++) assert.ok(list[k].at - list[k - 1].at >= 3000, `${k}번째 저장 간격`);
  const urgent = list.map(r => r.body.save.phase).filter(p => p !== "interview" && p !== "event");
  assert.deepEqual(urgent, ["funding", "news", "choice", "settled", "choice", "settled", "choice", "settled", "choice", "settled"]);
  assert.ok(list.length <= 20, `한 판 서버 저장 ${list.length}번`);
  // 2분기 결산 저장은 늦게 갔지만, 그사이 시작한 3분기는 들어 있지 않음 (저장한 순간 모습 그대로)
  const late = list.filter(r => r.body.save.phase === "settled")[1].body.save;
  assert.equal(late.round, 1);
  assert.equal(late.company.rounds.length, 2);
  assert.equal(late.company.rounds[1].choice, "praise");
  assert.equal(c.requests.at(-1).path, "/save-clear", "지우기가 마지막");
  // 이 기기 저장은 매번 바로 (결산 뒤에는 지움)
  assert.equal(c.saved.has("company_battle_checkpoint_사장님"), false);
});

test("게임: 면접·지시 쓰기처럼 잦은 저장은 손을 멈춘 뒤 한 번, 계속 바뀌어도 1분에 한 번만 서버로 보낸다", async () => {
  const c = loadClient({ respond: okServer });
  await c.advance(0);
  for (let k = 0; k < 10; k++) { c.emit("interview"); await c.advance(2000); }
  assert.equal(saves(c).length, 0, "바뀌는 중에는 기다림");
  assert.ok(c.saved.has("company_battle_checkpoint_사장님"), "이 기기에는 바로 저장");
  await c.advance(20000);
  assert.equal(saves(c).length, 1, "멈추고 20초 뒤 한 번");
  for (let k = 0; k < 36; k++) { c.emit("event"); await c.advance(5000); } // 3분 동안 5초마다 바뀜
  await c.advance(30000);
  assert.ok(saves(c).length <= 1 + 4, `3분 동안 ${saves(c).length - 1}번`);
});

test("게임: 저장된 게임을 못 불러오면 다시 시도 화면을 보여 주고, 저장·지우기를 하지 않아 하던 게임을 덮어쓰지 않는다", async () => {
  const c = loadClient({ respond: p => p === "/me" ? { status: 500, data: { error: "계정 처리 중 오류가 났어요." } } : okServer(p) });
  await c.advance(0);
  assert.equal(c.state.screen, "screen-resume");
  c.emit("funding");
  c.run('renderFoundingNews(); game.round = 0; startRound(); showRoundResult(); settleRound(game.company, "dig"); renderFinal();');
  await c.advance(90000);
  assert.equal(c.requests.filter(r => r.path === "/save" || r.path === "/save-clear").length, 0);
  assert.equal(c.saved.has("company_battle_checkpoint_사장님"), false, "이 기기의 하던 게임 기록도 덮어쓰지 않음");
  assert.match(c.run("log.join('|')"), /불러오지 못했어요/);
});

test("게임: 처음 서버 확인이 8초 안에 안 되면 로그인 없이 시작한다", async () => {
  const c = loadClient({ respond: (p, body, init) => p === "/" ? hangingFetch(p, init) : okServer(p) });
  await c.advance(0);
  assert.equal(c.state.screen, "screen-auth-wait");
  await c.advance(8000);
  assert.match(c.run("log.join('|')"), /startGame\|팀 서버가 답하지 않아 로그인 없이 시작해요/);
  assert.equal(c.requests.filter(r => r.path === "/me").length, 0);
});

test("게임: 팀 서버가 AI 답을 110초 동안 안 주면 다시 시도·붙여넣기·연습 모드 안내로 끝난다", async () => {
  const c = loadClient({ token: "", respond: (p, body, init) => p === "/" && body ? hangingFetch(p, init) : okServer(p) });
  await c.advance(0);
  let error = null;
  c.run('callTeamServer("테스트")').catch(e => { error = e; });
  await c.advance(109000);
  assert.equal(error, null, "110초 전에는 기다림");
  await c.advance(1000);
  assert.match(error.message, /110초 동안 답하지 않았어요/);
  assert.match(error.message, /연습 모드/);
});
