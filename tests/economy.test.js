const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup(type = "sales", positioning = "balanced") {
  const saved = new Map();
  const context = vm.createContext({ URL, URLSearchParams, location: new URL("file:///C:/game/index.html"),
    localStorage: { getItem:k => saved.get(k), setItem:(k,v) => saved.set(k,v), removeItem:k => saved.delete(k) } });
  const run = code => vm.runInContext(code, context);
  for (const f of ["data/presets.js", "js/game.js", "js/economy.js", "js/ai.js"]) run(fs.readFileSync(path.join(__dirname, "..", f), "utf8"));
  run(`
    const c = game.company;
    c.name="실험 회사"; c.player="사장"; c.industry="회사"; c.detail="학생을 위한 무료 앱"; c.motto="편하게 쓰자";
    c.initialCash=10000; c.foundingByAI=true;
    c.business=makeBusiness(${JSON.stringify({ type, positioning })});
    makeCandidates(c);
    HIRE_RANKS.forEach((rank,i) => { const x=c.candidates[rank][0]; Object.assign(x,{skill:8,luck:5,loyalty:10,honesty:8,secure:80,salary:[4,3,3,2,1,1][i],name:"직원"+i}); c.hires[rank]=x.id; });
    c.events=EVENT_ORDER.map(type => ({type,title:"시장 변화",text:"고객 수요가 바뀐다"}));
    Math.random = () => 0.5;
    function begin(action = emptyAction()) {
      c.rounds[game.round]={order:"요금 10% 올려",result:null,investment:0,committed:true};
      prepareBusinessRound(c);
      applyPlan(JSON.stringify({action}),"테스트");
      applyEvent(JSON.stringify({down:[],up:[],score:999999,profit:999999}),"테스트");
    }
    function guess(correct=true) {
      const r=c.rounds[game.round];
      r.guess=r.guessOptions.findIndex(a=>sameAction(a,r.execution.action)===correct);
    }
  `);
  return run;
}

for (const type of ["sales", "service", "subscription", "ads", "commission"]) {
  test(`${type}: 실제 수량과 단가로 매출을 계산하고 원가·급여를 뺀다`, () => {
    const run=setup(type);
    run("begin()");
    assert.equal(run("c.rounds[0].economics.revenue"), 9000);
    assert.equal(run("c.rounds[0].economics.variableCost"), 2250);
    assert.equal(run("c.rounds[0].economics.operatingProfit"), 1450);
    run('guess(); settleRound(c,"praise")');
    assert.equal(run("c.rounds[0].profit"),1550);
    assert.equal(run("cashBalance(c)"),11550);
    assert.equal(run("c.rounds[0].judgmentBonus"),100);
  });
}

test("할인에 민감한 고객은 판매량 증가로 이익이 늘고, 고급 고객은 할인 효과가 작다", () => {
  const value=setup("sales","value"), premium=setup("sales","premium");
  const difference=run=>run('calculateBusiness(c,{...emptyAction(),price:-10}).operatingProfit - calculateBusiness(c,emptyAction()).operatingProfit');
  assert.ok(difference(value)>0);
  assert.ok(difference(premium)<0);
});

test("광고를 줄이면 이용자 증가가 노출 감소를 넘어서 더 벌 수도 있다", () => {
  const run=setup("ads");
  run('const baseline=calculateBusiness(c,emptyAction()); const fewer=calculateBusiness(c,{...emptyAction(),ads:-20}); const more=calculateBusiness(c,{...emptyAction(),ads:20});');
  assert.ok(run("fewer.served > baseline.served && fewer.quantity > baseline.quantity"));
  assert.ok(run("fewer.operatingProfit > baseline.operatingProfit"));
  assert.ok(run("more.operatingProfit < baseline.operatingProfit"));
});

test("직원 수와 능력이 처리 한도를 바꾸며 고객이 무한히 늘지 않는다", () => {
  const run=setup("service");
  run('const full=calculateBusiness(c,{...emptyAction(),price:-30,marketing:30}); HIRE_RANKS.slice(1).forEach(k=>c.hires[k]=null); const one=calculateBusiness(c,{...emptyAction(),price:-30,marketing:30});');
  assert.ok(run("full.served > one.served"));
  assert.ok(run("one.served <= one.capacity && one.served < one.demand"));
});

