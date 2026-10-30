// 실행: node --test (tests 폴더의 테스트를 모두 실행, 추가 라이브러리 불필요)
// 로그인·이어하기(account.js)와 화면 흐름(main.js)을 가짜 화면과 "이 컴퓨터 안의" 가짜 서버로 돌려 봅니다.
// 가짜 서버는 worker/worker.js를 그대로 쓰고 저장소(KV)만 메모리로 바꿉니다. 실제 팀 서버와 ChatKHU는 절대 부르지 않습니다.
// 시계도 가짜라서, 서버 저장을 모아 보내는 시간(몇 초~1분)을 실제로 기다리지 않고 앞으로 감아서 확인합니다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");
const ORIGIN = "http://localhost:8000";
const clock = { now: Date.now() }; // 게임 화면과 가짜 서버가 같이 쓰는 시계

// ===== 가짜 서버: worker.js + 메모리 KV =====

function memoryKV() {
  const m = new Map();
  return {
    m,
    async get(k, type) {
      const v = m.get(k);
      if (!v) return null;
      return type === "json" ? JSON.parse(v.value) : v.value;
    },
    async put(k, value, opts = {}) { m.set(k, { value: String(value), metadata: opts.metadata }); },
    async delete(k) { m.delete(k); },
    async list({ prefix = "" } = {}) {
      return { keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true };
    }
  };
}

function loadWorker() {
  const sandbox = {
    module: {}, Response, Request, Headers, URL, crypto, btoa, atob, TextEncoder, AbortController, setTimeout, clearTimeout, __clock: clock,
    fetch: () => { throw new Error("테스트에서 바깥 인터넷(ChatKHU)은 부르지 않습니다"); }
  };
  vm.createContext(sandbox);
  vm.runInContext("Date.now = () => __clock.now;", sandbox);
  vm.runInContext(read("worker/worker.js").replace("export default", "module.exports ="), sandbox);
  return sandbox.module.exports;
}

const worker = loadWorker();
let ipCount = 0;

function makeServer() {
  const env = { BOARD: memoryKV() }; // CHATKHU_KEY 없음: ChatKHU 길은 열리지 않음
  const server = { env, fail: {}, calls: [], inflight: 0, ip: `10.0.0.${++ipCount}` };
  server.call = async (pathname, body) => {
    const res = await worker.fetch(new Request("https://test.invalid" + pathname, {
      method: "POST", body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", Origin: ORIGIN, "CF-Connecting-IP": "10.9.9.9" }
    }), env);
    return res.json();
  };
  // 게임 화면이 부르는 fetch
  server.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || "GET";
    if (u.pathname === "/" && method !== "GET") throw new Error("테스트에서 ChatKHU는 부르지 않습니다");
    server.calls.push({ path: u.pathname, body: init.body ? JSON.parse(init.body) : null, at: clock.now });
    server.inflight++;
    try {
      await new Promise(r => setImmediate(r));
      const fail = server.fail[u.pathname];
      if (fail === "network") throw new TypeError("Failed to fetch");
      if (fail) return new Response(JSON.stringify({ error: "잠깐 쉬었다 해 주세요." }), { status: fail });
      return await worker.fetch(new Request(url, {
        method, body: init.body,
        headers: { ...(init.headers || {}), Origin: ORIGIN, "CF-Connecting-IP": server.ip }
      }), server.env);
    } finally {
      server.inflight--;
    }
  };
  server.paths = () => server.calls.map(c => c.path);
  return server;
}

// ===== 가짜 화면 =====

