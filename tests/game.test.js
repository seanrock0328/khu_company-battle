// 실행: node --test tests/game.test.js (추가 라이브러리 불필요)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup(options = {}) {
  const saved = new Map();
  const context = vm.createContext({
    URL, URLSearchParams,
    location: new URL("file:///C:/game/index.html"),
    KHU_SHARED_INDUSTRY: options.sharedIndustry === true,
    localStorage: {
      getItem: key => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
      removeItem: key => saved.delete(key)
    },
    ...options.globals
  });
  for (const file of ["data/presets.js", "js/game.js", "js/economy.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  return code => vm.runInContext(code, context);
}

function hire(run) {
  run(`
    const c = game.company;
    c.funding = "parents";
    c.industry = "붕어빵"; c.player = "사장"; c.name = "테스트 회사";
    c.foundingByAI = true; c.business = makeBusiness({ type:"sales", positioning:"balanced" });
    makeCandidates(c);
    const employee = c.candidates["사원"][0];
    employee.name = "김테스트";
    askCandidate(c, "사원", employee.id, "motivation");
    hireCandidate(c, "사원", employee.id);
  `);
}

test("면접을 본 같은 직급의 후보만 예산 안에서 채용한다", () => {
  const run = setup();
  run('const c = game.company; c.funding = "lottery"; makeCandidates(c); const x = c.candidates["임원"][0];');
  assert.equal(run('askCandidate(c, "사원", x.id, "mistake")'), false);
  assert.equal(run('askCandidate(c, "임원", x.id, "unknown")'), false);
  run('askCandidate(c, "임원", x.id, "mistake"); askCandidate(c, "임원", x.id, "mistake");');
  assert.equal(run("x.interviewed.length"), 1);
  assert.match(run('hireCandidate(c, "사원", x.id)'), /직급/);
  assert.equal(run('hireCandidate(c, "임원", x.id)'), null);
  assert.match(run('hireCandidate(c, "임원", null)'), /모두 채워야/); // 빈자리는 없음
  assert.equal(run('c.hires["임원"]'), run("x.id"));
  run('const y = c.candidates["임원"][1]; y.salary = 100; askCandidate(c, "임원", y.id, "mistake");');
  assert.match(run('hireCandidate(c, "임원", y.id)'), /예산/);
  assert.equal(run('c.hires["임원"]'), run("x.id")); // 예산을 넘으면 바꾸지 않고 앞 사람 그대로
  assert.match(run('attachmentLabel(x)'), /안정형 \d+% · 회피형 \d+%/);
});

test("6자리를 모두 채워야 업무를 시작하고, 어느 봉투든 6명은 항상 뽑을 수 있다", () => {
  const run = setup();
  hire(run); // 사원 1명
  assert.equal(run("MIN_STAFF"), 6);
  assert.match(run("checkStaffing(c)"), /6자리.*지금 1명/);
  run(`
    c.funding = "lottery";
    for (const rank of ["임원", "부장", "차장", "과장", "대리"]) {
      const x = [...c.candidates[rank]].sort((a, b) => a.salary - b.salary)[0];
      askCandidate(c, rank, x.id, "motivation");
      hireCandidate(c, rank, x.id);
    }
  `);
  assert.equal(run("checkStaffing(c)"), null);
  // 위 직급부터 가장 비싼 후보를 먼저 시도하고, 안 되면 다음으로 싼 후보를 고른다 → 언제나 6명이 채워진다
  for (const funding of ["parents", "savings", "lottery"]) {
    for (let i = 0; i < 300; i++) {
      run(`
        c.funding = "${funding}"; makeCandidates(c);
        var filled = HIRE_RANKS.every(rank => [...c.candidates[rank]].sort((a, b) => b.salary - a.salary).some(x => {
          askCandidate(c, rank, x.id, "motivation");
          return hireCandidate(c, rank, x.id) === null;
        }));
      `);
      assert.equal(run("filled"), true, funding);
      assert.equal(run("checkStaffing(c)"), null);
      assert.ok(run("payroll(c) <= budgetOf(c)"));
    }
  }
});

test("전원 퇴사 후 남은 분기마다 영업 중단 손실을 한 번씩 적용한다", () => {
  const run = setup();
  hire(run);
  run(`
    employee.quit = true;
    for (game.round = 0; game.round < ROUNDS; game.round++) {
      c.rounds[game.round] = { result: null };
      closeUnstaffedRound(c);
      closeUnstaffedRound(c);
      settleRound(c, "closed");
    }
  `);
  assert.equal(run("CLOSED_PENALTY"), 10000);
  assert.equal(run("totalProfit(c)"), -40000);
  assert.equal(run("c.rounds.every(r => r.revenue === 0 && r.cost === 0 && r.penalty === 10000 && r.profit === -10000)"), true);
  assert.match(run("c.rounds[0].loyaltyNote"), /임대료와 위약금 −1억원/);
});

test("한 판은 위기 2번·기회 2번의 4턴이며 4분기에 종료된다", () => {
  const run = setup();
  assert.equal(run("ROUNDS"), 4);
  assert.equal(run('EVENT_ORDER.filter(t => t === "위기").length'), 2);
  assert.equal(run('EVENT_ORDER.filter(t => t === "기회").length'), 2);
  assert.equal(run("quarterLabel(ROUNDS - 1)"), "1년차 4분기");
});

test("AI 창업 요청과 연습 모드가 모두 1년 이벤트 4개를 만든다", () => {
  const run = setup();
  run(fs.readFileSync(path.join(__dirname, "..", "js/ai.js"), "utf8"));
  hire(run);
  assert.match(run("buildFoundingRequest()"), /이벤트 4개 \(1년 동안 분기마다 하나\)/);
  run("practiceFounding()");
  assert.equal(run("c.events.length"), 4);
  run(`applyFounding(JSON.stringify({ business:{type:"sales",positioning:"balanced"}, news: "창업", events: c.events,
    candidates: allCandidates(c).map(x => ({ id: x.id, name: x.name, intro: x.intro, answer: x.answer })) }), "테스트")`);
  assert.equal(run("c.events.length"), 4);
  assert.equal(run("c.foundingByAI"), true);
});

test("이전 8턴 순위는 보관하면서 새로운 4턴 순위에서 제외한다", () => {
  const run = setup();
  run('localStorage.setItem("company_battle_leaderboard_v3", JSON.stringify([{ industry: "붕어빵", profit: 99999 }]))');
  run('localStorage.setItem("company_battle_leaderboard_v4", JSON.stringify([{ industry: "붕어빵", profit: 88888 }]))');
  assert.equal(run("loadBoard().length"), 0);
  run('saveBoard([{ industry: "붕어빵", profit: 1000 }])');
  assert.equal(run("loadBoard()[0].profit"), 1000);
  assert.equal(run('JSON.parse(localStorage.getItem("company_battle_leaderboard_v3"))[0].profit'), 99999);
  assert.equal(run('JSON.parse(localStorage.getItem("company_battle_leaderboard_v4"))[0].profit'), 88888);
});

test("회식은 충성심 10을 넘지 않으며 이미 가득하면 필살기를 쓰지 않는다", () => {
  const run = setup();
  hire(run);
  run('c.rounds[0] = { result: null }; employee.loyalty = 10;');
  assert.match(run('usePower(c, "dinner")'), /가득/);
  assert.equal(run("c.powerUsed"), null);
  run('employee.loyalty = 9; usePower(c, "dinner");');
  assert.equal(run("employee.loyalty"), 10);
});

test("추리 단서는 점수·진실 원문을 노출하지 않고 성공·실패 경계에서 겹친다", () => {
  const run = setup();
  const a = run('JSON.stringify(cluesFor({ result: { score: 59, action: "비밀 실제 업무", audit: "비밀 감사", up: [{ lie: true }] } }))');
  const b = run('JSON.stringify(cluesFor({ result: { score: 60, action: "다른 업무", up: [{ lie: true }] } }))');
  assert.equal(a, b);
  assert.doesNotMatch(a, /59|60|비밀|실패|성공/);
});

test("추리 단서는 분기마다 다른 출처로 나오고, 같은 분기는 다시 그려도 같다", () => {
  const run = setup();
  const clues = (q, score, lie, title) => JSON.parse(run(`JSON.stringify(cluesFor({ result: { score: ${score}, up: [{ lie: ${lie} }] } }, { seed: "판-7", quarter: ${q}, event: { title: ${JSON.stringify(title)} } }))`));
  const src = text => text.split(/[ :]/)[0];
  const four = [0, 1, 2, 3].map(q => clues(q, 59, true, "서버 다운"));
  assert.equal(new Set(four.map(x => src(x[0]))).size, 4);
  assert.equal(new Set(four.map(x => src(x[1]))).size, 4);
  assert.deepEqual(clues(2, 59, true, "서버 다운"), clues(2, 59, true, "서버 다운"));
  // 출처는 점수·거짓말과 상관없이 정해져서 단서로 답이 새지 않습니다. 같은 구간 안에서는 문장도 같습니다
  assert.deepEqual(clues(1, 46, true, "서버 다운"), clues(1, 79, true, "서버 다운"));
  assert.deepEqual(clues(1, 59, true, "서버 다운"), clues(1, 60, true, "서버 다운"));
  assert.equal(src(clues(1, 10, false, "서버 다운")[0]), src(clues(1, 95, true, "서버 다운")[0]));
  assert.equal(src(clues(1, 10, false, "서버 다운")[1]), src(clues(1, 95, true, "서버 다운")[1]));
  assert.notDeepEqual(clues(0, 59, true, "서버 다운"), JSON.parse(run('JSON.stringify(cluesFor({ result: { score: 59, up: [{ lie: true }] } }, { seed: "판-8", quarter: 0, event: { title: "서버 다운" } }))')));
});

test("모든 추리 단서 문장은 점수 숫자나 성공·실패를 직접 말하지 않는다", () => {
  const run = setup();
  const all = JSON.parse(run("JSON.stringify([...CLUE_RESULT.flatMap(x => [...x.low, ...x.mid, ...x.high]), ...CLUE_PROCESS.flatMap(x => [...x.lie, ...x.honest])])"));
  assert.ok(all.length >= 50);
  for (const text of all) assert.doesNotMatch(text, /\d|성공|실패|점수/);
});

test("영업 중단 분기에는 예약된 투자도 집행하지 않는다", () => {
  const run = setup();
  hire(run);
  run('game.round = 3; c.rounds[3] = { result: null, investment: 1000 }; employee.quit = true; closeUnstaffedRound(c);');
  assert.equal(run("c.rounds[3].revenue"), 0);
  assert.equal(run("c.rounds[3].investmentCost"), 0);
  assert.equal(run("c.rounds[3].profit"), -10000);
});

test("수익·충성심·선택에 따른 엔딩과 공유 문구를 일관되게 만든다", () => {
  const run = setup();
  hire(run);
  run('c.rounds = Array.from({ length: 4 }, () => ({ profit: 1000, choice: "praise", success: true })); employee.loyalty = 8;');
  assert.equal(run("endingFor(c).id"), "happy");
  assert.match(run("endingShareText(c)"), /1년 4분기 결산/);
  assert.match(run("endingShareText(c)"), /\+4,000만원/);
  run('c.rounds[3].investmentCost = 1000; c.rounds[3].investmentReturn = 1600;');
  assert.equal(run("endingFor(c).id"), "comeback");
  run('c.rounds.forEach(r => { r.profit = -1000; });');
  assert.equal(run("endingFor(c).id"), "welfare");
  run('employee.loyalty = 5; c.rounds.forEach(r => { r.success = false; });');
  assert.equal(run("endingFor(c).id"), "paper");
  run('employee.quit = true;');
  assert.equal(run("endingFor(c).id"), "closed");
  assert.equal(run("endingShareText(c)"), run("endingShareText(c)"));
});

test("연습 모드에서 전원 퇴사해도 정식 순위에 기록하지 않는다", () => {
  const run = setup();
  hire(run);
  run(`
    c.foundingByAI = false; employee.quit = true;
    for (game.round = 0; game.round < ROUNDS; game.round++) {
      c.rounds[game.round] = { result: null };
      closeUnstaffedRound(c);
    }
  `);
  assert.equal(run("isPractice(c)"), true);
  assert.equal(run("recordResult(c)"), null);
});

test("창업 봉투는 출처별 금액을 지급하고 로또를 다시 뽑지 않는다", () => {
  const run = setup();
  assert.equal(run('openFunding({ funding: "parents" })'), 8000);
  assert.equal(run('openFunding({ funding: "savings" })'), 10000);
  run('const lottery = { funding: "lottery", initialCash: null }; Math.random = () => 0; openFunding(lottery);');
  assert.equal(run('lottery.initialCash'), 6000);
  run('Math.random = () => 0.99; openFunding(lottery);');
  assert.equal(run('lottery.initialCash'), 6000);
  assert.equal(run('openFunding(JSON.parse(JSON.stringify(lottery)))'), 6000);
  assert.equal(run('openFunding({ funding: "lottery" })'), 14000);
});

test("알바 자금의 시작 충성심 보너스는 후보 생성 때 한 번만 적용한다", () => {
  const run = setup();
  run('const c = game.company; c.funding = "savings"; openFunding(c); makeCandidates(c);');
  assert.equal(run('allCandidates(c).every(x => x.loyalty === 7)'), true);
  run('openFunding(c)');
  assert.equal(run('allCandidates(c).every(x => x.loyalty === 7)'), true);
});

test("급여와 회식비를 확보한 뒤 남은 현금으로만 투자한다", () => {
  const run = setup();
  hire(run);
  run('c.initialCash = employee.salary * 200 + c.business.fixed + 1200; c.rounds[0] = { result: null, investment: 0 };');
  assert.equal(run('usePower(c, "dinner")'), null);
  assert.match(run('setInvestment(c, true)'), /부족/);
  assert.equal(run('setInvestment(c, false)'), null);
  run('c.initialCash = employee.salary * 200 + c.business.fixed + 1300;');
  assert.equal(run('setInvestment(c, true)'), null);
  assert.equal(run('availableCash(c)'), 0);
  run('c.rounds[0].committed = true;');
  assert.match(run('setInvestment(c, false)'), /지시/);
});

test("기본: 업종이 달라도 순위표 하나로 수익순 정렬한다 (10/29 팀 결정)", () => {
  const run = setup();
  run(`
    saveBoard([
      { industry: "붕어빵", profit: 200, at: 1 },
      { industry: "AI", profit: 9999, at: 2 },
      { industry: "붕어빵", profit: 300, at: 3 }
    ]);
    setSeason("붕어빵", "🐟");
  `);
  assert.equal(run("getSeason()"), null);
  assert.equal(run("sortedBoard().length"), 3);
  assert.equal(run("sortedBoard()[0].industry"), "AI");
});

test("같은 업종 모드: 순위표는 현재 업종으로 걸러내며 다른 업종의 기록도 보관한다", () => {
  const run = setup({ sharedIndustry: true });
  run(`
    saveBoard([
      { industry: "붕어빵", profit: 200, at: 1 },
      { industry: "AI", profit: 9999, at: 2 },
      { industry: "붕어빵", profit: 300, at: 3 }
    ]);
    setSeason("붕어빵", "🐟");
  `);
  assert.equal(run("sortedBoard().length"), 2);
  assert.equal(run("sortedBoard()[0].profit"), 300);
  assert.equal(run("loadBoard().length"), 3);
  run('setSeason("AI", "🤖")');
  assert.equal(run("sortedBoard().length"), 1);
});

test("같은 업종 모드: index.html을 직접 열어도 유효한 업종 공유 링크를 만든다", () => {
  const run = setup({ sharedIndustry: true });
  run('setSeason("붕어빵 프랜차이즈", "🐟")');
  const url = new URL(run("seasonLink()"));
  assert.equal(url.protocol, "file:");
  assert.equal(url.pathname, "/C:/game/index.html");
  assert.equal(url.searchParams.get("industry"), "붕어빵 프랜차이즈");
});

// ===== 순위표 보호 (붙여넣기 점수, 서버 수익 범위, 결산 순위, 같은 판 중복 기록) =====

function finishGame(run, model, score = 100) {
  run(`
    for (game.round = 0; game.round < ROUNDS; game.round++) {
      c.rounds[game.round] = { order: "주문 처리", result: null, investment: 0 };
      prepareBusinessRound(c);
      applyPlan(JSON.stringify({ action:emptyAction() }), "${model}");
      applyEvent(JSON.stringify({ down: [{ say: "처리" }], up: [{ say: "완료" }], score: ${score} }), "${model}");
      settleRound(c, "praise");
    }
  `);
}

test("붙여넣은 ChatKHU 답(모델 이름 없음)이 있는 판은 연습으로 쳐서 순위에 넣지 않는다", () => {
  for (const [model, official] of [["", false], ["gemini-3.8-flash", true]]) {
    const run = setup();
    run(fs.readFileSync(path.join(__dirname, "..", "js/ai.js"), "utf8"));
    hire(run);
    run(`applyFounding(JSON.stringify({ business:{type:"sales",positioning:"balanced"}, news: "창업", events: EVENT_ORDER.map(type => ({ type, title: "이벤트", text: "내용" })),
      candidates: allCandidates(c).map(x => ({ id: x.id, name: "김테스트" })) }), "${model}")`);
    assert.equal(run("c.foundingByAI"), official);
    finishGame(run, model);
    assert.equal(run("c.rounds.every(r => r.result.practice === " + !official + ")"), true, `model="${model}"`);
    assert.equal(run("isPractice(c)"), !official);
    assert.equal(run("recordResult(c) === null"), !official);
  }
  // 자동 창업 + 한 분기만 붙여넣기여도 연습
  const run = setup();
  run(fs.readFileSync(path.join(__dirname, "..", "js/ai.js"), "utf8"));
  hire(run);
  finishGame(run, "gemini-3.8-flash");
  run('game.round = 2; c.rounds[2].result = null; applyEvent(JSON.stringify({ down: [], up: [], score: 100 }), "");');
  assert.equal(run("isPractice(c)"), true);
});

function workerSetup() {
  const kv = new Map();
  const BOARD = {
    async get(key, type) { const v = kv.get(key); return v === undefined ? null : type === "json" ? JSON.parse(v.value) : v.value; },
    async put(key, value, opts = {}) { kv.set(key, { value, metadata: opts.metadata }); },
    async delete(key) { kv.delete(key); },
    async list({ prefix = "" }) {
      return { list_complete: true, keys: [...kv].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })) };
    }
  };
  const tokens = { tester: "a".repeat(64), other: "b".repeat(64) };
  for (const [id, token] of Object.entries(tokens)) kv.set(`s:${token}`, { value: id });
  // 진짜 팀 서버·ChatKHU에는 접속하지 않습니다 (fetch를 넣지 않은 별도 공간에서 worker.js 실행)
  const context = vm.createContext({ Response, URL, crypto, TextEncoder, btoa, atob, console, AbortController, setTimeout, clearTimeout });
  const src = fs.readFileSync(path.join(__dirname, "..", "worker/worker.js"), "utf8").replace("export default", "globalThis.worker =");
  vm.runInContext(src, context);
  let ip = 0;
  const post = async (pathname, body) => {
    const res = await context.worker.fetch(new Request(`https://test.workers.dev${pathname}`, {
      method: "POST",
      headers: { Origin: "http://localhost:8000", "Content-Type": "application/json", "CF-Connecting-IP": `10.0.0.${++ip}` },
      body: JSON.stringify(body)
    }), { BOARD });
    return { status: res.status, data: await res.json() };
  };
  return { kv, tokens, post, run: code => vm.runInContext(code, context) };
}

