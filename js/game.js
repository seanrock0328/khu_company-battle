// 담당 B: 게임 규칙
// 이 파일은 화면을 직접 건드리지 않습니다. 계산만 합니다.

// ===== 팀 약속: 데이터 모양 (바꾸려면 단톡방에 먼저 공유!) =====
// 한 판 = 플레이어 한 명이 1년(4분기) 동안 회사 하나를 운영. 4분기 누적 수익으로 순위.
// 회사:
// {
//   player, emoji, industry, detail(세부정보), name, motto, funding,
//   news(창업 기사), events: [{type:"위기"|"기회", title, text}] x4,
//   candidates: { 임원: [후보 x3], ... }, hires: { 임원: 후보id | null, ... },
//   rounds: [{ order, result, choice:"dig"|"praise", success, revenue, cost, penalty, profit, loyaltyNote, quits:[이름] }]
// }
// 후보: { id, rank, name, mbti, secure(안정형 %), skill, luck, honesty(숨김), loyalty(충성심, 5에서 시작), quit, salary, intro, answer, interviewed:[질문id] }

const RANKS = [
  { name: "사장", chars: 100, base: 0 },  // 플레이어
  { name: "임원", chars: 60, base: 6 },
  { name: "부장", chars: 50, base: 5 },
  { name: "차장", chars: 40, base: 4 },
  { name: "과장", chars: 30, base: 3 },
  { name: "대리", chars: 20, base: 2 },
  { name: "사원", chars: 10, base: 1 }
];
const HIRE_RANKS = RANKS.filter(r => r.name !== "사장").map(r => r.name);

const PLAYER_MAX = 10;
const DETAIL_MAX = 40;
const NAME_MAX = 12;
const MOTTO_MAX = 20;
const ORDER_MAX = 100;
const ROUNDS = EVENT_ORDER.length; // 4분기

// ===== 경제 규칙 (단위: 만원) =====
// 분기 수익 = 성과 점수 x 100 - 인건비 x 200 - 불이익
const REVENUE_PER_POINT = 100;   // 성과 1점당 매출
const COST_PER_SALARY = 200;     // 연봉 1당 분기 인건비
const SUCCESS_LINE = 60;         // 성과 60점 이상이면 "잘 수행함"
const PRAISE_FAIL_PENALTY = 3000; // 잘 못했는데 칭찬하면 큰 불이익
// 최대 분기 손실(인건비 5600 + 불이익 3000 + 회식 300 + 투자 손실 500 = 9400)보다 크게.
// 전원 퇴사로 적자 분기를 피하는 전략이 이득이 되지 않게 합니다.
const CLOSED_PENALTY = 10000;    // 영업 중단 분기의 임대료·위약금
const LOYALTY_START = 5;
const LOYALTY_MAX = 10;
const DINNER_COST = 300;
const INVESTMENT_COST = 1000;
const INVESTMENT_WIN = 1600;
const INVESTMENT_LOSS = 500;
const FAMILY_SUPPORT = 4000;
const CASH_RULE_VERSION = "통장 결산 · ";

function quarterLabel(i) {
  return `${Math.floor(i / 4) + 1}년차 ${(i % 4) + 1}분기`;
}

function newCompany() {
  return {
    player: "", emoji: "", industry: "", detail: "", name: "", motto: "", funding: "savings",
    rolls: 0, news: "", events: [], candidates: {}, hires: {}, rounds: [], foundingByAI: false,
    powerUsed: null, initialCash: null, fundingLine: "", financeVersion: CASH_RULE_VERSION
  };
}

const game = { company: newCompany(), round: 0 };

function rankInfo(rankName) {
  return RANKS.find(r => r.name === rankName);
}

// ===== 대결 업종 =====
// 팀 결정(10/29): 업종은 사람마다 랜덤으로 뽑고, 순위표는 업종 상관없이 하나로 매깁니다.
// 수익은 업종이 아니라 직원·지시·선택으로 갈리므로 업종이 달라도 공정합니다.
// 예전처럼 "모두 같은 업종으로 대결"하려면 index.html에서 game.js보다 먼저
// <script>window.KHU_SHARED_INDUSTRY = true</script> 를 넣으면 됩니다.
const SHARED_INDUSTRY = globalThis.KHU_SHARED_INDUSTRY === true;

