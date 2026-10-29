// 담당 C: ChatKHU 연결
// 게임이 ChatKHU에 보낼 요청문을 만들고, ChatKHU가 돌려준 JSON을 받아 게임에 적용합니다.
// ChatKHU 없이 테스트할 때를 위한 "연습 모드"(AI 아님)도 여기 있습니다.
// 요청문 문구를 고치면 결과가 달라집니다. 고칠 때마다 docs/ai-log.md에 기록!

// ===== 0. ChatKHU API 자동 연결 =====
// ChatKHU API Gateway (OpenAI 호환). 문서: https://docs.mindlogic.ai/docs/general/api-gateway/getting-started/overview
// API 키는 절대 코드에 쓰지 않습니다! 게임 화면에서 입력받아 그 브라우저(localStorage)에만 저장합니다.

const CHATKHU_URL = "https://factchat-cloud.mindlogic.ai/v1/gateway/chat/completions/";

// 고를 수 있는 모델 (ChatKHU 모델 목록에서 고름. 크레딧 단가가 모델마다 다름)
const CHATKHU_MODELS = [
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (빠름)" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5 (빠름)" },
  { id: "solar-pro4", name: "Solar Pro 4 (국내)" }
];

const store = {
  get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  remove(k) { try { localStorage.removeItem(k); } catch {} }
};

function getApiKey() { return store.get("chatkhu_key"); }
function getModel() { return store.get("chatkhu_model") || CHATKHU_MODELS[0].id; }
function saveApiSettings(key, model) {
  if (key) store.set("chatkhu_key", key.trim());
  if (model) store.set("chatkhu_model", model);
}
function clearApiKey() { store.remove("chatkhu_key"); }

// 요청문을 ChatKHU에 보내고 답변 글자를 돌려받습니다
async function callChatKHU(prompt) {
  const key = getApiKey();
  if (!key) throw new Error("API 키를 먼저 저장해 주세요.");
  let res;
  try {
    res = await fetch(CHATKHU_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: getModel(),
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8000
      })
    });
  } catch (e) {
    throw new Error("브라우저에서 ChatKHU에 접속하지 못했어요. 아래 '복사·붙여넣기로 하기'로 진행해 주세요.");
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 150);
    const reasons = {
      401: "API 키가 틀렸거나 해지됐어요. 키를 다시 확인해 주세요.",
      402: "ChatKHU 크레딧이 부족해요.",
      403: "이 모델은 API로 쓸 수 없어요. 다른 모델을 골라 주세요.",
      404: "모델 이름을 찾지 못했어요. 다른 모델을 골라 주세요.",
      429: "요청이 너무 많아요. 잠시 후 다시 눌러 주세요."
    };
    throw new Error(`${reasons[res.status] || "ChatKHU 오류가 났어요."} (${res.status}) ${detail}`);
  }
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error("ChatKHU 답변이 비어 있어요. 다시 눌러 보거나 다른 모델을 골라 주세요.");
  return Array.isArray(text) ? text.map(p => p.text || "").join("") : String(text);
}

// ===== 1. 창업 단계 =====

function buildFoundingRequest() {
  const input = {
    companies: game.companies.map(c => ({
      name: c.name, industry: c.industry, motto: c.motto, funding: fundingOf(c).name
    }))
  };
  return `너는 회사 배틀 게임 "10자 사원 주식회사"의 AI 진행자다.
아래 두 회사가 방금 창업했다. 각 회사마다 다음 두 가지를 만들어라.

1. news: 창업 소식을 다룬 경제 뉴스 헤드라인 1문장 (60자 이내). 회사 이름, 업종, 사훈, 자금 출처를 재치 있게 녹일 것.
2. crisis: 그 업종에서 곧 터질 위기 카드 1장. title은 15자 이내, text는 50자 이내. 웃기지만 그럴듯하게, 사장이 대응 지시를 내릴 수 있는 상황으로.

[회사 정보]
${JSON.stringify(input, null, 1)}

설명 없이 아래 JSON 형식만 출력하라. companies 순서는 입력과 같게.
{"companies":[{"news":"...","crisis":{"title":"...","text":"..."}},{"news":"...","crisis":{"title":"...","text":"..."}}]}`;
}