function fakeDocument() {
  const byId = new Map();
  const docListeners = {};
  const doc = { byId, current: "", missingIds: [] };
  const make = id => {
    const classes = new Set();
    const listeners = {};
    const el = {
      id, textContent: "", value: "", hidden: false, disabled: false, innerHTML: "", autocomplete: "",
      dataset: {}, style: {}, children: [],
      classList: {
        add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
        toggle: (c, on = !classes.has(c)) => { if (on) classes.add(c); else classes.delete(c); return on; }
      },
      get className() { return [...classes].join(" "); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); },
      addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
      async dispatch(type, extra = {}) {
        for (const fn of listeners[type] || []) await fn({ type, target: el, preventDefault() {}, ...extra });
      },
      click() { return el.dispatch("click"); },
      prepend: child => attach(el, child), before: child => attach(el, child),
      after: child => attach(el, child), appendChild: child => attach(el, child),
      insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [], closest: () => null,
      scrollIntoView() {}, select() {}, remove() {}
    };
    return el;
  };
  const attach = (parent, child) => { parent.children.push(child); if (child.id) byId.set(child.id, child); };
  doc.getElementById = id => {
    if (doc.missingIds.includes(id)) return null;
    if (!byId.has(id)) byId.set(id, make(id));
    return byId.get(id);
  };
  doc.createElement = () => make("");
  doc.head = make("head");
  doc.addEventListener = (type, fn) => (docListeners[type] ||= []).push(fn);
  doc.dispatchEvent = event => { (docListeners[event.type] || []).forEach(fn => fn(event)); return true; };
  const main = make("main");
  const top = make("top-buttons");
  doc.querySelector = sel => {
    if (sel === "main") return main;
    if (sel === ".top-buttons") return top;
    if (sel === ".screen.active") return doc.current ? doc.getElementById(doc.current) : null;
    return null;
  };
  doc.userBtn = () => top.children[0];
  return doc;
}

// ui.js는 화면 그리기라 빈 함수로 바꾸고, 나머지 파일은 index.html 순서대로 그대로 불러옵니다
function uiStubs() {
  const names = [...read("js/ui.js").matchAll(/^(?:async )?function (\w+)/gm)].map(m => m[1]);
  return names.map(n => `function ${n}() {}`).join("\n") + `
    function showScreen(id) {
      if (document.current) document.getElementById(document.current).classList.remove("active");
      document.current = id;
      document.getElementById(id).classList.add("active");
    }
    function toast(message) { toasts.push(message); }
    function esc(s) { return String(s ?? ""); }
    function companyTitle() { return ""; }
    async function renderReports() {}
    async function renderTruth() {}
    function renderAIScreen() { document.getElementById("ai-request").value = "요청문"; }`;
}

async function boot(server, storage = new Map(), options = {}) {
  const document = fakeDocument();
  const toasts = [];
  const timers = [];
  let timerId = 0;
  const context = vm.createContext({
    URL, URLSearchParams, Response, AbortController, setImmediate, toasts, document, __clock: clock,
    console: { log() {}, warn() {}, error: console.error },
    setTimeout: (fn, ms = 0) => { timers.push({ id: ++timerId, at: clock.now + ms, fn }); return timerId; },
    clearTimeout: id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    location: new URL(ORIGIN + "/index.html"),
    history: { replaceState() {} },
    navigator: {},
    prompt: () => null, // 순위표 초기화의 관리자 코드 창: 취소
    fetch: server.fetch,
    localStorage: {
      getItem: k => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k)
    }
  });
  const run = code => vm.runInContext(code, context);
  run("var window = globalThis; Date.now = () => __clock.now;");
  for (const file of ["data/presets.js", "js/game.js", "js/ai.js"]) run(read(file));
  run(uiStubs());
  for (const file of ["js/board-sync.js", "js/main.js"]) run(read(file));
  document.missingIds = options.missing || []; // account.js가 볼 때만 없는 화면 요소
  run(read("js/account.js"));
  document.missingIds = [];
  const app = { run, document, toasts, storage, server, timers, screen: () => document.current, el: id => document.getElementById(id) };
  await idle(server);
  return app;
}

// 서버 요청과 이어지는 처리가 다 끝날 때까지 기다리기
async function idle(server) {
  for (let quiet = 0, n = 0; quiet < 5 && n < 2000; n++) {
    await new Promise(r => setImmediate(r));
    quiet = server.inflight ? 0 : quiet + 1;
  }
}

// 가짜 시계를 ms만큼 앞으로 감으면서 그사이 예약된 일(모아 둔 저장 등)을 실행
async function advance(app, ms) {
  const end = clock.now + ms;
  await idle(app.server);
  for (;;) {
    app.timers.sort((a, b) => a.at - b.at);
    if (!app.timers.length || app.timers[0].at > end) break;
    const t = app.timers.shift();
    clock.now = Math.max(clock.now, t.at);
    t.fn();
    await idle(app.server);
  }
  clock.now = end;
  await idle(app.server);
}