test("회사 설명을 상품·서비스·구독·광고·중개로 해석하며 잘못된 모델은 거절한다", () => {
  const run=setup();
  for(const [detail,type] of [["학생 무료 앱 광고","ads"],["매월 구독 앱","subscription"],["청소 대행","service"],["중개 수수료","commission"],["고급 도시락","sales"]]) {
    assert.equal(run(`practiceBusiness({detail:${JSON.stringify(detail)},industry:"",motto:""}).type`),type);
  }
  assert.throws(()=>run('makeBusiness({type:"무한 현금",positioning:"value"})'), /수익모델/);
  assert.throws(()=>run('makeBusiness({type:"toString",positioning:"value"})'), /수익모델/);
});

test("숫자 없는·잘못된 계획은 오류이며 큰 지시와 실행비는 허용 범위로 줄인다", () => {
  const run=setup();
  for(const value of [null,"10",Infinity,NaN]) {
    assert.throws(()=>run(`normalizeAction({...emptyAction(),price:${typeof value==='string'?JSON.stringify(value):String(value)}},c,1000)`), /수치/);
  }
  assert.throws(()=>run("normalizeAction({},c,1000)"),/수치/);
  run('const adjusted=normalizeAction({price:1000000,ads:20,marketing:30,quality:30,efficiency:30,capacity:30},c,900);');
  assert.equal(run("adjusted.action.price"),30);
  assert.equal(run("adjusted.action.ads"),0);
  assert.ok(run("actionSpend(adjusted.action)<=900 && adjusted.notes.length>=3"));
});

test("충성심이 높은 직원은 같은 주사위에서 지시를 지키고 낮으면 바꾼다", () => {
  const run=setup("ads");
  run(`
    c.rounds[0]={order:"광고 20% 늘려",result:null}; prepareBusinessRound(c);
    c.rounds[0].executionRolls.forEach(r=>{r.follow=0.9;r.change=0.1;});
    staffOf(c)[0].loyalty=1;
    applyPlan(JSON.stringify({action:{...emptyAction(),ads:20}}),"테스트");
  `);
  assert.equal(run("c.rounds[0].execution.action.ads"),-20);
  assert.equal(run("c.rounds[0].execution.followed"),false);
  assert.ok(run("c.rounds[0].economics.operatingProfit > calculateBusiness(c,{...emptyAction(),ads:20},0,c.rounds[0].marketRoll).operatingProfit"));
  assert.ok(run("followChance({...staffOf(c)[0],loyalty:10})>0.9 && followChance({...staffOf(c)[0],loyalty:1})<0.9"));
});

test("칭찬·추궁과 행동 정답 여부는 회사 매출·영업이익을 바꾸지 않는다", () => {
  const results=[];
  for(const choice of ["praise","dig"]) for(const correct of [true,false]) {
    const run=setup();
    run(`begin({...emptyAction(),price:10}); guess(${correct}); settleRound(c,"${choice}");`);
    results.push(JSON.parse(run('JSON.stringify({revenue:c.rounds[0].revenue,operation:c.rounds[0].operatingProfit,profit:c.rounds[0].profit,bonus:c.rounds[0].judgmentBonus})')));
    assert.equal(run("staffOf(c)[0].loyalty"), choice==="praise"?10:9);
  }
  assert.equal(new Set(results.map(r=>r.revenue)).size,1);
  assert.equal(new Set(results.map(r=>r.operation)).size,1);
  assert.equal(results[0].profit-results[1].profit,100);
  assert.equal(results[0].profit,results[2].profit);
});

test("재시도·JSON 저장 복원은 행동·추리 선택지·주사위·실행비를 다시 뽑지 않는다", () => {
  const run=setup();
  run('begin({...emptyAction(),quality:20}); const snapshot=JSON.stringify(c.rounds[0]); c.rounds[0]=JSON.parse(snapshot); Math.random=()=>0.99; prepareBusinessRound(c); executePlan(c); applyPlan(JSON.stringify({action:{...emptyAction(),price:30}}),"테스트");');
  assert.equal(run("JSON.stringify(c.rounds[0])"),run("snapshot"));
  run('guess(); settleRound(c,"praise"); const cash=cashBalance(c), loyalty=staffOf(c)[0].loyalty; settleRound(c,"dig");');
  assert.equal(run("cashBalance(c)"),run("cash"));
  assert.equal(run("staffOf(c)[0].loyalty"),run("loyalty"));
});

test("가격·시설·고객 유지 효과는 다음 분기로 이어지고 과거 장부는 고정된다", () => {
  const run=setup("subscription");
  run('begin({...emptyAction(),price:10,quality:10}); guess(); settleRound(c,"praise"); const saved=JSON.stringify(c.rounds[0]); game.round=1; begin();');
  assert.equal(run("c.rounds[1].economics.before.price"),1.1);
  assert.equal(run("c.rounds[1].economics.before.customers"),run("c.rounds[0].economics.after.customers"));
  assert.equal(run("JSON.stringify(c.rounds[0])"),run("saved"));
});

