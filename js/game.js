// 담당 B: 게임 규칙
// 이 파일은 화면을 직접 건드리지 않습니다. 계산만 합니다.

// ===== 팀 약속: 데이터 모양 (바꾸려면 단톡방에 먼저 공유!) =====
// 직원 한 명: { id: 1, rank: "사원", persona: "밈 장인" }
// 회사 하나: { name: "A사", staff: [직원, 직원, ...] }
// 지시가 내려가는 순서는 직급 순서(사장 → 부장 → 과장 → 대리 → 사원)입니다.

const RANKS = [
  { name: "사장", chars: 100, cost: 0 },  // 사장은 플레이어, 회사당 1명 고정
  { name: "부장", chars: 50, cost: 7 },
  { name: "과장", chars: 30, cost: 4 },
  { name: "대리", chars: 20, cost: 2 },
  { name: "사원", chars: 10, cost: 1 }
];

const BUDGET = 15;          // 회사당 인건비 예산
const PERSONA_MAX = 10;     // 성격 설명 최대 글자 수

const game = {
  companies: [
    { name: "A사", staff: [] },
    { name: "B사", staff: [] }
  ],
  crisis: null,
  nextId: 1
};

function rankInfo(rankName) {
  return RANKS.find(r => r.name === rankName);
}

function spent(company) {
  return company.staff.reduce((sum, s) => sum + rankInfo(s.rank).cost, 0);
}

// 직원 추가. 실패하면 이유를 문자열로 돌려줍니다.
function hire(companyIndex, rank, persona) {
  const company = game.companies[companyIndex];
  const info = rankInfo(rank);
  persona = persona.trim();

  if (!info || rank === "사장") return "뽑을 수 없는 직급입니다.";
  if (persona.length === 0) return "성격을 적어 주세요.";
  if (persona.length > PERSONA_MAX) return `성격은 ${PERSONA_MAX}자까지입니다.`;
  if (spent(company) + info.cost > BUDGET) return "예산이 부족합니다.";

  company.staff.push({ id: game.nextId++, rank, persona });
  return null; // 성공
}

function fire(companyIndex, staffId) {
  const company = game.companies[companyIndex];
  company.staff = company.staff.filter(s => s.id !== staffId);
}

// 지시가 내려가는 순서대로 직원 정렬 (높은 직급부터)
function chainOf(company) {
  const order = RANKS.map(r => r.name);
  return [...company.staff].sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank));
}

function pickCrisis() {
  game.crisis = CRISES[Math.floor(Math.random() * CRISES.length)];
  return game.crisis;
}

// 실적 판정 (임시 규칙). 나중에 AI 판정으로 바꿀 수 있습니다.
// 맨 아래 직원의 말에 위기 키워드가 얼마나 살아남았는지로 점수를 냅니다.
function score(messages, crisis) {
  if (messages.length === 0) return 0;
  const last = messages[messages.length - 1].text;
  const all = messages.map(m => m.text).join(" ");
  let points = 50;
  for (const k of crisis.keywords) {
    if (last.includes(k)) points += 15;      // 끝까지 살아남은 키워드
    else if (all.includes(k)) points += 5;   // 중간에 사라진 키워드
  }
  return Math.min(points, 100);
}

function resetGame() {
  game.companies.forEach(c => (c.staff = []));
  game.crisis = null;
}