async function member(server, id) {
  const data = await server.call("/signup", { id, password: "pass1234" });
  return data.token;
}

function loggedIn(token, id) {
  return new Map([["company_battle_token", token], ["company_battle_id", id]]);
}

function savedCompany() {
  return {
    player: "", emoji: "🐟", industry: "붕어빵", detail: "붕어빵", name: "저장된 회사", motto: "사훈", funding: "savings",
    rolls: 1, news: "창업 기사", events: [], candidates: {}, hires: {}, rounds: [], foundingByAI: true, powerUsed: null,
    initialCash: 10000, fundingLine: "", financeVersion: "사업 수익 v2 · ", gameId: "savedgame1"
  };
}

test.afterEach(() => { clock.now += 11 * 60 * 1000; }); // 서버의 10분 횟수 제한이 다음 테스트로 넘어가지 않게

// ===== 1. 로그인 직후 /me 실패 =====

for (const fail of [429, 500, "network"]) {
  test(`로그인 확인(/me)이 ${fail}로 실패해도 새 게임으로 넘어가 저장을 덮어쓰지 않는다`, async () => {
    const server = makeServer();
    const token = await member(server, `사장가${ipCount}`);
    const id = `사장가${ipCount}`;
    await server.call("/save", { token, save: { v: 2, phase: "news", savedAt: clock.now, round: 0, nextCandidateId: 1, company: savedCompany() } });
    server.fail["/me"] = fail;
    const app = await boot(server, loggedIn(token, id));

    assert.equal(app.screen(), "screen-resume");                 // 창업 화면(새 게임)이 아니라 고르기 화면
    assert.equal(app.el("btn-resume").textContent, "다시 시도");
    assert.equal(app.el("btn-resume").disabled, false);
    assert.equal(app.storage.get("company_battle_token"), token); // 로그인 유지
    assert.ok(app.toasts.some(t => t.includes("불러오지 못했어요")));
    // 그사이 게임이 저장을 하려 해도 (이 기기·서버 모두) 하지 않는다
    app.run('checkpointGame("funding")');
    await advance(app, 60000);
    assert.ok(!server.calls.some(c => c.path === "/save" || c.path === "/save-clear"));

    // 서버가 돌아오면 '다시 시도'로 하던 게임을 찾고, '이어서 하기'로 이어 간다
    delete server.fail["/me"];
    await app.el("btn-resume").click();
    await idle(server);
    assert.equal(app.screen(), "screen-resume");
    assert.equal(app.el("btn-resume").textContent, "이어서 하기");
    await app.el("btn-resume").click();
    await idle(server);
    assert.equal(app.screen(), "screen-news");
    assert.equal(app.run("game.company.name"), "저장된 회사");
    const kept = await server.env.BOARD.get(`g:${id}`, "json");
    assert.equal(kept.company.name, "저장된 회사");
  });
}

test("/me 실패 후 '새로 시작'은 사장님이 두 번 눌러 고를 때만 새 게임을 열고, 그 판부터 다시 저장한다", async () => {
  const server = makeServer();
  const token = await member(server, "사장나");
  server.fail["/me"] = 503;
  const app = await boot(server, loggedIn(token, "사장나"));
  assert.equal(app.screen(), "screen-resume");
  await app.el("btn-new-game").click();
  assert.equal(app.screen(), "screen-resume");
  await app.el("btn-new-game").click();
  await idle(server);
  assert.equal(app.screen(), "screen-found");
  assert.equal(app.storage.get("company_battle_token"), token);
  app.run('checkpointGame("funding")');
  await advance(app, 10000);
  assert.deepEqual(server.paths().filter(p => p.startsWith("/save")), ["/save-clear", "/save"]);
  assert.equal((await server.env.BOARD.get("g:사장나", "json")).phase, "funding");
});

