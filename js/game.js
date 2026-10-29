// 담당 B: 게임 규칙
// 이 파일은 화면을 직접 건드리지 않습니다. 계산만 합니다.

// ===== 팀 약속: 데이터 모양 (바꾸려면 단톡방에 먼저 공유!) =====
// 한 판 = 플레이어 한 명이 회사 하나를 운영. 이벤트 3번(위기·기회·위기)의 점수 합계로 순위.
// 회사:
// {
//   player, emoji, industry, detail(세부정보), name, motto, funding,
//   news(창업 기사), events: [{type:"위기"|"기회", title, text}] x3,
//   candidates: { 임원: [후보 x3], 부장: [...], ... }, hires: { 임원: 후보id | null, ... },
//   rounds: [{ order, result: { down:[{say, lie}], action, up:[{say, lie}], score, news, reason, practice, model } }]
// }
// 후보: { id, rank, name, mbti, secure(안정형 %), skill(능력 1~10), luck(운 1~10), honesty(정직 1~10, 숨김), salary, intro, answer }

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
const ROUNDS = EVENT_ORDER.length; // 3

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

// ===== 창업 =====

const MAX_ROLLS = 2; // 업종 뽑기: 처음 1번 + 다시 뽑기 1번

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

// 후보 셋은 각각 능력형, 정직형, 운형 중 하나. 세 능력치 합은 항상 17이라 밸런스가 맞습니다.
function makeCandidate(rank, type) {
  const main = randInt(7, 9);
  let rest = 17 - main;
  const a = randInt(Math.max(1, rest - 9), Math.min(9, rest - 1));
  const b = rest - a;
  const stats = { skill: 0, honesty: 0, luck: 0 };
  const others = ["skill", "honesty", "luck"].filter(k => k !== type);
  stats[type] = main;
  stats[others[0]] = a;
  stats[others[1]] = b;
  const base = rankInfo(rank).base;
  return {
    id: nextCandidateId++,
    rank,
    type,
    name: "",
    mbti: MBTI[randInt(0, MBTI.length - 1)],
    secure: randInt(1, 9) * 10,
    ...stats,
    salary: Math.max(1, Math.round(base * (0.6 + stats.skill * 0.08))),
    intro: "",
    answer: ""
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

function payroll(c) {
  return HIRE_RANKS.reduce((sum, r) => {
    const x = c.hires[r] ? candidateById(c, c.hires[r]) : null;
    return sum + (x ? x.salary : 0);
  }, 0);
}

function budgetOf(c) {
  return fundingOf(c).budget;
}

// 실패하면 이유, 성공하면 null. id가 null이면 그 자리를 비웁니다.
function hireCandidate(c, rank, id) {
  const before = c.hires[rank];
  c.hires[rank] = id;
  if (id && payroll(c) > budgetOf(c)) {
    c.hires[rank] = before;
    return "예산이 부족해요. 다른 후보를 고르거나 위 직급을 바꿔 보세요.";
  }
  return null;
}

// 지시가 내려가는 순서 (빈자리는 건너뜀)
function staffOf(c) {
  return HIRE_RANKS.map(r => c.hires[r] ? candidateById(c, c.hires[r]) : null).filter(Boolean);
}

// ===== 결산 =====

function totalScore(c) {
  return c.rounds.reduce((s, r) => s + (r.result ? r.result.score : 0), 0);
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
  if (c.funding === "vc" && totalScore(c) < 150) {
    return { kind: "fired", text: "이사회 결정: 사장님은 오늘부로 해임되셨습니다." };
  }
  return null;
}

// ===== 순위표 (이 노트북 브라우저에 저장) =====

const BOARD_KEY = "company_battle_leaderboard_v2";

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
  return loadBoard().sort((a, b) => b.score - a.score || a.at - b.at);
}

// 연습 모드가 한 번이라도 섞이면 순위에 넣지 않습니다
function recordResult(c) {
  if (isPractice(c)) return null;
  const last = c.rounds[c.rounds.length - 1].result;
  const entry = {
    player: c.player.trim(), name: c.name, emoji: c.emoji, industry: c.industry,
    score: totalScore(c), news: last.news, model: last.model || "", at: Date.now()
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
  game.company = newCompany();
  game.round = 0;
}
