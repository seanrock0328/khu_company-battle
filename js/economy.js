// 회사의 돈은 이 계산기로만 정합니다. AI는 사업 종류와 지시의 뜻, 직원 말투를 해석합니다.
// 금액 단위: 만원. 창업 수요 × 단가는 모든 모델에서 1억원으로 맞춥니다.
const BUSINESS_TYPES = {
  sales: { name: "상품 판매", unit: "개", quantity: 10000, price: 1, formula: "판매량 × 판매가" },
  service: { name: "서비스·대행", unit: "건", quantity: 100, price: 100, formula: "완료한 계약 × 계약 요금" },
  subscription: { name: "구독", unit: "명", quantity: 2000, price: 5, formula: "유료 구독자 × 분기 구독료" },
  ads: { name: "광고", unit: "회", quantity: 1000000, price: 0.01, formula: "광고 노출 × 광고 단가" },
  commission: { name: "중개 수수료", unit: "건", quantity: 1000, price: 10, formula: "성사된 거래 × 건당 수수료" }
};
const ACTION_FIELDS = ["price", "ads", "marketing", "quality", "efficiency", "capacity"];
const ACTION_NAMES = { price: "요금", ads: "광고량", marketing: "홍보", quality: "품질", efficiency: "원가 절감", capacity: "처리 시설" };
const JUDGMENT_BONUS = 100;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function makeBusiness(spec) {
  if (!spec || !Object.hasOwn(BUSINESS_TYPES, spec.type) || !["value", "premium", "balanced"].includes(spec.positioning)) {
    throw new Error("회사의 수익모델(business.type)과 고객 성향(positioning)을 다시 받아 주세요.");
  }
  const base = BUSINESS_TYPES[spec.type];
  const premium = spec.positioning === "premium", value = spec.positioning === "value";
  const priceFactor = premium ? 1.5 : value ? 0.75 : 1;
  return { ...base, cost: 0.25, fixed: 2500, type: spec.type, positioning: spec.positioning,
    customer: String(spec.customer || "우리 서비스 고객").slice(0, 60),
    rationale: String(spec.rationale || "회사 설명에 맞춘 고객과 수익모델입니다.").slice(0, 120),
    price: base.price * priceFactor, quantity: base.quantity / priceFactor,
    sensitivity: premium ? 0.8 : value ? 2.8 : 1.6,
    qualitySensitivity: premium ? 1.8 : value ? 0.6 : 1,
    adSensitivity: premium ? 2.8 : value ? 1.6 : 2.2 };
}

function practiceBusiness(c) {
  const text = c.detail + " " + c.industry + " " + c.motto;
  const type = /광고|무료.*앱/.test(text) ? "ads" : /구독|멤버십/.test(text) ? "subscription"
    : /중개|수수료|매칭/.test(text) ? "commission" : /대행|상담|청소|수리|교육|디자인|서비스/.test(text) ? "service" : "sales";
  return makeBusiness({ type, positioning: /고급|프리미엄|명품/.test(text) ? "premium" : /저렴|가성비|학생/.test(text) ? "value" : "balanced",
    customer: c.detail || "연습 회사 고객", rationale: "연습 모드: 회사 설명의 핵심 단어로 분류했습니다." });
}

function businessState(c, index = game.round) {
  return c.rounds[index - 1]?.economics?.after || { price: 1, ads: 1, quality: 1, unitCost: 1, capacity: 1, customers: 1 };
}

function actionBudget(c) {
  return Math.max(0, Math.min(1000, availableCash(c)));
}

function emptyAction() { return Object.fromEntries(ACTION_FIELDS.map(k => [k, 0])); }

function actionSpend(a) {
  return Math.round(Math.max(0, a.marketing) * 30 + Math.max(0, a.quality) * 40
    + Math.max(0, a.efficiency) * 30 + Math.max(0, a.capacity) * 40);
}