test("손님은 이어하기 저장이 없어서 /me가 실패해도 바로 새 게임을 시작한다", async () => {
  const server = makeServer();
  const guest = await server.call("/guest", { name: "손님가" });
  server.fail["/me"] = 429;
  const app = await boot(server, new Map([...loggedIn(guest.token, "손님가"), ["company_battle_guest", "1"]]));
  assert.equal(app.screen(), "screen-found");
  assert.equal(app.storage.get("company_battle_token"), guest.token);
});

// ===== 2. 결산 화면의 다음 사람 =====

test("결산 화면에서 로그아웃하고 다음 사람을 한 번에 고르고, 순위표에서 돌아와도 앞사람으로 새 판을 열지 않는다", async () => {
  const server = makeServer();
  const token = await member(server, "사장다");
  const app = await boot(server, loggedIn(token, "사장다"));
  assert.equal(app.screen(), "screen-found");

  app.run('renderFinal(null); showScreen("screen-final");');
  assert.equal(app.el("btn-restart").textContent, "같은 아이디로 한 판 더");
  assert.equal(app.el("btn-logout-next").hidden, false);
  assert.ok(app.el("btn-logout-next").classList.contains("primary"));

  // 결산 → 순위표 → 게임으로 돌아가기: 결산 화면으로 (예전에는 같은 아이디로 새 판이 열림)
  app.run("openBoard()");
  await app.el("btn-board-back").click();
  assert.equal(app.screen(), "screen-final");

  app.el("guest-name").value = "앞손님";
  app.el("login-id").value = "사장다";
  await app.el("btn-logout-next").click();
  await advance(app, 5000);
  assert.equal(app.screen(), "screen-login");
  assert.equal(app.storage.get("company_battle_token"), undefined);
  assert.equal(await server.env.BOARD.get(`s:${token}`), null); // 서버 세션도 끝남
  assert.equal(app.el("guest-name").value, "");
  assert.equal(app.el("login-id").value, "");
  // 결산 때 보낸 저장 지우기가 로그아웃보다 먼저 서버에 도착 (로그아웃 뒤에 보내면 버려짐)
  const paths = server.paths();
  assert.ok(paths.lastIndexOf("/save-clear") >= 0 && paths.lastIndexOf("/save-clear") < paths.lastIndexOf("/logout"));

  // 다음 사람은 손님으로 바로: 결산 버튼도 손님 기준으로 바뀐다
  app.el("guest-name").value = "다음손님";
  await app.el("btn-guest").click();
  await idle(server);
  assert.equal(app.screen(), "screen-found");
  app.run('renderFinal(null); showScreen("screen-final");');
  assert.equal(app.el("btn-restart").textContent, "같은 닉네임으로 한 판 더");
});

test("로그인 기능이 없는 서버에서는 결산 버튼이 원래 그대로다", async () => {
  const server = makeServer();
  server.env.BOARD = undefined; // 저장소 없음 → accounts: false
  const app = await boot(server);
  app.run('renderFinal(null); showScreen("screen-final");');
  assert.equal(app.el("btn-logout-next").hidden, true);
  assert.equal(app.el("btn-restart").textContent, "");  // index.html 글자를 그대로 둠 (가짜 화면은 빈 글자)
});

test("화면 개편으로 결산 화면의 btn-restart가 없어도 로그인·이어하기는 그대로 시작한다", async () => {
  const server = makeServer();
  const token = await member(server, "사장없음");
  const app = await boot(server, loggedIn(token, "사장없음"), { missing: ["btn-restart"] });
  assert.equal(app.screen(), "screen-found");
  app.run('renderFinal(null); showScreen("screen-final");');
  assert.equal(app.screen(), "screen-final");
});

// ===== 3. ChatKHU를 기다리는 중 로그아웃 =====