const SEASON_KEY = "company_battle_season_v3";

function getSeason() {
  if (!SHARED_INDUSTRY) return null;
  try {
    const s = JSON.parse(localStorage.getItem(SEASON_KEY) || "null");
    return s && s.industry ? s : null;
  } catch {
    return null;
  }
}

function setSeason(industry, emoji) {
  if (!SHARED_INDUSTRY) return;
  try { localStorage.setItem(SEASON_KEY, JSON.stringify({ industry, emoji })); } catch {}
}

function clearSeason() {
  try { localStorage.removeItem(SEASON_KEY); } catch {}
}

// 공유 링크로 들어왔으면 그 업종을 이 기기의 대결 업종으로
function seasonFromUrl() {
  const q = new URLSearchParams(location.search);
  const industry = (q.get("industry") || "").trim().slice(0, 20);
  if (!industry) return;
  setSeason(industry, (q.get("emoji") || "🏢").slice(0, 4));
  history.replaceState(null, "", location.pathname); // 주소창 정리
}

function seasonLink() {
  const s = getSeason();
  if (!s) return "";
  const q = new URLSearchParams({ industry: s.industry, emoji: s.emoji });
  const url = new URL(location.href);
  url.search = q.toString();
  url.hash = "";
  return url.href;
}

// ===== 창업 =====

const MAX_ROLLS = 2; // 업종 뽑기: 처음 1번 + 다시 뽑기 1번 (대결 업종이 정해지기 전에만)

function checkFounding(c) {
  if (!c.player.trim()) return "사장님 닉네임을 적어 주세요. 순위표에 나와요.";
  if (!c.industry) return "업종을 뽑아 주세요.";
  if (!c.detail.trim()) return "우리 회사가 무슨 일을 하는지 적어 주세요.";
  if (!c.name.trim()) return "회사 이름을 지어 주세요.";
  if (!c.motto.trim()) return "사훈을 정해 주세요.";
  return null;
}

function fundingOf(c) {
  return FUNDING.find(f => f.id === c.funding) || FUNDING[1];
}

function openFunding(c) {
  if (Number.isFinite(c.initialCash)) return c.initialCash;
  const f = fundingOf(c);
  c.funding = f.id;
  c.initialCash = f.id === "lottery" ? [6000, 10000, 14000][randInt(0, 2)] : f.cash;
  c.fundingLine = f.line;
  return c.initialCash;
}

function initialCapital(c) {
  return Number.isFinite(c.initialCash) ? c.initialCash : fundingOf(c).cash;
}

function settledRounds(c) {
  return c.rounds.filter(r => r && r.choice && Number.isFinite(r.profit));
}

function totalSupport(c) {
  return settledRounds(c).reduce((sum, r) => sum + (r.support || 0), 0);
}

function cashBalance(c) {
  return initialCapital(c) + totalProfit(c) + totalSupport(c);
}

// 지출은 분기 말에 한 번 정산하되, 지시 전에는 급여·회식·투자 예정액을 확보합니다.
function availableCash(c) {
  const round = c.rounds[game.round];
  return cashBalance(c) - payroll(c) * COST_PER_SALARY
    - (round && !round.choice ? (round.investment || 0) + (round.powerCost || 0) : 0);
}

function setInvestment(c, invest) {
  const round = c.rounds[game.round];
  if (typeof invest !== "boolean" || !round || round.result || round.choice || round.committed) return "지시를 내리기 전에 투자 여부를 골라 주세요.";
  if (!staffOf(c).length) return "영업 중단 중에는 투자할 수 없어요.";
  const cost = invest ? INVESTMENT_COST : 0;
  const free = availableCash(c) + (round.investment || 0);
  if (cost && cost > free) return "급여와 예정 지출을 남기면 투자금이 부족해요.";
  round.investment = cost;
  return null;
}

function financeHistory(c) {
  return settledRounds(c).map((r, i) => ({
    quarter: i + 1, opening: r.openingCash, closing: r.closingCash,
    income: r.revenue + (r.investmentReturn || 0) + (r.support || 0),
    expense: r.cost + r.penalty + (r.powerCost || 0) + (r.investmentCost || 0),
    profit: r.profit, round: r
  }));
}