test("서버는 범위 밖 수익을 거절하고, 모델 이름이 빈 기록(영업 중단)은 받는다", async () => {
  const { post, tokens, kv } = workerSetup();
  const entry = profit => ({ industry: "붕어빵", name: "테스트", profit, at: Date.now(), model: "" });
  for (const [profit, status] of [[42400, 200], [42500, 400], [-40000, 200], [-40100, 400], [10000000, 400], [9999999, 400]]) {
    const res = await post("/board", { token: tokens.tester, entry: entry(profit) });
    assert.equal(res.status, status, `수익 ${profit}`);
  }
  assert.equal([...kv.keys()].filter(k => k.startsWith("e:")).length, 2);
});

test("같은 판(gameId)은 서버 순위표에 한 번만 기록되고, 다른 사람 기록은 덮어쓰지 못한다", async () => {
  const { post, tokens, kv } = workerSetup();
  const entry = (at, gameId) => ({ industry: "붕어빵", name: "테스트", profit: 1000, at, model: "gemini-3.8-flash", gameId });
  const now = Date.now();
  assert.deepEqual((await post("/board", { token: tokens.tester, entry: entry(now - 5000, "abc123xyz") })).data, { ok: true });
  // 이어하기로 결산을 다시 열면 at은 달라도 gameId는 같음
  assert.deepEqual((await post("/board", { token: tokens.tester, entry: entry(now, "abc123xyz") })).data, { ok: true, duplicate: true });
  assert.equal((await post("/board", { token: tokens.other, entry: entry(now, "abc123xyz") })).status, 200);
  assert.equal((await post("/board", { token: tokens.tester, entry: entry(now, "") })).status, 200); // 예전 저장(번호 없음)은 예전처럼
  const keys = [...kv.keys()].filter(k => k.startsWith("e:"));
  assert.equal(keys.length, 3);
  assert.equal(kv.get("e:g:tester:abc123xyz").metadata.at, now - 5000); // 처음 기록이 남음
  assert.equal(kv.get("e:g:tester:abc123xyz").metadata.gameId, undefined); // 번호는 공개 순위표에 안 나감
});