function normalizeAction(raw, c, budget) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("지시의 실행 항목(action)이 없어요.");
  const action = emptyAction(), notes = [];
  for (const key of ACTION_FIELDS) {
    if (typeof raw[key] !== "number" || !Number.isFinite(raw[key])) throw new Error(`지시의 ${ACTION_NAMES[key]} 수치가 올바르지 않아요.`);
    const min = ["price", "ads"].includes(key) ? -30 : key === "quality" ? -20 : 0;
    action[key] = Math.round(clamp(raw[key], min, 30));
    if (action[key] !== raw[key]) notes.push(`${ACTION_NAMES[key]}은 한 분기 ${min}~30% 범위로 조정`);
  }
  if (c.business.type !== "ads" && action.ads) { action.ads = 0; notes.push("광고 수익 회사가 아니라 광고량 변경 제외"); }
  const state = businessState(c);
  for (const [key, min, max] of [["price", 0.7, 1.8], ["ads", 0.5, 1.8], ["capacity", 1, 1.8]]) {
    const before = action[key];
    // 실제로 더 내릴/올릴 수 없는 수치는 실행 행동에서도 줄입니다.
    action[key] = clamp(before, Math.ceil((min / state[key] - 1) * 100 - 1e-8), Math.floor((max / state[key] - 1) * 100 + 1e-8)) || 0;
    if (action[key] !== before) notes.push(`${ACTION_NAMES[key]}은 누적 운영 한도에 맞춰 ${action[key]}%로 조정`);
  }
  const spend = actionSpend(action);
  if (spend > budget) {
    for (const key of ["marketing", "quality", "efficiency", "capacity"]) {
      if (action[key] > 0) action[key] = Math.floor(action[key] * budget / spend);
    }
    notes.push(`급여·고정비·투자금을 남긴 실행 예산 ${money(budget, false)}에 맞춰 축소`);
  }
  return { action, notes };
}

function actionLabel(a) {
  const labels = ACTION_FIELDS.filter(k => a[k]).map(k => `${ACTION_NAMES[k]} ${Math.abs(a[k])}% ${a[k] > 0 ? "늘림" : "줄임"}`);
  return labels.join(" · ") || "기존 방식 유지";
}

function shortAction(a) {
  const key = ACTION_FIELDS.find(k => a[k]);
  return key ? `${ACTION_NAMES[key]}${Math.abs(a[key])}%${a[key] > 0 ? "↑" : "↓"}` : "그대로 운영";
}

function sameAction(a, b) { return ACTION_FIELDS.every(k => a[k] === b[k]); }

function followChance(x) { return clamp(0.70 + x.loyalty * 0.025 + x.skill * 0.004, 0.7, 0.99); }

// AI 재시도와 새로고침에도 주사위를 다시 굴리지 않도록 지시 접수 순간 저장합니다.
function prepareBusinessRound(c) {
  const r = c.rounds[game.round];
  if (r.executionRolls) return;
  r.actionBudget = actionBudget(c);
  r.chain = transmissionStaff(c).map(x => x.id);
  r.executionRolls = r.chain.map(id => ({ id, follow: Math.random(), change: Math.random(), honest: Math.random() }));
  r.marketRoll = Math.random();
}

function executePlan(c) {
  const r = c.rounds[game.round];
  if (r.execution) return r.execution;
  prepareBusinessRound(c);
  let action = { ...r.plan.action };
  const steps = r.executionRolls.map(roll => {
    const x = candidateById(c, roll.id);
    const before = { ...action };
    let mode = "follow";
    if (roll.follow > followChance(x)) {
      mode = roll.change < 0.3 ? "reverse" : roll.change < 0.75 ? "half" : "hold";
      for (const key of ACTION_FIELDS) {
        action[key] = mode === "hold" ? 0 : mode === "half" ? Math.trunc(action[key] / 2)
          : ["price", "ads", "quality"].includes(key) ? -action[key] : 0;
      }
      action = normalizeAction(action, c, r.actionBudget).action;
    }
    return { id: x.id, action: { ...action }, changed: !sameAction(before, action), mode,
      reportLie: roll.honest > clamp(0.20 + x.honesty * 0.075 + x.secure * 0.001, 0.25, 0.98) };
  });
  const followed = sameAction(r.plan.action, action);
  // 보고의 거짓말은 '지시와 달리 했는데 지시대로 했다고 말함'입니다.
  steps.forEach(s => { s.reportLie = s.reportLie && !followed; });
  r.execution = { steps, action, followed };
  r.economics = calculateBusiness(c, action, game.round, r.marketRoll);
  r.guessOptions = actionOptions(r);
  return r.execution;
}

function actionOptions(r) {
  const options = [];
  const add = a => { if (!options.some(x => sameAction(x, a))) options.push({ ...a }); };
  add(r.execution.action); add(r.plan.action); add(emptyAction());
  for (const pct of [-10, 10, 20]) { const a = emptyAction(); a.price = pct; add(a); }
  // 같은 행동을 중복 제시하지 않고 정답 위치도 섞습니다. 생성한 배열 자체를 저장합니다.
  return shuffle(options.slice(0, 3));
}

