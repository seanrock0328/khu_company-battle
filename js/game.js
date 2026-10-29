// 담당 B: 게임 규칙
// 이 파일은 화면을 직접 건드리지 않습니다. 계산만 합니다.

// ===== 팀 약속: 데이터 모양 (바꾸려면 단톡방에 먼저 공유!) =====
// 한 판 = 플레이어 한 명이 2년(8분기) 동안 회사 하나를 운영. 8분기 누적 수익으로 순위.
// 회사:
// {
//   player, emoji, industry, detail(세부정보), name, motto, funding,
//   news(창업 기사), events: [{type:"위기"|"기회", title, text}] x8,
//   candidates: { 임원: [후보 x3], ... }, hires: { 임원: 후보id | null, ... },
//   rounds: [{ order, result, choice:"dig"|"praise", success, revenue, cost, penalty, profit, loyaltyNote, quits:[이름] }]
// }
// 후보: { id, rank, name, mbti, secure(안정형 %), skill, luck, honesty(숨김), loyalty(충성심, 5에서 시작), quit, salary, intro, answer }

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
const ROUNDS = EVENT_ORDER.length; // 8분기

// ===== 경제 규칙 (단위: 만원) =====
// 분기 수익 = 성과 점수 x 100 - 인건비 x 200 - 불이익
const REVENUE_PER_POINT = 100;   // 성과 1점당 매출
const COST_PER_SALARY = 200;     // 연봉 1당 분기 인건비
const SUCCESS_LINE = 60;         // 성과 60점 이상이면 "잘 수행함"
const PRAISE_FAIL_PENALTY = 3000; // 잘 못했는데 칭찬하면 큰 불이익
const LOYALTY_START = 5;
const LOYALTY_MAX = 10;

function quarterLabel(i) {
  return `${Math.floor(i / 4) + 1}년차 ${(i % 4) + 1}분기`;
}

function newCompany() {
  return {
    player: "", emoji: "", industry: "", detail: "", name: "", motto: "", funding: "angel",
    rolls: 0, news: "", events: [], candidates: {}, hires: {}, rounds: [], foundingByAI: false
  };
}

const game = { company: newCompany(), round: 0 };

function rankInfo(rankName) {
  return RANKS.find(r => r.name === rankName);
}

// ===== 대결 업종 (같은 대결에 참가한 사람은 모두 같은 업종) =====
// 이 노트북에서 첫 사람이 뽑은 업종이 저장되고, 다음 사람부터 그대로 씁니다.
// 다른 기기와는 공유 링크(?industry=...&emoji=...)로 맞춥니다. 순위표를 초기화하면 새로 뽑습니다.

const SEASON_KEY = "company_battle_season_v3";

function getSeason() {
  try {
    const s = JSON.parse(localStorage.getItem(SEASON_KEY) || "null");
    return s && s.industry ? s : null;
  } catch {
    return null;
  }
}

function setSeason(industry, emoji) {
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
  return `${location.origin}${location.pathname}?${q}`;
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
    intro: "", answer: ""
  };
}

function makeCandidates(c) {
  c.candidates = {};
  c.hires = {};
  for (const rank of HIRE_RANKS) {
    c.candidates[rank] = shuffle(["skill", "honesty", "luck"]).map(t => makeCandidate(rank, t));
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
  return x.secure >= 50 ? `안정형 ${x.secure}%` : `회피형 ${100 - x.secure}%`;
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

function hireCandidate(c, rank, id) {
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
  const score = round.result.score;
  const success = score >= SUCCESS_LINE;
  const staff = staffOf(c);
  let penalty = 0;
  let delta = 0;
  let note;

  if (choice === "praise") {
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

  const revenue = score * REVENUE_PER_POINT;
  const cost = staff.reduce((s, x) => s + x.salary, 0) * COST_PER_SALARY;
  Object.assign(round, {
    choice, success, revenue, cost, penalty,
    profit: revenue - cost - penalty,
    loyaltyNote: note, quits
  });
  return round;
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
  if (c.funding === "vc" && totalProfit(c) < 0) {
    return { kind: "fired", text: "이사회 결정: 2년 적자로 사장님은 오늘부로 해임되셨습니다." };
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

const BOARD_KEY = "company_battle_leaderboard_v3";

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

function sortedBoard() {
  return loadBoard().sort((a, b) => b.profit - a.profit || a.at - b.at);
}

// 연습 모드가 한 번이라도 섞이면 순위에 넣지 않습니다
function recordResult(c) {
  if (isPractice(c)) return null;
  const last = c.rounds[c.rounds.length - 1].result;
  const entry = {
    player: c.player.trim(), name: c.name, emoji: c.emoji, industry: c.industry,
    profit: totalProfit(c), news: last.news, model: last.model || "", at: Date.now()
  };
  const list = loadBoard();
  list.push(entry);
  saveBoard(list);
  const sorted = sortedBoard();
  return { rank: sorted.findIndex(e => e.at === entry.at) + 1, total: sorted.length, at: entry.at };
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
