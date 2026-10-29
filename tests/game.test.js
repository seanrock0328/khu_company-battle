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
    }
  });
  for (const file of ["data/presets.js", "js/game.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  return code => vm.runInContext(code, context);
}

function hire(run) {
  run(`
    const c = game.company;
    c.industry = "붕어빵"; c.player = "사장"; c.name = "테스트 회사";
    c.foundingByAI = true;
    makeCandidates(c);
    const employee = c.candidates["사원"][0];
    employee.name = "김테스트";
    askCandidate(c, "사원", employee.id, "motivation");
    hireCandidate(c, "사원", employee.id);
  `);
}

test("면접을 본 같은 직급의 후보만 예산 안에서 채용한다", () => {
  const run = setup();
  run('const c = game.company; makeCandidates(c); const x = c.candidates["임원"][0];');
  assert.match(run('hireCandidate(c, "임원", x.id)'), /질문/);
  assert.equal(run('askCandidate(c, "사원", x.id, "mistake")'), false);
  assert.equal(run('askCandidate(c, "임원", x.id, "unknown")'), false);
  run('askCandidate(c, "임원", x.id, "mistake"); askCandidate(c, "임원", x.id, "mistake");');
  assert.equal(run("x.interviewed.length"), 1);
  assert.match(run('hireCandidate(c, "사원", x.id)'), /직급/);
  assert.equal(run('hireCandidate(c, "임원", x.id)'), null);
  assert.equal(run('hireCandidate(c, "임원", null)'), null);
  run('x.salary = 100;');
  assert.match(run('hireCandidate(c, "임원", x.id)'), /예산/);
  assert.equal(run('c.hires["임원"]'), null);
  assert.match(run('attachmentLabel(x)'), /안정형 \d+% · 회피형 \d+%/);
});

for (const [choice, score, loyalty, penalty] of [
  ["praise", 60, 6, 0], ["praise", 59, 5, 3000],
  ["dig", 60, 4, 0], ["dig", 59, 5, 0]
]) {
  test(`${choice} / ${score}점의 충성심과 손익을 한 번만 적용한다`, () => {
    const run = setup();
    hire(run);
    run(`c.rounds[0] = { result: { score: ${score} } }; settleRound(c, "${choice}");`);
    assert.equal(run("employee.loyalty"), loyalty);
    assert.equal(run("c.rounds[0].penalty"), penalty);
    assert.equal(run("c.rounds[0].profit"), run(`${score} * 100 - employee.salary * 200 - ${penalty}`));
    run(`settleRound(c, "${choice}");`);
    assert.equal(run("employee.loyalty"), loyalty);
  });
}

test("전원 퇴사 후에도 4분기를 마치고 마지막 근무 분기의 급여를 지급한다", () => {
  const run = setup();
  hire(run);
  run(`
    employee.loyalty = 1;
    c.rounds[0] = { chain: [employee.id], result: { score: 60, news: "퇴사" } };
    settleRound(c, "dig");
  `);
  assert.equal(run("staffOf(c).length"), 0);
  assert.equal(run("c.rounds[0].cost"), run("employee.salary * 200"));
  assert.equal(run("recordResult(c)"), null);
  run(`
    for (game.round = 1; game.round < ROUNDS; game.round++) {
      c.rounds[game.round] = { order: "", result: null };
      closeUnstaffedRound(c);
    }
  `);
  assert.equal(run("c.rounds.length"), 4);
  assert.equal(run('c.rounds.slice(1).every(r => r.choice === "closed" && r.profit === -CLOSED_PENALTY && !r.result.practice)'), true);
  assert.equal(run("recordResult(c).total"), 1);
  run("recordResult(c)");
  assert.equal(run("loadBoard().length"), 1);
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
  assert.equal(run("CLOSED_PENALTY"), 9000);
  assert.equal(run("totalProfit(c)"), -36000);
  assert.equal(run("c.rounds.every(r => r.revenue === 0 && r.cost === 0 && r.penalty === 9000 && r.profit === -9000)"), true);
  assert.match(run("c.rounds[0].loyaltyNote"), /임대료와 위약금 −9,000만원/);
});

function simulate(scores, choices, salary = 14, loyalty = 5) {
  const run = setup();
  hire(run);
  run(`employee.salary = ${salary}; employee.loyalty = ${loyalty}; c.funding = "vc";`);
  for (let i = 0; i < 4; i++) {
    run(`
      game.round = ${i};
      c.rounds[game.round] = { result: null };
      if (!staffOf(c).length) closeUnstaffedRound(c);
      else {
        c.rounds[game.round].result = { score: ${scores[i]}, news: "비교 결산" };
        settleRound(c, "${choices[i]}");
      }
    `);
  }
  return run("totalProfit(c)");
}

test("4턴 동안 추궁해도 초기 충성심 5인 직원은 남아 있고 1년 수익만 결산한다", () => {
  assert.equal(simulate(Array(4).fill(70), Array(4).fill("dig")), 16800);
});

test("충성심이 낮은 직원을 전원 퇴사시키는 전략이 정상 경영보다 불리하다", () => {
  // 낮은 충성심 2인 상황을 고정: 2분기 근무 수익 8,400 - 중단 2분기 손실 18,000.
  const closed = simulate(Array(4).fill(70), Array(4).fill("dig"), 14, 2);
  const scores = [20, 90, 30, 70];
  const normal = simulate(scores, scores.map(s => s >= 60 ? "praise" : "dig"));
  assert.equal(closed, -9600);
  assert.equal(normal, 9800);
  assert.ok(normal > closed);
});

test("영업 중단으로 정상 경영의 최악 손실도 피할 수 없다", () => {
  const run = setup();
  assert.ok(run("CLOSED_PENALTY > Math.max(...FUNDING.map(f => f.budget)) * COST_PER_SALARY + PRAISE_FAIL_PENALTY + DINNER_COST"));
  for (const salary of [14, 18, 22, 28]) {
    for (const score of [0, 20, 59, 60, 70, 100]) {
      // 충성심 2와 첫 2분기 성과를 고정. 남은 2분기의 운영과 중단을 비교.
      const scores = [70, 70, score, score];
      const closed = simulate(scores, Array(4).fill("dig"), salary, 2);
      const normal = simulate(scores, Array(4).fill("praise"), salary, 2);
      assert.ok(normal > closed, `인건비 ${salary}, 남은 분기 성과 ${score}`);
    }
  }
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
  run(`applyFounding(JSON.stringify({ news: "창업", events: c.events,
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

test("회식은 판당 한 번 충성심을 회복하고 비용을 중복 없이 결산한다", () => {
  const run = setup();
  hire(run);
  run('c.rounds[0] = { order: "주문 처리", result: null };');
  assert.match(run('usePower(c, "visit")'), /보고/);
  assert.match(run('usePower(c, "direct")'), /한 명/);
  assert.equal(run('usePower(c, "dinner")'), null);
  assert.equal(run("employee.loyalty"), 7);
  assert.match(run('usePower(c, "dinner")'), /한 번/);
  run('c.rounds[0].result = { score: 80 }; settleRound(c, "praise"); settleRound(c, "praise");');
  assert.equal(run("employee.loyalty"), 8);
  assert.equal(run("c.rounds[0].powerCost"), 300);
  assert.equal(run("totalProfit(c)"), run("8000 - employee.salary * 200 - 300"));
  run('game.round = 1; c.rounds[1] = { result: { score: 50 } };');
  assert.match(run('usePower(c, "visit")'), /한 번/);
  run("resetGame()");
  assert.equal(run("game.company.powerUsed"), null);
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

test("직통 전화는 말단에게만 전달하되 전 직원 인건비를 유지한다", () => {
  const run = setup();
  run(fs.readFileSync(path.join(__dirname, "..", "js/ai.js"), "utf8"));
  hire(run);
  run(`
    const executive = c.candidates["임원"][0];
    askCandidate(c, "임원", executive.id, "motivation"); hireCandidate(c, "임원", executive.id);
    c.events = [{ type: "위기", title: "주문", text: "처리하세요" }];
    c.rounds[0] = { order: "고객 주문 처리", result: null };
  `);
  assert.equal(run('usePower(c, "direct")'), null);
  assert.equal(run("transmissionStaff(c).length"), 1);
  assert.equal(run("transmissionStaff(c)[0].id"), run("employee.id"));
  assert.doesNotMatch(run("buildEventRequest()"), /"rank":"임원"/);
  run('c.rounds[0].chain = transmissionStaff(c).map(x => x.id); practiceEvent();');
  assert.equal(run("c.rounds[0].result.down.length"), 1);
  run('applyEvent(JSON.stringify({ down: [{ say: "처리해", lie: false }], up: [{ say: "처리함", lie: false }], score: 80 }), "테스트"); settleRound(c, "praise");');
  assert.equal(run("c.rounds[0].result.up.length"), 1);
  assert.equal(run("c.rounds[0].cost"), run("(employee.salary + executive.salary) * COST_PER_SALARY"));
});

test("현장 출동은 보고 후 결산 전에만 쓰고 결과를 바꾸지 않는다", () => {
  const run = setup();
  hire(run);
  run('c.rounds[0] = { result: { score: 59, action: "실제 업무", audit: "감춘 사실" } };');
  assert.match(run('usePower(c, "dinner")'), /지시 전/);
  assert.equal(run('usePower(c, "visit")'), null);
  assert.equal(run("c.rounds[0].result.score"), 59);
  run('settleRound(c, "dig")');
  assert.match(run('usePower(c, "visit")'), /진행 중/);
});

test("추리 단서는 점수·진실 원문을 노출하지 않고 성공·실패 경계에서 겹친다", () => {
  const run = setup();
  const a = run('JSON.stringify(cluesFor({ result: { score: 59, action: "비밀 실제 업무", audit: "비밀 감사", up: [{ lie: true }] } }))');
  const b = run('JSON.stringify(cluesFor({ result: { score: 60, action: "다른 업무", up: [{ lie: true }] } }))');
  assert.equal(a, b);
  assert.doesNotMatch(a, /59|60|비밀|실패|성공/);
});

for (const [strategy, score, expected] of [
  ["safe", 0, 4000], ["safe", 100, 6000],
  ["venture", 0, 0], ["venture", 69, 2900], ["venture", 70, 11000], ["venture", 100, 14000]
]) {
  test(`마지막 분기 ${strategy} 전략의 성과 ${score}점 매출은 ${expected}만원이다`, () => {
    const run = setup();
    hire(run);
    run('c.rounds[0] = { result: null };');
    assert.equal(run(`setFinalStrategy(c, "${strategy}")`), false);
    run('game.round = 3; c.rounds[3] = { result: null };');
    assert.equal(run(`setFinalStrategy(c, "${strategy}")`), true);
    run(`c.rounds[3].result = { score: ${score} }; settleRound(c, "dig");`);
    assert.equal(run("c.rounds[3].revenue"), expected);
    assert.equal(run("c.rounds[3].baseRevenue + c.rounds[3].strategyDelta"), expected);
    assert.equal(run('setFinalStrategy(c, "safe")'), false);
  });
}

test("영업 중단 분기에는 최종 안전 전략의 최소 매출도 발생하지 않는다", () => {
  const run = setup();
  hire(run);
  run('game.round = 3; c.rounds[3] = { result: null, strategy: "safe" }; employee.quit = true; closeUnstaffedRound(c);');
  assert.equal(run("c.rounds[3].revenue"), 0);
  assert.equal(run("c.rounds[3].profit"), -9000);
});

test("수익·충성심·선택에 따른 엔딩과 공유 문구를 일관되게 만든다", () => {
  const run = setup();
  hire(run);
  run('c.rounds = Array.from({ length: 4 }, () => ({ profit: 1000, choice: "praise", success: true })); employee.loyalty = 8;');
  assert.equal(run("endingFor(c).id"), "happy");
  assert.match(run("endingShareText(c)"), /1년 4턴 결산/);
  assert.match(run("endingShareText(c)"), /\+4,000만원/);
  run('c.rounds[3].strategy = "venture"; c.rounds[3].strategyDelta = 4000;');
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