function calculateBusiness(c, action, index = game.round, marketRoll = 0.5) {
  const b = c.business;
  if (!b) throw new Error("창업 단계에서 회사의 수익구조를 먼저 정해 주세요.");
  const before = { ...businessState(c, index) };
  const price = clamp(before.price * (1 + action.price / 100), 0.7, 1.8);
  const ads = clamp(before.ads * (1 + action.ads / 100), 0.5, 1.8);
  const quality = clamp(before.quality * (1 + action.quality / 100) * (1 - action.efficiency / 250), 0.6, 1.6);
  const unitCost = clamp(before.unitCost * (1 - action.efficiency / 100) * (1 + action.quality / 200), 0.6, 1.2);
  const facility = clamp(before.capacity * (1 + action.capacity / 100), 1, 1.8);
  const staff = staffOf(c);
  const workload = staff.reduce((sum, x) => sum + 0.7 + x.skill * 0.06, 0);
  const capacity = staff.length ? Math.floor(b.quantity * (0.15 + workload * 0.23) * facility) : 0;
  const luck = staff.length ? staff.reduce((sum, x) => sum + x.luck, 0) / staff.length : 5;
  const market = (c.events[index]?.type === "기회" ? 1.12 : 0.90) * (0.96 + clamp(marketRoll, 0, 1) * 0.08 + (luck - 5) * 0.005);
  // 가격·광고 과다의 이탈, 품질·홍보의 유입을 같은 고객 수요에 적용합니다.
  const appeal = Math.pow(price, -b.sensitivity) * Math.pow(quality, b.qualitySensitivity)
    * (b.type === "ads" ? Math.pow(ads, -b.adSensitivity) : 1);
  const demand = Math.max(0, Math.floor(b.quantity * before.customers * market * appeal * (1 + action.marketing / 100)));
  const unitPrice = b.price * price;
  // 작은 창업 회사가 분기당 접근 가능한 고객/광고주 예산. 지원 서버의 수익 범위도 지킵니다.
  const marketCapacity = Math.floor(12500 / unitPrice / (b.type === "ads" ? ads : 1));
  const served = Math.min(demand, capacity, marketCapacity);
  const quantity = b.type === "ads" ? Math.floor(served * ads) : served;
  const revenue = Math.round(quantity * unitPrice);
  const variableCost = Math.round(served * b.price * b.cost * unitCost);
  const fixedCost = b.fixed;
  const executionCost = actionSpend(action);
  const payrollCost = payroll(c) * COST_PER_SALARY;
  const operatingProfit = revenue - variableCost - fixedCost - executionCost - payrollCost;
  const satisfaction = Math.pow(price, -b.sensitivity * 0.15) * Math.pow(quality, b.qualitySensitivity * 0.15)
    * (b.type === "ads" ? Math.pow(ads, -b.adSensitivity * 0.15) : 1);
  const after = { price, ads, quality, unitCost, capacity: facility,
    customers: clamp(before.customers * satisfaction * (demand > capacity ? 0.97 : 1), 0.6, 1.6) };
  return { before, after, market, demand, capacity, served, quantity, unitPrice, revenue,
    variableCost, fixedCost, executionCost, payrollCost, operatingProfit,
    formula: `${quantity.toLocaleString()}${b.unit} × ${Math.round(unitPrice * 10000).toLocaleString()}원`,
    demandNote: served === marketCapacity ? "이번 분기는 고객·광고주의 지출 한도(1억 2,500만원)에 닿았어요."
      : demand > capacity ? "고객 수요가 처리 한도를 넘어 일부를 놓쳤어요. 직원 능력·인원·시설을 늘리면 더 처리할 수 있어요." : "이번 분기는 고객 수요를 모두 처리했어요." };
}

function businessResult(c, narrative = {}, model = "") {
  const r = c.rounds[game.round];
  const execution = executePlan(c);
  const steps = execution.steps;
  let over = 0;
  const say = (raw, fallback, id) => {
    const limit = rankInfo(candidateById(c, id).rank).chars;
    const text = typeof raw?.say === "string" && raw.say.trim() ? raw.say.trim() : fallback;
    if (text.length > limit) over++;
    return typeof summarizeTo === "function" ? summarizeTo(text, limit) : text.slice(0, limit); // 자르지 않고 요약 (js/ai.js)
  };
  return {
    down: steps.map((s, k) => ({ say: say(narrative.down?.[k], shortAction(s.action), s.id), lie: false })),
    up: [...steps].reverse().map((s, k) => ({ say: say(narrative.up?.[k], s.reportLie ? "지시대로 했습니다!" : shortAction(execution.action), s.id), lie: s.reportLie })),
    action: actionLabel(execution.action), followed: execution.followed,
    news: `'${c.name}', ${BUSINESS_TYPES[c.business.type].name}로 분기 영업이익 ${money(r.economics.operatingProfit)}`,
    reason: r.economics.demandNote,
    audit: steps.filter(s => s.changed).map(s => `${candidateById(c, s.id).name}: ${actionLabel(s.action)}`).join(" → ") || "전 직원이 지시를 그대로 전달했습니다.",
    clues: readClues(narrative.clues, steps.map(s => candidateById(c, s.id).name)),
    over, practice: !model || r.plan.practice, model
  };
}