// ===== 면접 후보 만들기 (능력치는 게임이 공정하게, 이름과 말은 ChatKHU가) =====

let nextCandidateId = 1;

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 후보 셋은 각각 능력형, 정직형, 운형. 세 능력치 합은 항상 17이라 밸런스가 맞습니다.
function makeCandidate(rank, type) {
  const main = randInt(7, 9);
  const rest = 17 - main;
  const a = randInt(Math.max(1, rest - 9), Math.min(9, rest - 1));
  const stats = { skill: 0, honesty: 0, luck: 0 };
  const others = ["skill", "honesty", "luck"].filter(k => k !== type);
  stats[type] = main;
  stats[others[0]] = a;
  stats[others[1]] = rest - a;
  const base = rankInfo(rank).base;
  return {
    id: nextCandidateId++, rank, type, name: "",
    mbti: MBTI[randInt(0, MBTI.length - 1)],
    secure: randInt(1, 9) * 10,
    ...stats,
    loyalty: LOYALTY_START, quit: false,
    salary: Math.max(1, Math.round(base * (0.6 + stats.skill * 0.08))),
    intro: "", answer: "", interviewed: []
  };
}

function makeCandidates(c) {
  c.candidates = {};
  c.hires = {};
  for (const rank of HIRE_RANKS) {
    c.candidates[rank] = shuffle(["skill", "honesty", "luck"]).map(t => makeCandidate(rank, t));
    if (c.funding === "savings") c.candidates[rank].forEach(x => { x.loyalty = Math.min(LOYALTY_MAX, LOYALTY_START + 2); });
    c.hires[rank] = null;
  }
}

function allCandidates(c) {
  return HIRE_RANKS.flatMap(r => c.candidates[r] || []);
}

function candidateById(c, id) {
  return allCandidates(c).find(x => x.id === id);
}

function attachmentLabel(x) {
  return `안정형 ${x.secure}% · 회피형 ${100 - x.secure}%`;
}

function interviewAnswer(x, questionId) {
  if (questionId === "motivation") return x.answer;
  if (questionId === "mistake") {
    if (x.honesty <= 3) return "실수요? 제 사전에 없습니다. 전 직장도 제가 살렸죠.";
    if (x.secure < 50) return "일단 혼자 고쳐 보고… 보고서는 커피 마시고 쓰겠습니다.";
    return "바로 보고하고 수습하겠습니다. 시말서 양식도 즐겨찾기 해 뒀죠.";
  }
  if (questionId === "handoff") {
    if (x.skill >= 7) return "목표와 마감부터 남깁니다. 제 점심 메뉴는 지우고요.";
    if (x.luck >= 7) return "핵심 단어를 남기고 행운을 빕니다. 지금까지는 통했어요.";
    return "중요해 보이는 말부터요. 느낌표는 꼭 세 개 남깁니다!!!";
  }
  return "";
}

function askCandidate(c, rank, id, questionId) {
  const x = candidateById(c, id);
  if (!x || x.rank !== rank || !INTERVIEW_QUESTIONS.some(q => q.id === questionId)) return false;
  if (!x.interviewed.includes(questionId)) x.interviewed.push(questionId);
  return true;
}

// ===== 채용 =====

function budgetOf(c) {
  return fundingOf(c).budget;
}

// 지시가 내려가는 순서 (빈자리, 퇴사자는 건너뜀)
function staffOf(c) {
  return HIRE_RANKS.map(r => c.hires[r] ? candidateById(c, c.hires[r]) : null).filter(x => x && !x.quit);
}

function payroll(c) {
  return staffOf(c).reduce((sum, x) => sum + x.salary, 0);
}

// 전달 과정만 건너뛰며, 재직 직원과 급여 계산에는 영향을 주지 않습니다.
function transmissionStaff(c) {
  const staff = staffOf(c);
  return c.rounds[game.round]?.power === "direct" ? staff.slice(-1) : staff;
}