test("정직도는 보고 확률에만, 업무 점수는 돈에 영향을 주지 않는다", () => {
  const run=setup();
  run('begin(); const cash=JSON.stringify(c.rounds[0].economics); c.rounds[0].result=null; applyEvent(JSON.stringify({down:[],up:[],score:0,revenue:0}),"테스트");');
  assert.equal(run("JSON.stringify(c.rounds[0].economics)"),run("cash"));
  assert.equal(run("c.rounds[0].result.score"),undefined);
  assert.ok(run('buildEventRequest().includes("점수나 수익을 판정하지 마라")'));
});

test("이미 요금 하한이면 추가 할인은 실제 행동에서 제외하고 이유를 알린다", () => {
  const run=setup();
  run('begin({...emptyAction(),price:-30}); guess(); settleRound(c,"praise"); game.round=1; begin({...emptyAction(),price:-30});');
  assert.equal(run("c.rounds[1].plan.action.price"),0);
  assert.ok(run('c.rounds[1].plan.notes.some(x=>x.includes("누적 운영 한도"))'));
});

test("낮은 정직도는 다른 실행을 숨기는 보고를 늘리지만 실제 손익은 같다", () => {
  const outcomes=[];
  for(const honesty of [1,10]){
    const run=setup();
    run(`staffOf(c).forEach(x=>{x.honesty=${honesty};x.loyalty=1;});
      c.rounds[0]={order:"인상",result:null}; prepareBusinessRound(c);
      c.rounds[0].executionRolls.forEach((r,i)=>{r.follow=i===0?1:0;r.change=0.1;r.honest=0.6;});
      applyPlan(JSON.stringify({action:{...emptyAction(),price:10}}),"테스트");
      applyEvent(JSON.stringify({down:[],up:[]}),"테스트");`);
    outcomes.push(run("c.rounds[0].economics.operatingProfit"));
    assert.equal(run("c.rounds[0].result.up.every(x=>x.lie)"),honesty===1);
  }
  assert.equal(outcomes[0],outcomes[1]);
});

test("투자는 추리·충성심이 아닌 실제 영업이익의 흑자 여부로 회수한다", () => {
  for(const [salary,expected] of [[1,1600],[5,500]]) {
    const run=setup();
    run(`staffOf(c).forEach(x=>x.salary=${salary}); begin(); c.rounds[0].investment=1000; guess(false); settleRound(c,"praise");`);
    assert.equal(run("c.rounds[0].investmentReturn"),expected);
    assert.equal(run("c.rounds[0].profit"),run("c.rounds[0].operatingProfit + c.rounds[0].investmentReturn - 1000"));
  }
});

test("회식·직통·현장 출동은 기존 1회 제한과 모든 직원 급여를 지킨다", () => {
  for(const power of ["dinner","direct","visit"]) {
    const run=setup();
    run('staffOf(c).forEach(x=>x.loyalty=5); c.rounds[0]={order:"요금 올려",result:null};');
    if(power!=="visit") assert.equal(run(`usePower(c,"${power}")`),null);
    run('prepareBusinessRound(c); applyPlan(JSON.stringify({action:emptyAction()}),"테스트"); applyEvent(JSON.stringify({down:[],up:[]}),"테스트");');
    if(power==="visit") assert.equal(run('usePower(c,"visit")'),null);
    assert.equal(run("c.rounds[0].result.down.length"),power==="direct"?1:6);
    assert.equal(run("c.rounds[0].economics.payrollCost"),2800);
    assert.match(run('usePower(c,"visit")'),/한 번/);
    run('guess(); settleRound(c,"praise");');
    assert.equal(run("c.rounds[0].powerCost"),power==="dinner"?300:0);
  }
});