function applyFounding(text, model) {
  const data = parseJson(text);
  const list = data && data.companies;
  if (!Array.isArray(list) || list.length < 2) {
    throw new Error("companies 두 개가 들어 있지 않아요.");
  }
  list.slice(0, 2).forEach((r, i) => {
    if (!r || !r.news || !r.crisis || !r.crisis.title || !r.crisis.text) {
      throw new Error(`${i + 1}번째 회사의 news나 crisis가 비어 있어요.`);
    }
  });
  game.companies.forEach((c, i) => {
    const r = list[i];
    c.news = String(r.news);
    c.crisis = { title: String(r.crisis.title), text: String(r.crisis.text) };
    c.foundingByAI = true;
    c.foundingModel = model || "";
  });
}

function practiceFounding() {
  game.companies.forEach(c => {
    const industry = INDUSTRIES.find(x => x.name === c.industry);
    c.news = `[단독] '${c.name}', "${c.motto}" 사훈 내걸고 ${c.industry} 시장 출사표… ${fundingOf(c).name}로 시작`;
    c.crisis = pick(industry.crises);
    c.foundingByAI = false;
  });
}

// ===== 2. 결전 단계 (지시 전달, 보고, 판정) =====

function buildBattleRequest() {
  const input = {
    companies: game.companies.map(c => ({
      name: c.name,
      industry: c.industry,
      motto: c.motto,
      crisis: { title: c.crisis.title, text: c.crisis.text },
      ceoOrder: c.order,
      staff: chainOf(c).map(s => ({ rank: s.rank, persona: s.persona, chars: rankInfo(s.rank).chars }))
    }))
  };
  return `너는 회사 배틀 게임 "10자 사원 주식회사"의 AI 진행자다.
두 회사에서 사장의 지시가 직원들을 거쳐 내려가고, 결과가 다시 보고로 올라가는 과정을 연기하고 판정하라.

[규칙]
1. down: staff 순서대로(높은 직급부터) 각 직원이 윗사람에게 들은 말을 자기 persona와 회사 motto대로 이해해서 아랫사람에게 전달하는 말. 개수는 staff 수와 같다. 각 직원의 chars 글자 수를 절대 넘기지 마라. 성격 때문에 지시가 자연스럽게 바뀌거나 엉뚱해질수록 재밌다.
2. action: 맨 아래 직원이 받은 말대로 실제로 한 일 1문장 (40자 이내).
3. up: 맨 아래 직원부터 위로 올라가며 각 직원이 윗사람에게 하는 보고. staff의 역순이며 개수는 staff 수와 같다. 위로 갈수록 실제보다 그럴듯하게 부풀려라. 각 직원의 chars를 넘기지 마라. 마지막 항목이 사장이 받는 최종 보고다.
4. score: 사장의 원래 의도와 위기 해결에 비춰 action의 실제 결과를 0~100 정수로 판정. 엉뚱한 행동이 우연히 대박 날 수도 있다.
5. news: 결과를 다룬 경제 뉴스 헤드라인 1문장 (60자 이내). 회사 이름을 넣고, 창업 뉴스의 후속 기사처럼.
6. reason: 점수 이유 한 줄 (50자 이내).

[회사 정보]
${JSON.stringify(input, null, 1)}

설명 없이 아래 JSON 형식만 출력하라. companies 순서는 입력과 같게.
{"companies":[{"down":["..."],"action":"...","up":["..."],"score":0,"news":"...","reason":"..."},{"down":["..."],"action":"...","up":["..."],"score":0,"news":"...","reason":"..."}]}`;
}

function applyBattle(text, model) {
  const data = parseJson(text);
  const list = data && data.companies;
  if (!Array.isArray(list) || list.length < 2) {
    throw new Error("companies 두 개가 들어 있지 않아요.");
  }
  const results = game.companies.map((c, i) => {
    const r = list[i] || {};
    const chain = chainOf(c);
    if (!Array.isArray(r.down) || !Array.isArray(r.up)) {
      throw new Error(`${i + 1}번째 회사의 down이나 up이 없어요.`);
    }
    const score = Math.round(Number(r.score));
    if (!Number.isFinite(score)) throw new Error(`${i + 1}번째 회사의 score가 숫자가 아니에요.`);

    // 글자 수를 넘긴 말은 잘라내고, 몇 번 넘겼는지 셉니다 (서식4 검증 기록용)
    let over = 0;
    const fit = (s, limit) => {
      s = String(s ?? "").trim();
      if (s.length > limit) { over++; return s.slice(0, limit); }
      return s;
    };
    const down = chain.map((s, k) => fit(r.down[k] ?? "…", rankInfo(s.rank).chars));
    const upChain = [...chain].reverse();
    const up = upChain.map((s, k) => fit(r.up[k] ?? "…", rankInfo(s.rank).chars));

    return {
      down, up,
      action: String(r.action || down[down.length - 1]),
      score: Math.max(0, Math.min(100, score)),
      news: String(r.news || ""),
      reason: String(r.reason || ""),
      over, practice: false, model: model || ""
    };
  });
  game.companies.forEach((c, i) => (c.result = results[i]));
}

