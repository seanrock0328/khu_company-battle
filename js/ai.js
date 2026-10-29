// 담당 C: ChatKHU 연결
// 한 판에 ChatKHU를 최대 10번 부릅니다: 업종 뽑기(대결의 첫 사람만) → 창업(뉴스·이벤트 8개·면접 후보) → 8분기 이벤트
// 요청문 문구를 고치면 결과가 달라집니다. 고칠 때마다 docs/ai-log.md에 기록!

// ===== 0. ChatKHU API 자동 연결 =====
// ChatKHU API Gateway (OpenAI 호환). 문서: https://docs.mindlogic.ai/docs/general/api-gateway/getting-started/overview
// API 키는 절대 코드에 쓰지 않습니다! 게임 화면에서 입력받아 그 브라우저(localStorage)에만 저장합니다.

const CHATKHU_URL = "https://factchat-cloud.mindlogic.ai/v1/gateway/chat/completions/";

// 팀 중간 서버 (Cloudflare Worker, 코드는 worker/worker.js)
// 팀 키는 이 서버에만 비밀로 저장돼 있어서, 플레이어는 키 없이 ChatKHU를 씁니다.
// Cloudflare에 배포한 뒤 받은 주소를 여기에 넣으세요. (키가 아니라 주소라서 공개돼도 괜찮음)
const TEAM_SERVER_URL = "https://khu-company-battle.seanrock0328.workers.dev";

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

// ChatKHU를 쓸 수 있는 상태인지 (팀원 개인 키가 있거나, 팀 서버 주소가 있거나)
function hasAI() { return !!getApiKey() || !!TEAM_SERVER_URL; }
function aiSourceLabel() { return getApiKey() ? "내 키" : TEAM_SERVER_URL ? "팀 서버" : ""; }