test("4분기 입출금·지원금·보너스가 통장과 일치하고 구형 규칙 기록을 분리한다", () => {
  const run=setup();
  run(`c.funding="parents"; c.initialCash=0; staffOf(c).forEach((x,i)=>x.salary=[6,5,5,5,4,3][i]);
    for(game.round=0;game.round<ROUNDS;game.round++) { begin({...emptyAction(),price:-30}); guess(game.round%2===0); settleRound(c,"dig"); }
  `);
  assert.equal(run("totalSupport(c)"),4000);
  assert.equal(run("financeHistory(c).every(r=>r.opening+r.income-r.expense===r.closing)"),true);
  assert.equal(run("financeHistory(c).slice(1).every((r,i)=>r.opening===financeHistory(c)[i].closing)"),true);
  assert.equal(run("cashBalance(c)"),run("initialCapital(c)+totalProfit(c)+totalSupport(c)"));
  assert.equal(run("c.rounds.reduce((n,r)=>n+r.judgmentBonus,0)"),200);
  run('localStorage.setItem("company_battle_leaderboard_v6",JSON.stringify([{profit:999999}]));');
  assert.equal(run("loadBoard().length"),0);
  run("recordResult(c)");
  assert.ok(run('loadBoard()[0].news.startsWith("사업 수익 v2 · ")'));
});

test("여러 업종·전략의 4분기 수익이 수정하지 않은 서버 허용 범위 안에 든다", () => {
  for(const type of Object.keys({sales:1,service:1,ads:1,subscription:1,commission:1})) {
    const run=setup(type);
    const bounds=JSON.parse(run(`JSON.stringify((()=>{
      let min=Infinity,max=-Infinity,seed=37;
      const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      for(let trial=0;trial<120;trial++){
        c.rounds=[]; c.initialCash=14000; c.powerUsed=null;
        staffOf(c).forEach((x,i)=>{x.loyalty=10;x.salary=[6,5,5,5,4,3][i];});
        for(game.round=0;game.round<4;game.round++){
          const a=Object.fromEntries(ACTION_FIELDS.map(k=>[k,Math.round(rnd()*60-30)]));
          begin(a); c.rounds[game.round].investment=1000;
          if(game.round===0)c.rounds[game.round].powerCost=300;
          guess(); settleRound(c,"praise");
        }
        min=Math.min(min,totalProfit(c)); max=Math.max(max,totalProfit(c));
      }
      return {min,max};
    })())`));
    assert.ok(bounds.min>=-40000 && bounds.max<=42400,`${type}: ${JSON.stringify(bounds)}`);
  }
});

test("직원 대화가 와전되면 말단 사원이 들은 말대로 한 행동으로 손익을 계산한다", () => {
  const run = setup();
  run(`c.rounds[0] = { order: "요금 10% 내려", result: null }; prepareBusinessRound(c);
    applyPlan(JSON.stringify({ action: { ...emptyAction(), price: -10 } }), "테스트");
    var n = c.rounds[0].chain.length;
    var down = Array.from({ length: n }, (_, k) => ({ say: k < n - 1 ? "요금 내려" : "홍보해", lie: k === 1 }));`);
  run(`applyEvent(JSON.stringify({ down, actual: { price: 0, ads: 0, marketing: 10, quality: 0, efficiency: 0, capacity: 0 }, up: [] }), "테스트");`);
  assert.equal(run("c.rounds[0].execution.action.marketing"), 10);
  assert.equal(run("c.rounds[0].execution.action.price"), 0);
  assert.equal(run("c.rounds[0].execution.followed"), false);
  assert.equal(run("c.rounds[0].result.down[1].lie"), true);
  assert.equal(run("c.rounds[0].economics.operatingProfit"), run("calculateBusiness(c, c.rounds[0].execution.action, 0, c.rounds[0].marketRoll).operatingProfit"));
  // 실제 행동 숫자가 없으면 마지막 직원이 들은 말("홍보해")을 해석한다
  run(`c.rounds[0].result = null; applyEvent(JSON.stringify({ down, up: [] }), "테스트");`);
  assert.equal(run("c.rounds[0].execution.action.marketing"), 10);
  assert.equal(run("c.rounds[0].execution.action.price"), 0);
});

test("연습 모드도 말이 와전되며 내려가고, 일부러 '쉬어도 된대'로 바뀌면 말단은 아무것도 안 한다", () => {
  const run = setup();
  run(`staffOf(c).forEach(x => { x.honesty = 1; });
    c.rounds[0] = { order: "요금 10% 내려", result: null }; prepareBusinessRound(c);
    c.rounds[0].executionRolls.forEach(r => { r.change = 0; r.follow = 0; });
    applyPlan(JSON.stringify({ action: { ...emptyAction(), price: -10 } }), "");
    practiceEvent();`);
  assert.equal(run("actionLabel(c.rounds[0].execution.action)"), "기존 방식 유지");
  assert.equal(run("c.rounds[0].execution.followed"), false);
  assert.ok(run("c.rounds[0].result.down.every(x => x.lie)"));
});
