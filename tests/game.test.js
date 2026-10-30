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
  for (const file of ["data/presets.js", "js/game.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  return code => vm.runInContext(code, context);
}

function hire(run) {
  run(`
    const c = game.company;
    c.funding = "parents";
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

test("직원이 4명보다 적으면 업무를 시작할 수 없고, 부모님 돈으로도 4명은 항상 뽑을 수 있다", () => {
  const run = setup();
  hire(run); // 사원 1명
  assert.equal(run("MIN_STAFF"), 4);
  assert.match(run("checkStaffing(c)"), /4명 이상.*지금 1명/);
  run(`
    for (const rank of ["차장", "과장", "대리"]) {
      const x = c.candidates[rank][0];
      askCandidate(c, rank, x.id, "motivation");
      hireCandidate(c, rank, x.id);
    }
  `);
  assert.equal(run("checkStaffing(c)"), null);
  // 가장 비싼 후보로만 골라도 아래 4직급은 부모님 예산(18) 안에 들어온다
  for (let i = 0; i < 200; i++) {
    run(`
      c.funding = "parents"; makeCandidates(c);
      var hireErrors = HIRE_RANKS.slice(-MIN_STAFF).map(rank => {
        const x = [...c.candidates[rank]].sort((a, b) => b.salary - a.salary)[0];
        askCandidate(c, rank, x.id, "motivation");
        return hireCandidate(c, rank, x.id);
      });
    `);
    assert.equal(run("JSON.stringify(hireErrors)"), "[null,null,null,null]");
    assert.equal(run("checkStaffing(c)"), null);
  }
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
  assert.equal(run("CLOSED_PENALTY"), 10000);
  assert.equal(run("totalProfit(c)"), -40000);
  assert.equal(run("c.rounds.every(r => r.revenue === 0 && r.cost === 0 && r.penalty === 10000 && r.profit === -10000)"), true);
  assert.match(run("c.rounds[0].loyaltyNote"), /임대료와 위약금 −1억원/);
});

function simulate(scores, choices, salary = 14, loyalty = 5) {
  const run = setup();
  hire(run);
  run(`employee.salary = ${salary}; employee.loyalty = ${loyalty}; c.funding = "lottery";`);
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
  // 낮은 충성심 2인 상황을 고정: 2분기 근무 수익 8,400 - 중단 2분기 손실 20,000.
  const closed = simulate(Array(4).fill(70), Array(4).fill("dig"), 14, 2);
  const scores = [20, 90, 30, 70];
  const normal = simulate(scores, scores.map(s => s >= 60 ? "praise" : "dig"));
  assert.equal(closed, -11600);
  assert.equal(normal, 9800);
  assert.ok(normal > closed);
});

test("영업 중단으로 정상 경영의 최악 손실도 피할 수 없다", () => {
  const run = setup();
  assert.ok(run("CLOSED_PENALTY > Math.max(...FUNDING.map(f => f.budget)) * COST_PER_SALARY + PRAISE_FAIL_PENALTY + DINNER_COST + INVESTMENT_COST - INVESTMENT_LOSS"));
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

test("이벤트 요청문은 게임의 성공선과 점수 구간을 알려 주고 서로 모순되지 않는다", () => {
  const run = setup();
  run(fs.readFileSync(path.join(__dirname, "..", "js/ai.js"), "utf8"));
  hire(run);
  run('c.events = [{ type: "위기", title: "주문 폭주", text: "주문이 밀렸다" }]; c.rounds[0] = { order: "오늘 안에 처리해", result: null, investment: 1000 };');
  const prompt = run("buildEventRequest()");
  assert.match(prompt, /10자 사원 주식회사/);
  assert.ok(prompt.includes(`${run("SUCCESS_LINE")}점 이상을 "잘 수행함", ${run("SUCCESS_LINE") - 1}점 이하를 "수행 실패"`));
  assert.doesNotMatch(prompt, /재미와 반전 20점/);
  assert.doesNotMatch(prompt, /최종 전략/); // 최종 전략은 투자 선택으로 바뀜
  for (const field of ["down", "action", "up", "score", "news", "reason", "audit", "say", "lie"]) {
    assert.ok(prompt.includes(`"${field}":`), field);
  }
});

test("요청문에 넣는 AI 글(이벤트·뉴스)은 길이를 잘라서, AI가 길이 규칙을 어겨도 요청문이 끝없이 길어지지 않는다", () => {
  const run = setup();
  run(fs.readFileSync(path.join(__dirname, "..", "js/ai.js"), "utf8"));
  hire(run);
  run(`
    c.events = EVENT_ORDER.map(type => ({ type, title: "가".repeat(500), text: "나".repeat(5000) }));
    for (let i = 0; i < 3; i++) c.rounds[i] = { order: "처리", result: { score: 70, news: "다".repeat(5000) }, choice: "praise" };
    game.round = 3; c.rounds[3] = { order: "처리", result: null };
  `);
  const prompt = run("buildEventRequest()");
  assert.ok(prompt.length < 4000, `요청문 ${prompt.length}자`);
  assert.equal(run('c.events[0].title.length'), 500); // 화면에 보이는 글은 그대로
});

test("AI 점수가 비었거나 숫자가 아니면 오류로 돌려보내고, 0~1 소수는 100점 만점으로 바꾼다", () => {
  const run = setup();
  run(fs.readFileSync(path.join(__dirname, "..", "js/ai.js"), "utf8"));
  hire(run);
  run('c.events = [{ type: "기회", title: "방송", text: "출연 제안" }]; c.rounds[0] = { order: "출연해", result: null };');
  const apply = extra => run(`applyEvent(${JSON.stringify(JSON.stringify({ down: [{ say: "출연해" }], up: [{ say: "했음" }], ...extra }))}, "테스트"); c.rounds[0].result.score`);
  for (const [score, expected] of [[0.85, 85], ["72", 72], [" 64점 ", 64], [1, 1], [0, 0], [150, 100], [-5, 0]]) {
    assert.equal(apply({ score }), expected, JSON.stringify(score));
  }
  run("c.rounds[0].result = null");
  for (const bad of [{ score: null }, { score: "" }, { score: " " }, {}, { score: "높음" }, { score: true }, { score: [80] }]) {
    assert.throws(() => apply(bad), /성과 점수\(score\)/, JSON.stringify(bad));
    assert.equal(run("c.rounds[0].result"), null); // 실패하면 결과를 남기지 않아 다시 시도할 수 있다
  }
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
  assert.match(clues(0, 59, true, "서버 다운")[0], /\('서버 다운' 건\)/);
  assert.doesNotMatch(clues(0, 59, true, "아주 긴 이벤트 제목이 여기까지 이어집니다")[0], /건\)/);
  assert.notDeepEqual(clues(0, 59, true, "서버 다운"), JSON.parse(run('JSON.stringify(cluesFor({ result: { score: 59, up: [{ lie: true }] } }, { seed: "판-8", quarter: 0, event: { title: "서버 다운" } }))')));
});

test("모든 추리 단서 문장은 점수 숫자나 성공·실패를 직접 말하지 않는다", () => {
  const run = setup();
  const all = JSON.parse(run("JSON.stringify([...CLUE_RESULT.flatMap(x => [...x.low, ...x.mid, ...x.high]), ...CLUE_PROCESS.flatMap(x => [...x.lie, ...x.honest])])"));
  assert.ok(all.length >= 50);
  for (const text of all) assert.doesNotMatch(text, /\d|성공|실패|점수/);
});

for (const [score, returned] of [[0, 500], [59, 500], [60, 1600], [100, 1600]]) {
  test(`성과 ${score}점일 때 투자금 회수는 ${returned}만원이며 원금을 한 번만 정산한다`, () => {
    const run = setup();
    hire(run);
    run('c.initialCash = 10000; c.rounds[0] = { result: null, investment: 0 };');
    assert.equal(run('setInvestment(c, true)'), null);
    assert.equal(run('setInvestment(c, true)'), null);
    assert.equal(run('cashBalance(c)'), 10000); // 지출 예약은 실제 잔액에서 중복 차감하지 않음
    run(`c.rounds[0].result = { score: ${score} }; settleRound(c, "dig"); settleRound(c, "dig");`);
    assert.equal(run('c.rounds[0].investmentCost'), 1000);
    assert.equal(run('c.rounds[0].investmentReturn'), returned);
    assert.equal(run('c.rounds[0].profit'), run(`${score} * 100 + ${returned} - 1000 - employee.salary * 200`));
    assert.equal(run('cashBalance(c)'), run('10000 + totalProfit(c)'));
    assert.match(run('setInvestment(c, false)'), /지시/);
  });
}

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
  assert.match(run("endingShareText(c)"), /1년 4턴 결산/);
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
  run('c.initialCash = employee.salary * 200 + 1200; c.rounds[0] = { result: null, investment: 0 };');
  assert.equal(run('usePower(c, "dinner")'), null);
  assert.match(run('setInvestment(c, true)'), /부족/);
  assert.equal(run('setInvestment(c, false)'), null);
  run('c.initialCash = employee.salary * 200 + 1300;');
  assert.equal(run('setInvestment(c, true)'), null);
  assert.equal(run('availableCash(c)'), 0);
  run('c.rounds[0].committed = true;');
  assert.match(run('setInvestment(c, false)'), /지시/);
});

test("긴급 용돈은 한 번만 입금되고 순이익에는 포함하지 않는다", () => {
  const run = setup();
  hire(run);
  run('c.initialCash = 1000; c.rounds[0] = { result: { score: 0 } }; settleRound(c, "praise");');
  assert.equal(run('c.rounds[0].support'), 4000);
  assert.equal(run('cashBalance(c)'), run('1000 + totalProfit(c) + 4000'));
  run('game.round = 1; c.rounds[1] = { result: { score: 0 } }; settleRound(c, "praise");');
  assert.equal(run('c.rounds[1].support'), 0);
  assert.equal(run('totalSupport(c)'), 4000);
  assert.equal(run('cashBalance(c) - initialCapital(c) - totalSupport(c)'), run('totalProfit(c)'));
});

test("현금이 마이너스여도 급여는 정산하고 새 투자는 막되 그대로 운영할 수 있다", () => {
  const run = setup();
  hire(run);
  run('c.funding = "lottery"; c.initialCash = 0; c.rounds[0] = { result: { score: 0 } }; settleRound(c, "dig");');
  assert.equal(run('cashBalance(c)'), run('-employee.salary * 200'));
  run('game.round = 1; c.rounds[1] = { result: null, investment: 0 };');
  assert.match(run('setInvestment(c, true)'), /부족/);
  assert.equal(run('setInvestment(c, false)'), null);
  assert.match(run('usePower(c, "dinner")'), /부족/);
});

test("모든 분기의 입출금과 잔액이 맞고 직전 마감이 다음 기초가 된다", () => {
  const run = setup();
  hire(run);
  run(`c.initialCash = 8000;
    for (game.round = 0; game.round < ROUNDS; game.round++) {
      c.rounds[game.round] = { result: null, investment: 0 };
      if (game.round % 2 === 0) setInvestment(c, true);
      c.rounds[game.round].result = { score: game.round < 2 ? 70 : 20 };
      settleRound(c, "dig");
    }
  `);
  assert.equal(run('financeHistory(c).every(r => r.opening + r.income - r.expense === r.closing)'), true);
  assert.equal(run('financeHistory(c).slice(1).every((r, i) => r.opening === financeHistory(c)[i].closing)'), true);
  assert.equal(run('financeHistory(c)[3].closing'), run('cashBalance(c)'));
  assert.equal(run('cashBalance(c) - initialCapital(c) - totalSupport(c)'), run('totalProfit(c)'));
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
    run(`applyFounding(JSON.stringify({ news: "창업", events: EVENT_ORDER.map(type => ({ type, title: "이벤트", text: "내용" })),
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
  run('game.round = 2; applyEvent(JSON.stringify({ down: [], up: [], score: 100 }), "");');
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

test("서버 순위표 수익 범위는 지금 4분기 통장 규칙으로 나올 수 있는 최고·최저와 맞다", () => {
  const server = workerSetup();
  const rules = setup();
  assert.equal(server.run("MAX_PROFIT"), rules("ROUNDS * (100 * REVENUE_PER_POINT + INVESTMENT_WIN - INVESTMENT_COST)"));
  assert.equal(server.run("MIN_PROFIT"), rules("-ROUNDS * CLOSED_PENALTY"));
  // 실제로 해 본 최고 판: 4분기 100점 + 매 분기 투자 성공, 연봉 1인 직원 한 명
  hire(rules);
  rules(`
    employee.salary = 1; c.initialCash = 14000;
    for (game.round = 0; game.round < ROUNDS; game.round++) {
      c.rounds[game.round] = { result: null, investment: 0 };
      setInvestment(c, true);
      c.rounds[game.round].result = { score: 100 };
      settleRound(c, "praise");
    }
  `);
  assert.equal(rules("c.rounds.every(r => r.investmentCost === 1000)"), true);
  assert.ok(rules("totalProfit(c)") <= server.run("MAX_PROFIT"));
  // 손실을 가장 크게 잡은 판: 최대 인건비 + 회식 + 매 분기 투자 실패 + 4분기 0점 칭찬
  const worst = setup();
  hire(worst);
  worst(`
    c.funding = "lottery"; employee.salary = 28;
    for (game.round = 0; game.round < ROUNDS; game.round++) {
      c.rounds[game.round] = { result: null, investment: 1000 };
      if (game.round === 0) usePower(c, "dinner");
      c.rounds[game.round].result = { score: 0 };
      settleRound(c, "praise");
    }
  `);
  assert.ok(worst("totalProfit(c)") >= server.run("MIN_PROFIT"));
});

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
    entries: [{ player: "A", name: "가", industry: "붕어빵", profit: 1000, at: 1700000000001, news: "통장 결산 · A" }],
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
  server.entries.push({ player: "B", name: "나", industry: "AI", profit: 40000, at: 1700000000002, news: "통장 결산 · B" });
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