test("ChatKHU 답을 기다리는 중 로그아웃하면 늦은 답이 새 회사에 적용되거나 로그인 화면을 건너뛰지 않는다", async () => {
  const server = makeServer();
  const token = await member(server, "사장라");
  const app = await boot(server, loggedIn(token, "사장라"));
  app.run(`
    var answer; var applied = 0; var done = 0;
    callChatKHU = () => new Promise(r => { answer = r; });
    AI_STEPS.founding.apply = () => { applied++; game.company.news = "늦은 창업 기사"; };
    runAI("founding", () => { done++; showScreen("screen-news"); });
  `);
  assert.equal(app.screen(), "screen-ai");
  await app.document.userBtn().click();
  await app.document.userBtn().click(); // 두 번 눌러 로그아웃
  assert.equal(app.screen(), "screen-login");

  app.run('answer("창업 답변")');
  await idle(server);
  assert.equal(app.screen(), "screen-login");
  assert.equal(app.run("applied"), 0);
  assert.equal(app.run("done"), 0);
  assert.equal(app.run("game.company.news"), "");
});

// ===== 4. 순위표·설정에서 돌아가기 =====

test("게임 중 설정 → 순위표 → 돌아가기, 초기화 취소 뒤 돌아가기 모두 하던 화면으로 간다", async () => {
  const server = makeServer();
  const token = await member(server, "사장마");
  const app = await boot(server, loggedIn(token, "사장마"));

  // 앞판: 결산 → 순위표 → 돌아가기
  app.run('showScreen("screen-final"); openBoard();');
  await app.el("btn-board-back").click();
  // 다음 판 진행 중이라고 치고
  app.run('showScreen("screen-event"); game.company.name = "진행 중 회사";');

  app.run("openSettings(); openBoard();");
  await app.el("btn-board-back").click();
  assert.equal(app.screen(), "screen-event");
  assert.equal(app.run("game.company.name"), "진행 중 회사");

  // 설정 → 순위표 → 설정 → 순위표 → 돌아가기도 순위표에 갇히지 않음
  app.run("openBoard(); openSettings(); openBoard();");
  await app.el("btn-board-back").click();
  assert.equal(app.screen(), "screen-event");

  // 순위표 초기화를 눌렀다가 관리자 코드 창에서 취소
  app.run("openBoard()");
  await idle(server);
  await app.el("btn-board-clear").click();
  await app.el("btn-board-clear").click();
  await advance(app, 100);
  await app.el("btn-board-back").click();
  assert.equal(app.screen(), "screen-event");
  assert.equal(app.run("game.company.name"), "진행 중 회사");
});

// ===== 5. 저장 모아 보내기와 필살기 =====

test("현장 출동은 이 기기에 바로, 서버에는 몇 초 안에 저장돼 다른 기기에서 이어 해도 필살기가 되살아나지 않는다", async () => {
  const server = makeServer();
  const token = await member(server, "사장바");
  const storage = loggedIn(token, "사장바");
  const app = await boot(server, storage);
  app.run(`
    const c = game.company;
    Object.assign(c, { player: "사장바", industry: "붕어빵", name: "출동 회사", motto: "사훈", foundingByAI: true, initialCash: 10000,
      events: EVENT_ORDER.map(type => ({ type, title: "이벤트", text: "내용" })) });
    makeCandidates(c);
    const x = c.candidates["사원"][0];
    x.name = "김사원";
    askCandidate(c, "사원", x.id, "motivation");
    hireCandidate(c, "사원", x.id);
    game.round = 0;
    c.rounds = [{ order: "해결해", chain: [x.id], investment: 0, committed: true, result: {
      down: [{ say: "해결", lie: false }], up: [{ say: "해결했습니다", lie: false }],
      action: "해결함", score: 70, news: "뉴스", reason: "이유", audit: "감사", over: 0, practice: false, model: "gemini-3.8-flash" } }];
  `);
  await app.run("showRoundResult()"); // 보고를 받은 순간 저장 (phase choice)
  await advance(app, 3000);
  assert.equal((await server.env.BOARD.get("g:사장바", "json")).company.powerUsed, null);

  await app.el("result-box").dispatch("click", { target: { closest: () => ({}) } }); // 현장 출동 버튼
  // 이 기기에는 바로
  const local = JSON.parse(storage.get("company_battle_checkpoint_사장바"));
  assert.equal(local.company.powerUsed?.id, "visit");
  // 서버에는 모아 보내기 간격(3초) 안에
  await advance(app, 3000);
  const saved = await server.env.BOARD.get("g:사장바", "json");
  assert.equal(saved.phase, "choice");
  assert.equal(saved.company.powerUsed?.id, "visit");
  assert.equal(saved.company.rounds[0].power, "visit");

  // 다른 기기(이 기기 저장 없음)에서 로그인해 이어 하기
  const again = await boot(server, loggedIn(token, "사장바"));
  assert.equal(again.screen(), "screen-resume");
  await again.el("btn-resume").click();
  await idle(server);
  assert.equal(again.screen(), "screen-result");
  assert.match(again.run('usePower(game.company, "visit")'), /한 번만/);
});