// 팀 서버를 거쳐 ChatKHU 부르기
async function callTeamServer(prompt) {
  let res;
  try {
    res = await fetch(TEAM_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, model: getModel() })
    });
  } catch (e) {
    throw new Error("팀 서버에 접속하지 못했어요. 인터넷 연결을 확인하거나 아래 '복사·붙여넣기로 하기'로 진행해 주세요.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${data.error || "팀 서버 오류가 났어요."} (${res.status}) ${data.detail || ""}`);
  if (!data.text) throw new Error("ChatKHU 답변이 비어 있어요. 다시 시도해 주세요.");
  return data.text;
}

// 팀원 개인 키가 저장돼 있으면 직접, 아니면 팀 서버를 거쳐 부릅니다
async function callChatKHU(prompt) {
  const key = getApiKey();
  if (!key && TEAM_SERVER_URL) return callTeamServer(prompt);
  if (!key) throw new Error("ChatKHU 연결이 없어요. 오른쪽 위 ChatKHU 버튼에서 키를 저장해 주세요.");
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

// ===== 1. 업종 뽑기 =====

function buildIndustryRequest() {
  const c = game.company;
  const seed = INDUSTRY_SEEDS[randInt(0, INDUSTRY_SEEDS.length - 1)];
  return `너는 회사 경영 게임 "10자 사원 주식회사"의 AI 진행자다.
대학생 플레이어가 창업할 업종을 하나 랜덤으로 정해라.
엉뚱하고 웃기지만 실제로 있을 법한 업종이어야 한다. 랜덤 키워드 "${seed}"에서 영감을 받아라.${c.industry ? `\n방금 나온 "${c.industry}"와는 전혀 다른 분야로.` : ""}

설명 없이 아래 JSON만 출력하라.
{"emoji":"이모지 1개","industry":"업종 이름 15자 이내"}`;
}

function applyIndustry(text) {
  const d = parseJson(text);
  if (!d.industry) throw new Error("업종 이름(industry)이 없어요.");
  game.company.industry = String(d.industry).slice(0, 20);
  game.company.emoji = String(d.emoji || "🏢").slice(0, 4);
}

function practiceIndustry() {
  const options = FALLBACK_INDUSTRIES.filter(x => x.industry !== game.company.industry);
  const x = options[randInt(0, options.length - 1)];
  game.company.industry = x.industry;
  game.company.emoji = x.emoji;
}

// ===== 2. 창업: 뉴스, 이벤트 3개, 면접 후보 이름·자기소개·답변 =====

function buildFoundingRequest() {
  const c = game.company;
  const input = {
    company: { name: c.name, industry: c.industry, detail: c.detail, motto: c.motto, funding: fundingOf(c).name },
    eventTypes: EVENT_ORDER,
    candidates: allCandidates(c).map(x => ({
      id: x.id, rank: x.rank, mbti: x.mbti, attachment: attachmentLabel(x),
      skill: x.skill, honesty: x.honesty, luck: x.luck
    }))
  };
  return `너는 회사 경영 게임 "10자 사원 주식회사"의 AI 진행자다. 플레이어가 방금 아래 회사를 창업했다.

[만들 것]
1. news: 창업 소식 경제 뉴스 헤드라인 1문장 (60자 이내). 회사 이름, 하는 일, 사훈, 자금 출처를 재치 있게.
2. events: eventTypes 순서대로 이벤트 ${EVENT_ORDER.length}개 (2년 동안 분기마다 하나). 각각 type은 그대로, title 15자 이내, text 50자 이내. 이 회사의 업종과 하는 일에 딱 맞게, 웃기지만 사장이 지시를 내릴 수 있는 상황으로. 위기는 해결해야 할 문제, 기회는 잘 살리면 대박인 상황. 서로 겹치지 않게, 뒤로 갈수록 규모가 커지게.
3. candidates: 면접 후보 전원(id 그대로)에 대해
   - name: 한국식 이름 3글자. 성격이 드러나는 웃긴 이름도 좋음 (예: 김대충). 실존 유명인 이름 금지.
   - intro: 면접 자기소개 30자 이내. MBTI, 애착 유형, 능력치가 은근히 드러나게, 웃기게.
   - answer: "우리 회사에서 무엇을 하고 싶나요?"에 대한 답 40자 이내. 회사가 하는 일을 반영.
   - honesty가 낮은 후보는 면접에서 허세나 그럴듯한 거짓말을 섞되, 정직도 숫자를 말하지는 마라.
   - 능력치 숫자를 그대로 말하지 마라.

[회사 정보]
${JSON.stringify(input)}

설명 없이 아래 JSON 형식만 출력하라.
{"news":"...","events":[{"type":"위기","title":"...","text":"..."}],"candidates":[{"id":1,"name":"...","intro":"...","answer":"..."}]}`;
}

function applyFounding(text, model) {
  const c = game.company;
  const d = parseJson(text);
  if (!d.news) throw new Error("창업 뉴스(news)가 없어요.");
  if (!Array.isArray(d.events) || d.events.length < EVENT_ORDER.length) throw new Error(`이벤트(events)가 ${EVENT_ORDER.length}개가 아니에요.`);
  if (!Array.isArray(d.candidates)) throw new Error("면접 후보(candidates)가 없어요.");

  const events = EVENT_ORDER.map((type, i) => {
    const e = d.events[i] || {};
    if (!e.title || !e.text) throw new Error(`${i + 1}번째 이벤트의 title이나 text가 비어 있어요.`);
    return { type, title: String(e.title), text: String(e.text) };
  });
  const byId = new Map(d.candidates.map(x => [Number(x.id), x]));
  const missing = allCandidates(c).filter(x => !byId.get(x.id) || !byId.get(x.id).name);
  if (missing.length > 3) throw new Error(`면접 후보 ${missing.length}명의 정보가 빠졌어요.`);

  c.news = String(d.news);
  c.events = events;
  allCandidates(c).forEach(x => {
    const r = byId.get(x.id) || {};
    x.name = String(r.name || pickName()).slice(0, 6);
    x.intro = String(r.intro || pick(FALLBACK_INTROS[x.type]));
    x.answer = String(r.answer || "열심히 하겠습니다.");
  });
  c.foundingByAI = true;
  c.foundingModel = model || "";
}

function practiceFounding() {
  const c = game.company;
  c.news = `[단독] '${c.name}', "${c.motto}" 사훈 내걸고 ${c.industry} 시장 출사표… ${fundingOf(c).name}로 시작`;
  c.events = EVENT_ORDER.map(type => ({ type, ...pick(FALLBACK_EVENTS[type]) }));
  const names = shuffle(FALLBACK_NAMES);
  allCandidates(c).forEach((x, i) => {
    x.name = names[i % names.length];
    x.intro = pick(FALLBACK_INTROS[x.type]);
    x.answer = x.honesty <= 3 ? "제가 오면 매출 10배입니다. 진짜로요." : "맡겨 주시는 일 성실히 하겠습니다.";
  });
  c.foundingByAI = false;
}

let usedNames = new Set();
function pickName() {
  const left = FALLBACK_NAMES.filter(n => !usedNames.has(n));
  const n = left.length ? pick(left) : pick(FALLBACK_NAMES);
  usedNames.add(n);
  return n;
}

// ===== 3. 이벤트: 지시 전달, 거짓말, 보고, 판정 =====

function buildEventRequest() {
  const c = game.company;
  const i = game.round;
  const round = c.rounds[i];
  const input = {
    company: { name: c.name, industry: c.industry, detail: c.detail, motto: c.motto },
    quarter: `${quarterLabel(i)} (${i + 1}/${ROUNDS})`,
    event: c.events[i],
    ceoOrder: round.order,
    staff: staffOf(c).map(x => ({
      rank: x.rank, name: x.name, mbti: x.mbti, attachment: attachmentLabel(x),
      skill: x.skill, honesty: x.honesty, luck: x.luck, loyalty: x.loyalty, chars: rankInfo(x.rank).chars
    })),
    // 최근 3분기만 (요청문이 너무 길어지지 않게)
    previousRounds: c.rounds.slice(Math.max(0, i - 3), i).map((r, k) => ({
      event: c.events[Math.max(0, i - 3) + k].title, score: r.result.score, news: r.result.news,
      ceoReaction: r.choice === "praise" ? "칭찬" : "파고듦"
    }))
  };
  return `너는 회사 경영 게임 "10자 사원 주식회사"의 AI 진행자다.
사장의 지시가 staff를 거쳐 내려가고, 결과가 다시 보고로 올라가는 과정을 각 직원의 성격대로 연기하고 판정하라.

[직원 성격 규칙]
- skill(능력 1~10): 높으면 지시를 정확히 이해하고 일을 잘함. 낮으면 실수로 말을 잘못 전달함(실수는 거짓말이 아님).
- honesty(정직 1~10): 낮을수록 자기에게 유리하게 일부러 말을 바꾸거나 거짓말함. 8 이상은 거의 거짓말하지 않음.
- attachment: 회피형이 강할수록 문제를 숨기고 책임을 피함. 안정형은 문제도 솔직하게 말함.
- luck(운 1~10): 높은 직원이 있으면 가끔 엉뚱한 행동이 우연히 대박 남.
- loyalty(충성심 0~10): 높을수록 성실하고 거짓말을 덜 함. 3 이하면 대충 하고 불만을 섞어 말함.
- mbti 성향도 말투와 판단에 반영.

[출력 규칙]
1. down: staff 순서대로(높은 직급부터) 각 직원이 윗사람에게 들은 말을 아랫사람에게 전달하는 말. 개수는 staff 수와 같다. say는 각자의 chars 글자 수를 절대 넘기지 마라. 일부러 바꾸거나 거짓을 섞었으면 lie: true.
2. action: 맨 아래 직원이 받은 말대로 실제로 한 일 1문장 (40자 이내).
3. up: 맨 아래 직원부터 위로 올라가며 각 직원이 윗사람에게 하는 보고. staff의 역순, 개수는 staff 수와 같다. say는 chars 이내. 문제를 숨기거나 부풀렸으면 lie: true. 마지막 항목이 사장이 받는 최종 보고.
4. score: 0~100 정수. ${input.event.type === "기회" ? "기회를 얼마나 잘 살렸는지" : "위기를 얼마나 해결했는지"} 기준. 실제 결과 50점, 사장 의도가 지켜진 정도 30점, 재미와 반전 20점. 여러 플레이어의 순위를 매기므로 기준을 일관되게.
5. news: 결과를 다룬 경제 뉴스 헤드라인 1문장 (60자 이내). 이전 라운드가 있으면 이어지는 이야기로.
6. reason: 점수 이유 한 줄 (50자 이내). 결정적이었던 직원 이름을 넣어라.
7. audit: 사장이 "제대로 했는지 파고들었을 때" 드러나는 사실 한 문장 (50자 이내). 거짓말이 있었다면 누가 무엇을 숨겼는지.

[상황]
${JSON.stringify(input)}

설명 없이 아래 JSON 형식만 출력하라.
{"down":[{"say":"...","lie":false}],"action":"...","up":[{"say":"...","lie":false}],"score":0,"news":"...","reason":"...","audit":"..."}`;
}

function applyEvent(text, model) {
  const c = game.company;
  const d = parseJson(text);
  if (!Array.isArray(d.down) || !Array.isArray(d.up)) throw new Error("down이나 up이 없어요.");
  const score = Math.round(Number(d.score));
  if (!Number.isFinite(score)) throw new Error("score가 숫자가 아니에요.");

  const staff = staffOf(c);
  let over = 0;
  const fit = (item, rank) => {
    const limit = rankInfo(rank).chars;
    const raw = typeof item === "string" ? { say: item, lie: false } : (item || {});
    let say = String(raw.say ?? "…").trim() || "…";
    if (say.length > limit) { over++; say = say.slice(0, limit); }
    return { say, lie: raw.lie === true || raw.lie === "true" };
  };
  c.rounds[game.round].result = {
    down: staff.map((x, k) => fit(d.down[k], x.rank)),
    up: [...staff].reverse().map((x, k) => fit(d.up[k], x.rank)),
    action: String(d.action || "…"),
    score: Math.max(0, Math.min(100, score)),
    news: String(d.news || ""),
    reason: String(d.reason || ""),
    audit: String(d.audit || "특별히 숨긴 것은 없었습니다."),
    over, practice: false, model: model || ""
  };
}

// 연습 모드 (AI 아님: 능력치로 흉내만 냄)
const LIES_DOWN = ["일단 쉬어도 된대", "사장님이 알아서 하래", "대충 해도 된대", "이건 내 공으로 하자"];
const LIES_UP = ["완벽하게 끝냈습니다!", "반응 폭발입니다", "목표 초과 달성!", "업계 1위 예상입니다"];

function practiceEvent() {
  const c = game.company;
  const staff = staffOf(c);
  const down = [];
  let heard = c.rounds[game.round].order;
  for (const x of staff) {
    const limit = rankInfo(x.rank).chars;
    const lie = (x.honesty <= 3 || x.loyalty <= 2) && Math.random() < 0.6;
    if (lie) heard = pick(LIES_DOWN);
    else {
      const words = heard.split(/[\s,.]+/).filter(Boolean);
      const kept = words.filter(() => Math.random() > (10 - x.skill) / 20);
      heard = (kept.length ? kept : words).join(" ");
    }
    down.push({ say: heard.slice(0, limit) || "…", lie });
  }
  const last = down[down.length - 1].say;
  const up = [...staff].reverse().map((x, k) => {
    const limit = rankInfo(x.rank).chars;
    const lie = (x.honesty <= 4 || x.secure < 40) && Math.random() < 0.7;
    const say = k === 0 && !lie ? `${last} 했습니다` : lie ? pick(LIES_UP) : "솔직히 애매합니다";
    return { say: say.slice(0, limit), lie };
  });
  const avgSkill = staff.reduce((s, x) => s + x.skill, 0) / staff.length;
  const maxLuck = Math.max(...staff.map(x => x.luck));
  const lies = down.filter(x => x.lie).length;
  const score = Math.max(0, Math.min(100, Math.round(25 + avgSkill * 5 + Math.random() * maxLuck * 3 - lies * 8)));
  const ev = c.events[game.round];
  c.rounds[game.round].result = {
    down, up, action: `${last} 실행함`, score,
    news: score >= 60 ? `'${c.name}', ${ev.title} ${ev.type === "기회" ? "기회 잡았다" : "정면 돌파"}` : `'${c.name}', ${ev.title} 앞에서 우왕좌왕`,
    reason: "연습 모드: 평균 능력, 운, 거짓말 수로 계산",
    audit: lies ? `${staff.filter((x, k) => down[k].lie).map(x => x.name).join(", ")}이(가) 지시를 바꿔 전달했습니다.` : "모두 지시대로 전달했습니다.",
    over: 0, practice: true, model: ""
  };
}

// ===== 공통 =====

function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON을 찾지 못했어요. ChatKHU 답변 전체를 붙여넣었는지 확인해 주세요.");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    throw new Error("JSON 형식이 깨졌어요. 다시 시도하거나, ChatKHU에 '형식에 맞게 JSON만 다시 출력해줘'라고 해 보세요.");
  }
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// 단계별 묶음: 화면(main.js)은 이 표만 보고 ChatKHU를 부릅니다
const AI_STEPS = {
  industry: {
    title: "ChatKHU가 업종을 뽑는 중",
    lead: "엉뚱하지만 있을 법한 업종을 ChatKHU가 골라 줍니다.",
    build: buildIndustryRequest, apply: (t) => applyIndustry(t), practice: practiceIndustry
  },
  founding: {
    title: "ChatKHU가 창업 소식과 면접 후보를 준비 중",
    lead: "창업 뉴스, 2년 동안 닥칠 이벤트 8개, 직급별 면접 후보 18명의 자기소개를 만듭니다. 30초~1분 걸려요.",
    build: buildFoundingRequest, apply: applyFounding, practice: practiceFounding
  },
  event: {
    title: "ChatKHU가 직원들을 연기하는 중",
    lead: "지시가 내려가며 바뀌고, 누군가는 거짓말을 합니다. 보고는 부풀려져 올라옵니다.",
    build: buildEventRequest, apply: applyEvent, practice: practiceEvent
  }
};