function usePower(c, id) {
  const round = c.rounds[game.round];
  const staff = staffOf(c);
  if (!CEO_POWERS.some(p => p.id === id)) return "필살기를 골라 주세요.";
  if (!round || round.choice || !staff.length) return "업무를 진행 중일 때만 사용할 수 있어요.";
  if (c.powerUsed) return "사장 필살기는 한 판에 한 번만 사용할 수 있어요.";
  if (id === "visit" && !round.result) return "현장 출동은 보고를 받은 뒤 사용할 수 있어요.";
  if (id !== "visit" && round.result) return "회식과 직통 전화는 지시 전에 사용해 주세요.";
  if (id === "direct" && staff.length < 2) return "직원이 한 명이면 이미 직통으로 전달돼요.";
  if (id === "dinner" && staff.every(x => x.loyalty === LOYALTY_MAX)) return "이미 모두 충성심이 가득해요.";
  if (id !== "visit" && round.committed) return "이미 지시를 내린 분기예요.";
  if (id === "dinner" && availableCash(c) < DINNER_COST) return "급여와 투자금을 남기면 회식비가 부족해요.";
  round.power = id;
  round.powerCost = id === "dinner" ? DINNER_COST : 0;
  if (id === "dinner") staff.forEach(x => { x.loyalty = Math.min(LOYALTY_MAX, x.loyalty + 2); });
  c.powerUsed = { id, round: game.round };
  return null;
}

// 일부 증거만 보여 줍니다. 중간 구간은 성공과 실패가 겹쳐 정답을 확정할 수 없습니다.
// 45·80은 js/ai.js 이벤트 요청문의 점수 구간(0~45 망함, 80~100 대성공)과 같은 숫자입니다. 바꾸면 요청문도 같이 바꾸세요.
function cluesFor(round) {
  const r = round.result;
  if (!r) return [];
  const customer = r.score <= 45
    ? "문의함: 같은 문제로 다시 연락한 고객이 눈에 띕니다. 답변을 기다리는 글도 남아 있습니다."
    : r.score >= 80
    ? "문의함: 처리됐다는 답장이 여럿 도착했습니다. 아직 답이 없는 고객도 있습니다."
    : "문의함: 감사 인사와 재문의가 섞여 있습니다. 일부 고객은 아직 연락이 없습니다.";
  const record = r.up.some(x => x.lie)
    ? "현장 메모: 최종 보고에서 언급하지 않은 수정 요청이 남아 있습니다. 단순 보완일 수도 있습니다."
    : "현장 메모: 보고와 비슷한 작업 기록이 있습니다. 기록만으로 업무 품질까지 확인되지는 않습니다.";
  return [customer, record];
}

function endingFor(c) {
  const staff = staffOf(c);
  const avg = staff.length ? staff.reduce((sum, x) => sum + x.loyalty, 0) / staff.length : 0;
  const profit = totalProfit(c);
  const digs = c.rounds.filter(r => r.choice === "dig").length;
  const badPraises = c.rounds.filter(r => r.choice === "praise" && !r.success).length;
  const last = c.rounds[ROUNDS - 1];
  let id, title, text;
  if (!staff.length) { id = "closed"; title = "불 꺼진 사무실"; text = "사장님만 출근했습니다. 커피 머신이 마지막 동료가 됐습니다."; }
  else if (profit < 0 && avg >= 7) { id = "welfare"; title = "복지는 대기업, 장부는 적자"; text = "직원 만족도는 상장했습니다. 회사 통장은 상장폐지 직전입니다."; }
  else if (profit < 0 && badPraises >= 2) { id = "paper"; title = "보고서만 대기업"; text = "보고서에는 우상향 그래프, 통장에는 하향 곡선이 남았습니다."; }
  else if (profit >= 0 && last?.investmentReturn > last?.investmentCost) { id = "comeback"; title = "막판 한 방의 승부사"; text = "마지막 분기 투자가 터졌습니다. 사장님의 무릎이 먼저 풀렸습니다."; }
  else if (profit >= 0 && avg >= 7) { id = "happy"; title = "직원도 웃는 흑자 기업"; text = "월급날도 사장님 등장도 반갑다는 드문 회사가 탄생했습니다."; }
  else if (profit >= 0 && digs >= 3) { id = "detective"; title = "현미경 경영의 달인"; text = "영수증 한 장까지 확인했습니다. 직원들은 사장님의 발소리를 외웠습니다."; }
  else if (profit >= 0) { id = "survivor"; title = "작지만 단단한 생존 기업"; text = "대박 소문은 없어도 통장에 돈은 남았습니다. 내년에도 문을 엽니다."; }
  else { id = "retry"; title = "다음 투자를 기다리는 사장"; text = "수익보다 경험이 쌓였습니다. 투자 제안서의 글꼴부터 바꿔 봅니다."; }
  return { id, title, text, headline: `'${c.name}', ${title}… 사장 ${c.player}의 1년` };
}