test("한 판 번호는 판마다 다르고, 이어하기로 다시 기록해도 같은 번호로 올라간다", () => {
  const run = setup();
  run(fs.readFileSync(path.join(__dirname, "..", "js/ai.js"), "utf8"));
  hire(run);
  finishGame(run, "gemini-3.8-flash", 70);
  run("var saved = JSON.stringify(c); recordResult(c);"); // 4분기 결산 직후 저장본
  run("game.company = JSON.parse(saved); recordResult(game.company);"); // 지우기 실패 후 이어하기
  assert.equal(run("loadBoard().length"), 2); // 이 기기 사본은 둘 (서버가 하나로 합침)
  assert.equal(run("new Set(loadBoard().map(e => e.gameId)).size"), 1);
  assert.match(run("loadBoard()[0].gameId"), /^[0-9a-z]{6,24}$/);
  const first = run("game.company.gameId");
  run("resetGame()");
  assert.notEqual(run("game.company.gameId"), first);
});

test("공유 순위표: 결산 순위는 판을 끝낸 뒤 순위표를 다시 받아 계산하고, 같은 판 중복은 이 기기에서도 지운다", async () => {
  const server = {
    entries: [{ player: "A", name: "가", industry: "붕어빵", profit: -39000, at: 1700000000001, news: "사업 수익 v2 · A" }],
    gameIds: new Set(), posts: 0
  };
  // 진짜 서버 대신 쓰는 가짜 서버 (이 테스트는 인터넷에 접속하지 않습니다)
  const fetch = async (url, init = {}) => {
    const { pathname } = new URL(url);
    if (pathname === "/board" && init.method === "POST") {
      const { entry } = JSON.parse(init.body);
      server.posts++;
      if (server.gameIds.has(entry.gameId)) return new Response(JSON.stringify({ ok: true, duplicate: true }));
      server.gameIds.add(entry.gameId);
      const { gameId, ...shown } = entry; // 진짜 서버도 번호는 공개하지 않음
      server.entries.push(shown);
      return new Response(JSON.stringify({ ok: true }));
    }
    if (pathname === "/board") return new Response(JSON.stringify({ season: null, entries: server.entries }));
    return new Response("{}", { status: 404 });
  };
  const document = {
    getElementById: id => ({ classList: { contains: name => name === "active" && id === "screen-final" } }),
    querySelector: () => null
  };
  const run = setup({ globals: { fetch, document, console } });
  run(fs.readFileSync(path.join(__dirname, "..", "js/ai.js"), "utf8"));
  run("var window = globalThis; var finals = []; function renderBoard() {} function renderFound() {} function toast() {} function renderFinal(p) { finals.push(p); }");
  run(fs.readFileSync(path.join(__dirname, "..", "js/board-sync.js"), "utf8"));
  const settle = () => new Promise(r => setTimeout(r, 20));
  await settle(); // 화면을 열 때 순위표 받기 (A 한 명)

  // 플레이하는 동안 다른 사장님 B가 더 높은 기록을 올림
  server.entries.push({ player: "B", name: "나", industry: "AI", profit: 40000, at: 1700000000002, news: "사업 수익 v2 · B" });
  hire(run);
  finishGame(run, "gemini-3.8-flash", 70);
  run("var saved = JSON.stringify(c);");
  assert.equal(run("recordResult(c).rank"), 1); // 오래된 순위표로는 1위
  await settle();
  assert.equal(run("c.placement.rank"), 2);
  assert.equal(run("c.placement.total"), 3);
  assert.equal(run("finals.length"), 1); // 결산 화면을 새 순위로 다시 그림
  assert.equal(run("finals[0].rank"), 2);

  // 지우기 실패 후 이어하기: 같은 판을 다시 기록해도 서버도 이 기기도 한 줄
  run("game.company = JSON.parse(saved); recordResult(game.company);");
  await settle();
  assert.equal(server.posts, 2);
  assert.equal(server.entries.length, 3);
  assert.equal(run("loadBoard().length"), 3);
});

