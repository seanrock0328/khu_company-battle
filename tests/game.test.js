// 실행: node --test tests/game.test.js (추가 라이브러리 불필요)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
  const saved = new Map();
  const context = vm.createContext({
    URL, URLSearchParams,
    location: new URL("file:///C:/game/index.html"),
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

test("전원 퇴사 후에도 8분기를 마치고 마지막 근무 분기의 급여를 지급한다", () => {
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
  assert.equal(run("c.rounds.length"), 8);
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
  assert.equal(run("totalProfit(c)"), -72000);
  assert.equal(run("c.rounds.every(r => r.revenue === 0 && r.cost === 0 && r.penalty === 9000 && r.profit === -9000)"), true);
  assert.match(run("c.rounds[0].loyaltyNote"), /임대료와 위약금 −9,000만원/);
});

function simulate(scores, choices, salary = 14) {
  const run = setup();
  hire(run);
  run(`employee.salary = ${salary}; c.funding = "vc";`);
  for (let i = 0; i < 8; i++) {
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

test("코멘트의 5회 연속 추궁 전략이 정상 경영보다 불리하다", () => {
  // 인건비 합 14: 첫 5분기 성과 70점이면 2억 1,000만원, 이후 중단 손실 2억 7,000만원.
  const closed = simulate(Array(8).fill(70), Array(8).fill("dig"));
  const scores = [20, 90, 30, 70, 35, 40, 49, 40];
  const normal = simulate(scores, scores.map(s => s >= 60 ? "praise" : "dig"));
  assert.equal(closed, -6000);
  assert.equal(normal, 15000);
  assert.ok(normal > closed);
});

test("영업 중단으로 정상 경영의 최악 손실도 피할 수 없다", () => {
  const run = setup();
  assert.ok(run("CLOSED_PENALTY > Math.max(...FUNDING.map(f => f.budget)) * COST_PER_SALARY + PRAISE_FAIL_PENALTY"));
  for (const salary of [14, 18, 22, 28]) {
    for (const score of [0, 20, 59, 60, 70, 100]) {
      // 첫 5분기 성과는 같게 고정. 추궁으로 퇴사시킨 경우와 직원을 유지한 경우를 비교.
      const scores = [...Array(5).fill(70), ...Array(3).fill(score)];
      const closed = simulate(scores, Array(8).fill("dig"), salary);
      const normal = simulate(scores, Array(8).fill("praise"), salary);
      assert.ok(normal > closed, `인건비 ${salary}, 남은 분기 성과 ${score}`);
    }
  }
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

test("순위표는 현재 업종으로 걸러내며 다른 업종의 기록도 보관한다", () => {
  const run = setup();
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

test("index.html을 직접 열어도 유효한 업종 공유 링크를 만든다", () => {
  const run = setup();
  run('setSeason("붕어빵 프랜차이즈", "🐟")');
  const url = new URL(run("seasonLink()"));
  assert.equal(url.protocol, "file:");
  assert.equal(url.pathname, "/C:/game/index.html");
  assert.equal(url.searchParams.get("industry"), "붕어빵 프랜차이즈");
});