function endingShareText(c) {
  const ending = endingFor(c);
  return `🏢 10자 사원 주식회사 · 1년 4턴 결산\n${c.name} / 사장 ${c.player}\n${ending.title}\n통장 잔액 ${money(cashBalance(c), false)} · 순이익 ${money(totalProfit(c))}\n${ending.text}`;
}

function hireCandidate(c, rank, id) {
  if (!HIRE_RANKS.includes(rank)) return "채용할 직급을 확인해 주세요.";
  if (id !== null) {
    const x = candidateById(c, id);
    if (!x || x.rank !== rank || x.quit) return "이 직급의 면접 후보를 골라 주세요.";
    if (!x.interviewed.length) return "질문을 하나 이상 하고 답변을 들어 본 뒤 채용해 주세요.";
  }
  const before = c.hires[rank];
  c.hires[rank] = id;
  if (id && payroll(c) > budgetOf(c)) {
    c.hires[rank] = before;
    return "예산이 부족해요. 다른 후보를 고르거나 위 직급을 바꿔 보세요.";
  }
  return null;
}

// ===== 분기 결산: 파고들기 / 칭찬하기 =====
// 칭찬 + 잘함   → 충성심 +1
// 칭찬 + 못함   → 큰 불이익 (-3000만원)
// 파고듦 + 잘함 → 충성심 -1 (의심받아 서운함)
// 파고듦 + 못함 → 불이익 없음 (문제를 미리 잡아냄)
// 충성심이 0이 되면 퇴사합니다.

function settleRound(c, choice) {
  const round = c.rounds[game.round];
  if (!round || !round.result) throw new Error("분기 결과를 먼저 받아 주세요.");
  if (round.choice) return round; // 더블 클릭으로 충성심이나 불이익이 중복 적용되지 않게
  const openingCash = cashBalance(c);
  const staff = staffOf(c);
  if (!["dig", "praise"].includes(choice) && !(choice === "closed" && staff.length === 0)) {
    throw new Error("칭찬하기 또는 파고들기를 골라 주세요.");
  }
  const score = round.result.score;
  const success = score >= SUCCESS_LINE;
  let penalty = 0;
  let delta = 0;
  let note;

  if (choice === "closed") {
    penalty = CLOSED_PENALTY;
    note = `직원이 없어 영업을 중단했습니다. 임대료와 위약금 ${money(-penalty)}`;
  } else if (choice === "praise") {
    if (success) { delta = 1; note = "칭찬받은 직원들의 충성심이 올랐습니다 (+1)"; }
    else { penalty = PRAISE_FAIL_PENALTY; note = "엉터리 일을 칭찬해서 문제가 커졌습니다"; }
  } else {
    if (success) { delta = -1; note = "잘했는데 의심받은 직원들이 서운해합니다 (충성심 -1)"; }
    else { note = "파고든 덕분에 문제를 미리 잡아 불이익을 막았습니다"; }
  }

  const quits = [];
  if (delta) {
    staff.forEach(x => {
      x.loyalty = Math.max(0, Math.min(LOYALTY_MAX, x.loyalty + delta));
      if (x.loyalty === 0) { x.quit = true; quits.push(`${x.rank} ${x.name}`); }
    });
  }

  const baseRevenue = choice === "closed" ? 0 : score * REVENUE_PER_POINT;
  const revenue = baseRevenue;
  const investmentCost = choice === "closed" ? 0 : (round.investment || 0);
  const investmentReturn = investmentCost ? (success ? INVESTMENT_WIN : INVESTMENT_LOSS) : 0;
  const powerCost = round.powerCost || 0;
  const cost = staff.reduce((s, x) => s + x.salary, 0) * COST_PER_SALARY;
  const profit = revenue + investmentReturn - investmentCost - cost - penalty - powerCost;
  const support = c.funding === "parents" && openingCash + profit < 0 && totalSupport(c) === 0 ? FAMILY_SUPPORT : 0;
  Object.assign(round, {
    choice, success, baseRevenue, revenue, cost, penalty, powerCost, investmentCost, investmentReturn,
    profit, support, openingCash, closingCash: openingCash + profit + support,
    loyaltyNote: note, quits
  });
  return round;
}