test("후보 능력치 합은 15~19 중 무작위(평균 17)이고 모든 능력치는 1~9 안이다", () => {
  const run = setup();
  const r = JSON.parse(run(`
    const xs = [];
    for (let i = 0; i < 300; i++) { const c = newCompany(); makeCandidates(c); xs.push(...allCandidates(c)); }
    const honestyByShown = new Map();
    xs.forEach(x => {
      const k = x.skill + "," + x.luck;
      honestyByShown.set(k, (honestyByShown.get(k) || new Set()).add(x.honesty));
    });
    JSON.stringify({
      inRange: xs.every(x => [x.skill, x.honesty, x.luck].every(v => Number.isInteger(v) && v >= 1 && v <= 9)),
      mainHigh: xs.every(x => x[x.type] >= 7),
      sums: [...new Set(xs.map(x => x.skill + x.honesty + x.luck))].sort(),
      avgSum: xs.reduce((s, x) => s + x.skill + x.honesty + x.luck, 0) / xs.length,
      ambiguous: [...honestyByShown.values()].some(s => s.size > 1)
    });
  `));
  assert.equal(r.inRange, true);
  assert.equal(r.mainHigh, true);
  assert.deepEqual(r.sums, [15, 16, 17, 18, 19]);
  assert.ok(Math.abs(r.avgSum - 17) < 0.2, `평균 합 ${r.avgSum}`);
  assert.equal(r.ambiguous, true);
});