// ===== 연습 모드 (AI 아님: 규칙으로 흉내만 냄) =====

// 성격에 따라 말을 바꾸는 규칙. 프리셋에 없는 성격은 단어를 무작위로 빼먹습니다.
const PERSONA_RULES = {
  "회의 좋아함": t => "회의로 " + t,
  "대충 빨리": t => t.slice(0, Math.ceil(t.length / 2)) + " 대충",
  "숫자 집착": t => t + " KPI 3개",
  "밈 장인": t => t + " 밈으로",
  "아부의 달인": t => "역시 사장님! " + t,
  "퇴사 준비 중": t => "일단 " + t + " 몰라요",
  "MZ 신입": t => t + " 해야함?",
  "말 바꾸기 장인": t => t.split(" ").reverse().join(" "),
  "꼼꼼함 끝판왕": t => t,
  "실적만 봄": t => "실적 위해 " + t
};

function practiceRelay(persona, heard, limit) {
  const words = heard.split(/[\s,.]+/).filter(Boolean);
  const kept = words.filter(() => Math.random() > 0.3);
  let text = (kept.length ? kept : words).join(" ");
  const rule = PERSONA_RULES[persona];
  if (rule) text = rule(text);
  return text.slice(0, limit);
}

const INFLATE = [
  "반응 괜찮습니다",
  "성과 나오고 있습니다",
  "기대 이상 반응입니다",
  "목표 초과 달성입니다!",
  "업계 판도를 바꾸고 있습니다!"
];

function practiceBattle() {
  game.companies.forEach(c => {
    const chain = chainOf(c);
    const down = [];
    let heard = c.order;
    for (const s of chain) {
      heard = practiceRelay(s.persona, heard, rankInfo(s.rank).chars) || "…";
      down.push(heard);
    }
    const action = `${down[down.length - 1]} 실행함`;

    const upChain = [...chain].reverse();
    const up = upChain.map((s, k) => {
      const limit = rankInfo(s.rank).chars;
      const line = k === 0 ? `${down[down.length - 1]} 했습니다` : INFLATE[Math.min(k - 1, INFLATE.length - 1)];
      return line.slice(0, limit);
    });

    // 위기 키워드가 끝까지 살아남았는지로 점수 계산
    let score;
    const keywords = (c.crisis && c.crisis.keywords) || [];
    if (keywords.length) {
      const last = down[down.length - 1];
      const all = down.join(" ");
      score = 40;
      for (const k of keywords) {
        if (last.includes(k)) score += 15;
        else if (all.includes(k)) score += 5;
      }
    } else {
      score = 30 + Math.floor(Math.random() * 50);
    }
    score = Math.min(score, 100);

    const news = score >= 70
      ? `'${c.name}', ${c.crisis.title} 위기 정면 돌파… 업계 "의외의 결과"`
      : score >= 50
        ? `'${c.name}', ${c.crisis.title} 대응 무난… 직원들 "무슨 지시였는지 모름"`
        : `'${c.name}', ${c.crisis.title} 대응 실패… "사장님 말씀이 사원까지 안 갔다"`;

    c.result = { down, up, action, score, news, reason: "연습 모드: 위기 키워드가 끝까지 살아남은 만큼 점수", over: 0, practice: true };
  });
}

// ===== 공통 =====

// ChatKHU 답변에서 JSON 부분만 꺼냅니다 (```json 코드블록이나 앞뒤 설명이 붙어 있어도 됨)
function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON을 찾지 못했어요. ChatKHU 답변 전체를 붙여넣었는지 확인해 주세요.");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    throw new Error("JSON 형식이 깨졌어요. ChatKHU에 '형식에 맞게 JSON만 다시 출력해줘'라고 해 보세요.");
  }
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