function closeUnstaffedRound(c) {
  const round = c.rounds[game.round];
  if (staffOf(c).length || round.choice) return;
  round.chain = [];
  round.result = {
    down: [], up: [], action: "직원 전원 퇴사로 업무를 수행하지 못했습니다.",
    score: 0, news: `${c.name}, ${quarterLabel(game.round)} 직원 부재로 영업 중단`,
    reason: "업무를 수행할 직원이 없습니다", audit: "", over: 0,
    practice: isPractice(c), model: ""
  };
  settleRound(c, "closed");
}

function totalProfit(c) {
  return c.rounds.reduce((s, r) => s + (typeof r.profit === "number" ? r.profit : 0), 0);
}

function isPractice(c) {
  return !c.foundingByAI || c.rounds.some(r => r.result && r.result.practice);
}

function fundingTwist(c) {
  if (c.funding === "parents") {
    const nags = [
      "엄마: 그래서 그 돈으로 회사를 차렸다고?",
      "아빠: 공무원 시험은 언제 볼 거니",
      "엄마: 옆집 애는 대기업 갔다더라",
      "아빠: 회사 이름이 그게 뭐냐"
    ];
    return { kind: "nag", text: nags[randInt(0, nags.length - 1)] };
  }
  return null;
}

// 금액 표시: 12345 → "+1억 2,345만원"
function money(n, signed = true) {
  const sign = n < 0 ? "−" : signed ? "+" : "";
  const v = Math.abs(Math.round(n));
  const eok = Math.floor(v / 10000);
  const man = v % 10000;
  const parts = [];
  if (eok) parts.push(`${eok.toLocaleString()}억`);
  if (man || !eok) parts.push(`${man.toLocaleString()}만원`);
  else parts[0] += "원";
  return sign + parts.join(" ");
}

// ===== 순위표 (이 노트북 브라우저에 저장) =====

// 필살기·최종 전략이 없는 이전 규칙의 기록과 수익을 비교하지 않게 분리합니다.
const BOARD_KEY = "company_battle_leaderboard_v6";

function loadBoard() {
  try {
    const list = JSON.parse(localStorage.getItem(BOARD_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveBoard(list) {
  try { localStorage.setItem(BOARD_KEY, JSON.stringify(list)); } catch {}
}

function sortedBoard(industry = getSeason()?.industry) {
  return loadBoard().filter(e => !industry || e.industry === industry)
    .sort((a, b) => b.profit - a.profit || a.at - b.at);
}

// 연습 모드가 한 번이라도 섞이면 순위에 넣지 않습니다
function recordResult(c) {
  if (isPractice(c) || c.rounds.length !== ROUNDS || c.rounds.some(r => !r.choice)) return null;
  if (c.placement) return c.placement;
  const last = c.rounds[c.rounds.length - 1].result;
  const ending = endingFor(c);
  const entry = {
    player: c.player.trim(), name: c.name, emoji: c.emoji, industry: c.industry,
    profit: totalProfit(c), news: CASH_RULE_VERSION + ending.headline, ending: ending.title,
    model: last.model || "", at: Date.now()
  };
  const list = loadBoard();
  list.push(entry);
  saveBoard(list);
  const sorted = sortedBoard(SHARED_INDUSTRY ? c.industry : null);
  c.placement = { rank: sorted.findIndex(e => e.at === entry.at) + 1, total: sorted.length, at: entry.at };
  return c.placement;
}

// 순위표를 비우면 대결 업종도 새로 뽑습니다
function clearBoard() {
  saveBoard([]);
  clearSeason();
}

function resetGame() {
  game.company = newCompany();
  game.round = 0;
  const season = getSeason();
  if (season) {
    game.company.industry = season.industry;
    game.company.emoji = season.emoji;
  }
}
