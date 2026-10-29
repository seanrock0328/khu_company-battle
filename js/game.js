// 담당 B: 게임 규칙
// 이 파일은 화면을 직접 건드리지 않습니다. 계산만 합니다.

// ===== 팀 약속: 데이터 모양 (바꾸려면 단톡방에 먼저 공유!) =====
// 한 판에 플레이어 한 명이 회사 하나를 운영합니다. (코드는 회사 여러 개도 받을 수 있게 배열로 둠)
// 회사 하나:
// {
//   player: "닉네임", name: "붕세권", industry: "붕어빵 프랜차이즈", emoji: "🐟", motto: "빠르게 실패하자",
//   funding: "angel", staff: [직원...], news: "창업 기사", crisis: {title, text, keywords?},
//   order: "사장 지시", result: { down: [...], action, up: [...], news, score, reason, practice, model }
// }
// 직원 한 명: { id: 1, rank: "사원", persona: "밈 장인" }
// 순위표 한 줄: { player, name, emoji, industry, motto, score, news, model, at }

const RANKS = [
  { name: "사장", chars: 100, cost: 0 },  // 사장은 플레이어
  { name: "부장", chars: 50, cost: 7 },
  { name: "과장", chars: 30, cost: 4 },
  { name: "대리", chars: 20, cost: 2 },
  { name: "사원", chars: 10, cost: 1 }
];

const PLAYER_MAX = 10;    // 닉네임 최대 글자 수
const PERSONA_MAX = 10;   // 성격 최대 글자 수
const MOTTO_MAX = 20;     // 사훈 최대 글자 수
const NAME_MAX = 12;      // 회사 이름 최대 글자 수
const ORDER_MAX = 100;    // 사장 지시 최대 글자 수

function newCompany() {
  return {
    player: "", name: "", industry: "", emoji: "", motto: "", funding: "angel",
    cards: [], rerolled: false,
    staff: [], news: "", crisis: null, order: "", result: null
  };
}

const game = {
  companies: [newCompany()],
  nextId: 1
};

// ===== 창업 =====

function drawCards() {
  const pool = [...INDUSTRIES];
  const cards = [];
  while (cards.length < 3 && pool.length) {
    cards.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return cards;
}

function checkFounding(company) {
  if (!company.player.trim()) return "사장님 닉네임을 적어 주세요. 순위표에 나와요.";
  if (!company.industry) return "업종 카드를 골라 주세요.";
  if (!company.name.trim()) return "회사 이름을 지어 주세요.";
  if (!company.motto.trim()) return "사훈을 정해 주세요.";
  return null;
}

function fundingOf(company) {
  return FUNDING.find(f => f.id === company.funding) || FUNDING[1];
}

function budgetOf(company) {
  return fundingOf(company).budget;
}

// ===== 채용 =====

function rankInfo(rankName) {
  return RANKS.find(r => r.name === rankName);
}

function spent(company) {
  return company.staff.reduce((sum, s) => sum + rankInfo(s.rank).cost, 0);
}

function hire(companyIndex, rank, persona) {
  const company = game.companies[companyIndex];
  const info = rankInfo(rank);
  persona = persona.trim();

  if (!info || rank === "사장") return "뽑을 수 없는 직급입니다.";
  if (persona.length === 0) return "성격을 적거나 골라 주세요.";
  if (persona.length > PERSONA_MAX) return `성격은 ${PERSONA_MAX}자까지입니다.`;
  if (spent(company) + info.cost > budgetOf(company)) return "예산이 부족합니다.";

  company.staff.push({ id: game.nextId++, rank, persona });
  return null;
}

function fire(companyIndex, staffId) {
  const company = game.companies[companyIndex];
  company.staff = company.staff.filter(s => s.id !== staffId);
}

// 지시가 내려가는 순서대로 정렬 (높은 직급부터). 같은 직급은 뽑은 순서대로.
function chainOf(company) {
  const order = RANKS.map(r => r.name);
  return [...company.staff].sort((a, b) =>
    order.indexOf(a.rank) - order.indexOf(b.rank) || a.id - b.id);
}

// ===== 결산 =====

// 창업 자금에 따른 대가
function fundingTwist(company) {
  const score = company.result ? company.result.score : 0;
  if (company.funding === "parents") {
    const nags = [
      "엄마: 그래서 그 돈으로 회사를 차렸다고?",
      "아빠: 공무원 시험은 언제 볼 거니",
      "엄마: 옆집 애는 대기업 갔다더라",
      "아빠: 회사 이름이 그게 뭐냐"
    ];
    return { kind: "nag", text: nags[Math.floor(Math.random() * nags.length)] };
  }
  if (company.funding === "vc" && score < 50) {
    return { kind: "fired", text: "이사회 결정: 사장님은 오늘부로 해임되셨습니다." };
  }
  return null;
}

// ===== 순위표 (이 노트북 브라우저에 저장) =====

const BOARD_KEY = "company_battle_leaderboard";

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

// 점수 높은 순, 같으면 먼저 한 사람이 위
function sortedBoard() {
  return loadBoard().sort((a, b) => b.score - a.score || a.at - b.at);
}

// 이번 판을 순위표에 넣고, 몇 위인지 돌려줍니다. 연습 모드는 넣지 않습니다.
function recordResult(company) {
  const r = company.result;
  if (!r || r.practice) return null;
  const entry = {
    player: company.player.trim(), name: company.name, emoji: company.emoji,
    industry: company.industry, motto: company.motto,
    score: r.score, news: r.news, model: r.model || "", at: Date.now()
  };
  const list = loadBoard();
  list.push(entry);
  saveBoard(list);
  const sorted = sortedBoard();
  return { rank: sorted.findIndex(e => e.at === entry.at) + 1, total: sorted.length, at: entry.at };
}

function clearBoard() {
  saveBoard([]);
}

function resetGame() {
  game.companies = [newCompany()];
  game.nextId = 1;
}