test("로그아웃하면 기다리던 저장을 먼저 보내고 로그아웃한다", async () => {
  const server = makeServer();
  const token = await member(server, "사장차");
  const app = await boot(server, loggedIn(token, "사장차"));
  app.run('game.company.name = "면접 중 회사"; checkpointGame("interview");'); // 20초 모아 보내기 대기 중
  await advance(app, 1000);
  assert.ok(!server.paths().includes("/save"));
  await app.document.userBtn().click();
  await app.document.userBtn().click();
  await advance(app, 5000);
  const paths = server.paths();
  assert.ok(paths.indexOf("/save") >= 0 && paths.indexOf("/save") < paths.indexOf("/logout"), paths.join(","));
  assert.equal((await server.env.BOARD.get("g:사장차", "json")).company.name, "면접 중 회사");
});

// ===== 6. 올리지 못한 앞사람 기록이 다음 사람 이름으로 올라가지 않기 =====

test("앞사람 기록 업로드가 실패했다가 다음 사람이 로그인한 뒤 재시도돼도 다음 사람 이름으로 올라가지 않는다", async () => {
  const server = makeServer();
  const token = await member(server, "사장사");
  const app = await boot(server, loggedIn(token, "사장사"));
  await idle(server);
  const entry = (player, name, at) => `{ player: "${player}", name: "${name}", emoji: "🐟", industry: "붕어빵", profit: 500, news: "사업 수익 v2 · n", ending: "e", model: "", at: ${at} }`;
  server.fail["/board"] = 429; // 같은 와이파이의 요청 제한 같은 일시 오류
  app.run(`saveBoard(loadBoard().concat([${entry("사장사", "A회사", "Date.now()")}]))`);
  await idle(server);
  delete server.fail["/board"];

  app.run('renderFinal(null); showScreen("screen-final");');
  await app.el("btn-logout-next").click();
  await advance(app, 5000);
  app.el("guest-name").value = "다음손님";
  await app.el("btn-guest").click();
  await idle(server);
  app.run(`saveBoard(loadBoard().concat([${entry("다음손님", "B회사", "Date.now() + 5")}]))`);
  await idle(server);

  const onServer = [...server.env.BOARD.m].filter(([k]) => k.startsWith("e:")).map(([, v]) => v.metadata.player + ":" + v.metadata.name);
  assert.deepEqual(onServer, ["다음손님(손님):B회사"]); // A회사 기록이 다음손님 이름으로 올라가면 안 됨
});

// ===== 7. 면접 끝 버튼: 최소 인원 =====

test("면접 끝 버튼은 6자리가 다 차지 않으면 안내만 하고, 6명이면 1분기로 넘어간다", async () => {
  const server = makeServer();
  server.env.BOARD = undefined; // 로그인 없이
  const app = await boot(server);
  app.run(`
    var c = game.company;
    c.funding = "lottery";
    makeCandidates(c);
    var hireRank = rank => { const x = c.candidates[rank][0]; askCandidate(c, rank, x.id, "motivation"); return hireCandidate(c, rank, x.id); };
    hireRank("사원");
    showScreen("screen-interview");
  `);
  const done = () => app.el("interview").dispatch("click", { target: { closest: () => ({ dataset: { action: "done" } }) } });
  await done();
  assert.equal(app.screen(), "screen-interview");
  assert.match(app.toasts.at(-1), /6자리.*지금 1명/);
  app.run('["임원", "부장", "차장", "과장", "대리"].forEach(hireRank);');
  await done();
  assert.equal(app.screen(), "screen-event");
});
