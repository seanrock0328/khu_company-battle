// 담당 A: 화면 그리기
// 계산은 game.js, AI는 ai.js에 맡기고 여기서는 보여주기만 합니다.
// 사용자가 쓴 글이나 AI가 쓴 글은 반드시 esc()를 거쳐서 넣기!
// 연출(도장, 숫자 올라가기, 흔들림, 기다림)도 모두 여기 있습니다. 게임 상태와 공개 순서는 바꾸지 않습니다.

const BUBBLE_DELAY = 420;    // 말풍선이 뜬 뒤 다음 사람까지 쉬는 시간 (ms)
const TYPING_DELAY = 380;    // 말풍선 전에 "입력 중…"을 보여 주는 시간 (ms)
const SUSPENSE_DELAY = 1100; // 파고들기/칭찬하기 직후 두구두구 (ms)
const BIG_LOSS = -3000;      // 분기 수익이 이 이하면 화면이 흔들림 (만원)
const FUND_ICONS = { parents: "👪", angel: "😇", vc: "🦈" };

function showScreen(id) {
  const screen = document.getElementById(id);
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  screen.classList.add("active");
  document.body.dataset.screen = id;
  if (id !== "screen-ai") stopAIWait();
  const step = screen.dataset.step;
  if (step) {
    let passed = true;
    document.querySelectorAll(".steps li").forEach(li => {
      li.classList.toggle("current", li.dataset.step === step);
      if (li.dataset.step === step) passed = false;
      li.classList.toggle("done", passed);
    });
  }
  window.scrollTo(0, 0);
}

function renderSettingsButton() {
  const btn = document.getElementById("btn-settings");
  const model = CHATKHU_MODELS.find(m => m.id === getModel());
  const shown = model ? model.name.replace(/ \(.*\)/, "") : getModel();
  const full = hasAI() ? `ChatKHU · ${shown} · ${aiSourceLabel()}` : "ChatKHU 연결";
  btn.innerHTML = hasAI()
    ? `<span aria-hidden="true">🔌</span> ChatKHU<small class="pill-more"> · ${esc(shown)} · ${esc(aiSourceLabel())}</small>`
    : `<span aria-hidden="true">⚠️</span> ChatKHU 연결`;
  btn.title = full;
  btn.setAttribute("aria-label", full);
  btn.classList.toggle("warn", !hasAI());
}

function companyTitle(c) {
  return `<div class="ctitle">
    <span class="emoji" aria-hidden="true">${esc(c.emoji)}</span>
    <div><b>${esc(c.name)}</b><small>${esc(c.industry)} · 사장 ${esc(c.player)}</small></div>
  </div>
  <p class="motto"><span class="motto-tag">사훈</span> "${esc(c.motto)}"</p>`;
}

// ===== 연출 도구 =====

function reduceMotion() {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

// 탭하면 바로 끝나는 기다림. skipReveal()이 불리면 남은 기다림이 모두 즉시 풀립니다.
let skipping = false;
let skipWaiters = [];

function beat(ms) {
  if (skipping || ms <= 0) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      skipWaiters = skipWaiters.filter(f => f !== done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    skipWaiters.push(done);
  });
}

function skipReveal() {
  skipping = true;
  skipWaiters.slice().forEach(f => f());
  document.querySelectorAll(".messenger.playing").forEach(r => r.classList.add("skipped"));
}

function resetSkip() {
  skipping = false;
  skipWaiters = [];
}

function rankNo(rank) {
  const i = HIRE_RANKS.indexOf(rank);
  return i < 0 ? 0 : i + 1; // 0 = 사장, 1 = 임원 … 6 = 사원
}

function initial(name) {
  return Array.from(String(name || "?").trim())[0] || "?";
}

// 직급 색 프로필 동그라미. person이 없으면 사장(나)
function avatar(person, size) {
  const no = person ? rankNo(person.rank) : 0;
  return `<span class="ava rk-${no}${size ? " " + size : ""}" aria-hidden="true">${person ? esc(initial(person.name)) : "👑"}</span>`;
}

function rankChip(rank) {
  return `<span class="rank rk-${rankNo(rank)}">${esc(rank)}</span>`;
}

// 원고지 글자칸 (1칸 = 10자)
function cells(n, cls) {
  return `<span class="cells ${cls || ""}" aria-hidden="true">${"<i></i>".repeat(Math.max(0, n))}</span>`;
}

function stamp(text, cls) {
  return `<span class="stamp ${cls || ""}">${esc(text)}</span>`;
}

// 숫자가 0부터 올라가는 연출. 끝나면 반드시 정확한 값(to)을 보여 줍니다.
function countUp(el, to, ms, format) {
  const show = format || (v => money(Math.round(v / 10) * 10));
  return new Promise(resolve => {
    if (!el) return resolve();
    const steps = Math.max(1, Math.round((ms || 900) / 40));
    const finish = () => { el.textContent = format ? format(to) : money(to); resolve(); };
    if (reduceMotion() || skipping) return finish();
    let k = 0;
    const tick = () => {
      k = skipping ? steps : k + 1;
      const t = Math.min(1, k / steps);
      if (t >= 1) return finish();
      el.textContent = show(to * (1 - Math.pow(1 - t, 3)));
      setTimeout(tick, 40);
    };
    tick();
  });
}

function replay(el, cls, ms) {
  if (!el || reduceMotion()) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  if (ms) setTimeout(() => el.classList.remove(cls), ms);
}

function shakeScreen() {
  replay(document.querySelector("main"), "shake", 700);
}

function today() {
  try {
    return new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "";
  }
}

// 누적 수익 꺾은선 (이미 끝난 분기만). big이면 결산용 큰 그래프
function profitChart(c, big) {
  const pts = [0];
  c.rounds.forEach(r => { if (typeof r.profit === "number") pts.push(pts[pts.length - 1] + r.profit); });
  const W = big ? 340 : 132, H = big ? 150 : 46, padX = big ? 22 : 7, padY = big ? 18 : 7;
  const max = Math.max(1000, ...pts), min = Math.min(-1000, ...pts);
  const x = i => padX + (W - 2 * padX) * i / ROUNDS;
  const y = v => padY + (H - 2 * padY) * (max - v) / (max - min);
  const last = pts[pts.length - 1];
  const tone = last < 0 ? "neg" : "pos";
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const slots = Array.from({ length: ROUNDS + 1 }, (_, i) => i).filter(i => i >= pts.length)
    .map(i => `<circle class="slot" cx="${x(i).toFixed(1)}" cy="${y(0).toFixed(1)}" r="${big ? 4 : 2.5}"/>`).join("");
  const dots = pts.map((v, i) => `<circle class="dot ${v < 0 ? "neg" : "pos"} ${i === pts.length - 1 ? "last" : ""}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${big ? (i === pts.length - 1 ? 6 : 4.5) : (i === pts.length - 1 ? 4 : 2.6)}"/>`).join("");
  const labels = big ? Array.from({ length: ROUNDS }, (_, i) => `<text class="lbl" x="${x(i + 1).toFixed(1)}" y="${H - 2}">${esc(quarterLabel(i).split(" ").pop())}</text>`).join("")
    + `<text class="lbl zero-lbl" x="${padX - 4}" y="${(y(0) - 4).toFixed(1)}">0</text>` : "";
  return `<svg class="spark ${big ? "big" : ""} ${tone}" viewBox="0 0 ${W} ${H}" role="img" aria-label="누적 수익 추이, 지금 ${money(last)}">
    <line class="zero" x1="${padX}" x2="${W - padX}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>
    ${pts.length > 1 ? `<path class="area" d="${area}"/><path class="line" d="${line}"/>` : ""}
    ${slots}${dots}${labels}
  </svg>`;
}

// 1년 4분기 진행 막대
function quarterTrack(c) {
  return `<ol class="quarter-track" aria-label="1년 경영 진행도">${Array.from({ length: ROUNDS }, (_, i) => {
    const type = (c.events[i] && c.events[i].type) || EVENT_ORDER[i];
    const r = c.rounds[i];
    const state = i < game.round ? "done" : i === game.round ? "current" : "";
    const result = state === "done" && r && typeof r.profit === "number"
      ? `<em class="${r.profit < 0 ? "neg" : "pos"}">${money(r.profit)}</em>` : "";
    return `<li class="${state} ${type === "기회" ? "chance" : "crisis"}" title="${esc(quarterLabel(i))}" ${state === "current" ? 'aria-current="step"' : ""}>
      <span class="q-node" aria-hidden="true">${state === "done" ? "✓" : type === "기회" ? "✨" : "⚠️"}</span>
      <b>${esc(quarterLabel(i).split(" ").pop())}</b><small>${esc(type)}</small>${result}</li>`;
  }).join("")}</ol>`;
}

// ===== 창업 =====

function renderFound() {
  const c = game.company;
  const season = getSeason();
  const industryHtml = season
    ? `<div class="industry-card">
         <span class="emoji" aria-hidden="true">${esc(c.emoji)}</span>
         <div><small>이번 대결 업종 · 모든 사장님이 같아요</small><b>${esc(c.industry)}</b></div>
       </div>`
    : c.industry
    ? `<div class="industry-card fresh">
         <span class="emoji" aria-hidden="true">${esc(c.emoji)}</span>
         <div><small>ChatKHU가 뽑은 업종 · 이번 대결의 업종이 됩니다</small><b>${esc(c.industry)}</b></div>
       </div>
       <button class="text-btn" data-action="roll" ${c.rolls >= MAX_ROLLS ? "disabled" : ""}>
         ${c.rolls >= MAX_ROLLS ? "다시 뽑기 사용함" : "🎲 다시 뽑기 (1회)"}</button>`
    : `<button class="roll-btn" data-action="roll"><span class="dice" aria-hidden="true">🎲</span> ChatKHU로 대결 업종 뽑기</button>
       <p class="hint">처음 뽑은 업종이 이번 대결의 업종이 되어, 다음 사장님들도 같은 업종으로 겨룹니다.</p>`;

  const funding = FUNDING.map(f => `
    <label class="fund ${c.funding === f.id ? "picked" : ""}">
      <input type="radio" name="fund" value="${f.id}" ${c.funding === f.id ? "checked" : ""} data-action="fund">
      <span class="fund-ico" aria-hidden="true">${FUND_ICONS[f.id] || "💰"}</span>
      <b>${esc(f.name)}</b><span class="fund-budget">인건비 예산 <strong>${f.budget}</strong></span><small>${esc(f.note)}</small>
    </label>`).join("");

  document.getElementById("found-box").innerHTML = `
    <label class="field">사장님 닉네임 <span class="hint">(순위표에 나와요)</span>
      <input data-field="player" maxlength="${PLAYER_MAX}" value="${esc(c.player)}" placeholder="예: 경희왕">
    </label>
    <p class="field-label">업종</p>
    ${industryHtml}
    <label class="field">우리 회사는 무슨 일을 하나요? <span class="counter" data-for="detail">${c.detail.length} / ${DETAIL_MAX}</span>
      <textarea data-field="detail" maxlength="${DETAIL_MAX}" rows="2" placeholder="예: 시험기간에 교수님 몰래 족보를 배달해 줌">${esc(c.detail)}</textarea>
    </label>
    <label class="field">회사 이름
      <input data-field="name" maxlength="${NAME_MAX}" value="${esc(c.name)}" placeholder="예: 족보특급">
    </label>
    <label class="field">사훈 <span class="counter" data-for="motto">${c.motto.length} / ${MOTTO_MAX}</span>
      <input data-field="motto" maxlength="${MOTTO_MAX}" value="${esc(c.motto)}" placeholder="예: 빠르게 실패하자">
    </label>
    <p class="field-label">창업 자금</p>
    <div class="funds">${funding}</div>
  `;
}

// ===== ChatKHU 단계 화면 =====

let aiKind = "event";
let aiTimer = null;

function renderAIScreen(step) {
  aiKind = Object.keys(AI_STEPS).find(k => AI_STEPS[k] === step) || "event";
  document.getElementById("ai-title").textContent = step.title;
  document.getElementById("ai-lead").textContent = step.lead;
  document.getElementById("ai-request").value = step.build();
  document.getElementById("ai-response").value = "";
  document.getElementById("btn-copy").textContent = "요청문 복사하기";
  document.getElementById("manual-box").open = false;
  setAIState(hasAI() ? "busy" : "nokey");
}

// state: busy | error | nokey
function setAIState(state, message) {
  document.getElementById("ai-spinner").hidden = state !== "busy";
  document.getElementById("ai-status-text").textContent = {
    busy: `ChatKHU가 쓰는 중… 보통 10~40초 걸려요. (${getModel()})`,
    error: "ChatKHU에서 결과를 받지 못했어요.",
    nokey: "ChatKHU API 키가 아직 없어요. 연결하면 버튼 없이 자동으로 진행돼요."
  }[state];
  document.getElementById("ai-error").textContent = state === "error" ? message : "";
  document.getElementById("btn-ai-retry").hidden = state !== "error";
  document.getElementById("btn-ai-connect").hidden = state !== "nokey";
  document.getElementById("btn-practice").disabled = state === "busy";
  if (state === "error") document.getElementById("manual-box").open = true;
  if (state === "busy") startAIWait();
  else stopAIWait();
}

// 기다리는 동안 보여 줄 직원들의 속마음 (ChatKHU 답변과 무관한 연출용 문구)
const AI_THOUGHTS = {
  industry: [
    ["사원", "업종이 뭐든 야근만 없으면…"], ["임원", "내 골프 일정과 맞는 업종이길"],
    ["대리", "붕어빵 회사면 간식은 해결이다"], ["부장", "업종이 뭐든 회의는 한다"],
    ["과장", "설마 우주 사업은 아니겠지"], ["차장", "업종 정해지면 명함부터 파야지"]
  ],
  founding: [
    ["사원", "자기소개 10자로 줄이는 중… '열심히하겠습니다'"], ["임원", "정직도는 안 물어보겠지?"],
    ["대리", "MBTI 물어보면 뭐라고 하지"], ["부장", "면접장 의자가 왜 이렇게 낮아"],
    ["과장", "전 직장 얘기는 적당히 부풀려야지"], ["차장", "연봉 협상… 일단 웃자"]
  ],
  event: {
    임원: ["보고서 표지 색이 마음에 안 드는데", "이 정도면 잘됐다고 하자"],
    부장: ["또 회의야…", "내가 들은 거랑 좀 다른데?"],
    차장: ["부장님 말을 40자로 줄이라고?", "점심 뭐 먹지"],
    과장: ["30자… 조사는 빼도 되겠지", "엑셀이 또 멈췄다"],
    대리: ["20자면 이모티콘은 포기", "'알아서 잘'이라고 전하자"],
    사원: ["10자면 '네 알겠습니다'도 빠듯해", "아무도 나한테 설명을 안 해 줘"]
  }
};

function aiThoughts() {
  if (aiKind === "event") {
    const staff = transmissionStaff(game.company);
    const lines = [];
    for (let j = 0; j < 2; j++) {
      staff.forEach(x => {
        const pool = AI_THOUGHTS.event[x.rank] || [];
        if (pool[j]) lines.push({ person: x, who: `${x.rank} ${x.name}`, text: pool[j] });
      });
    }
    if (lines.length) return lines;
  }
  const list = Array.isArray(AI_THOUGHTS[aiKind]) ? AI_THOUGHTS[aiKind] : AI_THOUGHTS.founding;
  return list.map(([rank, text]) => ({
    person: { rank, name: rank },
    who: aiKind === "founding" ? `${rank} 지원자` : `미래의 ${rank}`,
    text
  }));
}

function aiTips() {
  return [
    `💡 성과 ${SUCCESS_LINE}점 이상이면 '잘 수행함'으로 판정해요`,
    `💡 못한 일을 칭찬하면 ${money(-PRAISE_FAIL_PENALTY)} 불이익!`,
    `💡 사원은 지시를 ${rankInfo("사원").chars}자까지만 전달해요`,
    "💡 정직도는 입사 후에야 알 수 있어요",
    "💡 충성심이 0이 되면 짐을 싸서 퇴사해요",
    "💡 사장 필살기는 한 판에 딱 한 번!",
    "💡 보고는 올라갈수록 부풀려져요. 단서를 의심하세요",
    "💡 마지막 분기엔 🛡️ 안전 또는 🚀 도전 전략을 골라요"
  ];
}

function startAIWait() {
  stopAIWait();
  const fill = document.getElementById("ai-progress-fill");
  const clock = document.getElementById("ai-elapsed");
  const thought = document.getElementById("ai-thought");
  const tip = document.getElementById("ai-tip");
  const lines = aiThoughts();
  const tips = aiTips();
  const started = Date.now();
  const offset = game.round || 0;
  let tick = 0;
  const step = () => {
    const sec = Math.floor((Date.now() - started) / 1000);
    if (fill) fill.style.width = `${Math.min(95, 4 + (1 - Math.exp(-sec / 15)) * 92).toFixed(1)}%`;
    if (clock) clock.textContent = `⏱ ${sec}초`;
    if (tick % 3 === 0 && thought && lines.length) {
      const line = lines[(tick / 3 + offset) % lines.length];
      thought.innerHTML = `<div class="thought-pop">${avatar(line.person)}<p class="thought-bubble"><b>${esc(line.who)}</b> ${esc(line.text)}</p></div>`;
    }
    if (tick % 6 === 0 && tip) {
      tip.textContent = tips[(tick / 6 + offset) % tips.length];
      replay(tip, "fresh");
    }
    tick++;
  };
  step();
  aiTimer = setInterval(step, 1000);
}

function stopAIWait() {
  clearInterval(aiTimer);
  aiTimer = null;
}

// ===== 창업 뉴스 =====

function renderFoundingNews() {
  const c = game.company;
  document.getElementById("founding-news").innerHTML = `
    <article class="news founding">
      <div class="masthead"><span>창간 특집</span><b>경희경제신문</b><span>${esc(today())}</span></div>
      <p class="paper">오늘의 창업 <span>${c.foundingByAI ? `ChatKHU 작성${c.foundingModel ? " · " + esc(c.foundingModel) : ""}` : "연습 모드"}</span></p>
      <h3>${esc(c.news)}</h3>
      ${companyTitle(c)}
      <p class="detail">${esc(c.detail)}</p>
      ${stamp("창업 승인", "news-stamp")}
    </article>
    <div class="card teaser">
      <p class="teaser-title"><b>1년, 4분기</b> 동안 위기 ${EVENT_ORDER.filter(t => t === "위기").length}번과 기회 ${EVENT_ORDER.filter(t => t === "기회").length}번이 찾아옵니다.</p>
      <ol class="plan">${EVENT_ORDER.map((t, i) => `<li class="${t === "기회" ? "chance" : "crisis"}" style="--i:${i}"><small>${esc(quarterLabel(i))}</small><b>${t === "기회" ? "✨ 기회" : "⚠️ 위기"}</b></li>`).join("")}</ol>
      <p class="hint">1년 누적 수익으로 순위를 겨룹니다. 인건비 예산은 ${budgetOf(c)}, 분기마다 연봉 1당 ${COST_PER_SALARY}만원이 나갑니다.</p>
    </div>`;
}

// ===== 면접 =====

const STAT_ICONS = { 능력: "⚔️", 운: "🍀", 정직: "😇" };

function statBar(label, value, cls) {
  return `<div class="stat ${cls || ""}"><span><i aria-hidden="true">${STAT_ICONS[label] || ""}</i>${esc(label)}</span>
    <div class="bar"><div style="width:${value * 10}%"></div></div><b>${value}</b></div>`;
}

let seenHires = null;     // 방금 채용했는지 알아내려고 기억해 두는 직전 채용 상태
let seenAsked = null;     // 방금 받은 답변에만 등장 효과를 주려고
let lastInterview = null;

// 채용 직후 다음 직급으로 넘어가도 "합격!" 도장이 보이게 잠깐 띄웁니다
function hireFlash(c) {
  const before = seenHires && seenHires.company === c ? seenHires.hires : null;
  seenHires = { company: c, hires: { ...c.hires } };
  if (!before) return null;
  const rank = HIRE_RANKS.find(r => c.hires[r] && c.hires[r] !== before[r]);
  if (!rank) return null;
  const x = candidateById(c, c.hires[rank]);
  const pop = document.getElementById("hire-pop");
  if (!x || !pop) return null;
  pop.innerHTML = `<div class="hire-card rk-${rankNo(rank)}" role="status">
      <p class="id-strip"><span>${esc(rank)} 사원증</span><span>${esc(c.name)}</span></p>
      ${avatar(x, "big")}<b>${esc(x.name)}</b><small>${esc(rank)} · 연봉 ${x.salary}</small>
      ${stamp("합격!", "hire-stamp")}
    </div>`;
  pop.hidden = false;
  replay(pop, "show");
  clearTimeout(hireFlash.timer);
  hireFlash.timer = setTimeout(() => { pop.hidden = true; }, reduceMotion() ? 1200 : 1500);
  return x.id;
}

function renderInterview(index) {
  const c = game.company;
  const rank = HIRE_RANKS[index];
  const info = rankInfo(rank);
  const used = payroll(c);
  const budget = budgetOf(c);
  const fresh = hireFlash(c);
  const asked = seenAsked && seenAsked.company === c ? seenAsked.counts : {};
  const entering = lastInterview !== `${index}`;
  lastInterview = `${index}`;

  const tabs = HIRE_RANKS.map((r, i) => {
    const hired = c.hires[r] ? candidateById(c, c.hires[r]) : null;
    return `<button class="tab rk-${i + 1} ${i === index ? "current" : ""} ${hired ? "filled" : ""}" data-action="tab" data-i="${i}" ${i === index ? 'aria-current="step"' : ""}>
      <span class="tab-dot" aria-hidden="true">${hired ? "✓" : esc(initial(r))}</span>
      <span class="tab-rank">${esc(r)}</span><small>${hired ? esc(hired.name) : "공석"}</small></button>`;
  }).join("");

  const cards = c.candidates[rank].map(x => {
    const hired = c.hires[rank] === x.id;
    const newAnswer = (asked[x.id] ?? x.interviewed.length) < x.interviewed.length;
    return `
    <article class="candidate rk-${rankNo(rank)} ${hired ? "hired" : ""}">
      <p class="id-strip"><span>${esc(rank)} 지원자 · 이력서</span><span class="id-no">No.${String(x.id).padStart(3, "0")}</span></p>
      <div class="cand-head">
        ${avatar(x, "big")}
        <div class="cand-id">
          <b>${esc(x.name)}</b>
          <div class="chips"><span class="chip">${esc(x.mbti)}</span>
          <span class="chip ${x.secure >= 50 ? "secure" : "avoid"}">${esc(attachmentLabel(x))}</span></div>
        </div>
      </div>
      <p class="intro">"${esc(x.intro)}"</p>
      <div class="stats">
        ${statBar("능력", x.skill)}
        ${statBar("운", x.luck, "luck")}
        <div class="stat hidden-stat"><span><i aria-hidden="true">🔒</i>정직</span><div class="bar"><div></div></div><b>???</b></div>
      </div>
      <div class="interview-questions" aria-label="${esc(x.name)}에게 할 질문">
        ${INTERVIEW_QUESTIONS.map(q => `<button class="secondary small q-btn" data-action="ask" data-id="${x.id}" data-question="${q.id}" aria-pressed="${x.interviewed.includes(q.id)}">${esc(q.label)}${x.interviewed.includes(q.id) ? " ✓" : ""}</button>`).join("")}
      </div>
      ${x.interviewed.length ? x.interviewed.map((id, k) => `<div class="qa ${newAnswer && k === x.interviewed.length - 1 ? "fresh" : ""}">
        <p class="q">Q. ${esc(INTERVIEW_QUESTIONS.find(q => q.id === id).question)}</p>
        <p class="a">${esc(interviewAnswer(x, id))}</p>
      </div>`).join("") : '<p class="hint qa-empty">질문을 골라 답변을 들어 보세요. 면접 답변이 모두 진실일까요?</p>'}
      <div class="cand-foot">
        <span class="salary"><span aria-hidden="true">💰</span> 연봉 <b>${x.salary}</b></span>
        <button class="${hired ? "secondary" : "primary"} small" data-action="hire" data-id="${x.id}" ${!x.interviewed.length ? "disabled" : ""}>${hired ? "채용됨 ✓" : "채용"}</button>
      </div>
      ${hired ? stamp("합격!", `hire-stamp${fresh === x.id ? " fresh" : ""}`) : ""}
    </article>`;
  }).join("");

  seenAsked = { company: c, counts: Object.fromEntries(allCandidates(c).map(x => [x.id, x.interviewed.length])) };

  const pct = Math.min(100, used / budget * 100);
  const last = index === HIRE_RANKS.length - 1;
  document.getElementById("interview").innerHTML = `
    <div class="tabs">${tabs}</div>
    <div class="budget-wrap">
      <div class="budget ${pct >= 90 ? "tight" : ""}" role="img" aria-label="인건비 ${used} / ${budget}"><div style="width:${pct}%"></div></div>
      <p class="spent"><span aria-hidden="true">💰</span> 인건비 <b>${used} / ${budget}</b> · ${esc(fundingOf(c).name)}</p>
    </div>
    <h3 class="rank-title rk-${rankNo(rank)}">${avatar({ rank, name: rank })} ${esc(rank)} 면접 <small>지시를 ${info.chars}자까지 전달 ${cells(info.chars / 10)}</small></h3>
    <div class="candidates ${entering ? "enter" : ""}">${cards}</div>
    <div class="row center">
      <button class="text-btn" data-action="vacant">이 자리는 비워 두기 (지시가 건너뜀)</button>
    </div>
    <div class="row center">
      ${index > 0 ? `<button class="secondary" data-action="prev">← ${esc(HIRE_RANKS[index - 1])}</button>` : ""}
      <button class="primary" data-action="${last ? "done" : "next"}">${last ? "면접 끝, 업무 시작" : `${esc(HIRE_RANKS[index + 1])} 면접 →`}</button>
    </div>`;
}

// ===== 이벤트 =====

function hearts(n) {
  return `<span class="hearts" title="충성심 ${n}/10" aria-label="충성심 ${n}/10">${"♥".repeat(Math.ceil(n / 2))}<span class="empty">${"♥".repeat(5 - Math.ceil(n / 2))}</span> ${n}/10</span>`;
}

function splitIcon(name) {
  const m = /^(\S+)\s+(.+)$/.exec(String(name));
  return m && /\p{Extended_Pictographic}/u.test(m[1]) ? [m[1], m[2]] : ["⚡", String(name)];
}

function powerPanel(stage) {
  const c = game.company;
  const used = c.powerUsed;
  const staff = staffOf(c);
  return `<section class="power-panel" aria-label="사장 필살기">
    <h3><span>⚡ 사장 필살기</span> <small>${used ? "남은 횟수 0 / 1" : "세 가지 중 한 번만 사용"}</small></h3>
    ${used ? `<p class="hint">${quarterLabel(used.round)}에 ${esc(CEO_POWERS.find(p => p.id === used.id).name)} 사용</p>` : ""}
    <div class="power-grid">${CEO_POWERS.map(p => {
      const disabled = used || !staff.length || (stage === "before" ? p.id === "visit" : p.id !== "visit")
        || (p.id === "direct" && staff.length < 2) || (p.id === "dinner" && staff.every(x => x.loyalty === LOYALTY_MAX));
      const [icon, label] = splitIcon(p.name);
      const spent = used && used.id === p.id;
      return `<button type="button" class="secondary power-button ${spent ? "used" : ""}" data-power="${p.id}" ${disabled ? "disabled" : ""}>
        <span class="pw-ico" aria-hidden="true">${esc(icon)}</span>
        <span class="pw-text"><b>${esc(label)}</b><span class="pw-when">${esc(p.when)}</span><small>${esc(p.text)}</small></span>
        ${spent ? stamp("사용함", "used-stamp") : ""}</button>`;
    }).join("")}</div>
  </section>`;
}

function renderDecisionTools() {
  const round = game.company.rounds[game.round];
  const box = document.getElementById("decision-tools");
  box.innerHTML = `<section class="clues" aria-label="보고와 비교할 추리 단서">
    <h3>🗂️ 보고 옆에 놓인 단서</h3>
    ${cluesFor(round).map((text, k) => `<p class="clue" style="--i:${k}"><span class="clue-no" aria-hidden="true">증거 ${k + 1}</span>${esc(text)}</p>`).join("")}
    <p class="hint">일부 상황만 담긴 단서입니다. 보고와 비교해 보세요. 성공 여부를 확정하는 증거는 아닙니다.</p>
    </section>${powerPanel("after")}
    ${round.power === "visit" ? `<section class="visit-result" aria-label="현장 출동 결과">
      <h3>🔎 사장님이 직접 확인한 현장</h3>
      <p>${esc(round.result.action)}</p><p>${esc(round.result.audit)}</p>
      <p class="visit-score"><b>성과 ${round.result.score}점 · ${round.result.score >= SUCCESS_LINE ? "잘 수행함" : "수행 실패"}</b></p>
      ${stamp("현장 확인", "visit-stamp")}
      <p class="hint">확인한 사실을 바탕으로 칭찬·추궁을 선택하세요.</p></section>` : ""}`;
}

let seenQuarter = null;

// 새 분기가 시작될 때만 "1년차 2분기" 화면을 잠깐 띄웠다가 사라지게
function quarterPop(c, ev) {
  if (seenQuarter && seenQuarter.company === c && seenQuarter.round === game.round) return;
  seenQuarter = { company: c, round: game.round };
  const pop = document.getElementById("quarter-pop");
  if (!pop) return;
  pop.innerHTML = `<div class="qp-card ${ev.type === "기회" ? "chance" : "crisis"}">
      <small>${game.round + 1} / ${ROUNDS} 분기</small>
      <b>${esc(quarterLabel(game.round))}</b>
      <span class="qp-type">${ev.type === "기회" ? "✨ 기회" : "⚠️ 위기"}</span>
      <p>${esc(ev.title)}</p>
    </div>`;
  pop.hidden = false;
  replay(pop, "show");
  clearTimeout(quarterPop.timer);
  quarterPop.timer = setTimeout(() => { pop.hidden = true; }, reduceMotion() ? 900 : 1750);
}

function orderMeter(staff) {
  return `<div class="order-meter" id="order-meter" aria-hidden="true">
    <div class="om-cells">${Array.from({ length: Math.ceil(ORDER_MAX / 10) }, () => "<span class=\"om-cell\"><i></i></span>").join("")}</div>
    <div class="om-marks">${staff.map(x => `<span class="om-mark rk-${rankNo(x.rank)}" data-chars="${rankInfo(x.rank).chars}" style="left:${rankInfo(x.rank).chars / ORDER_MAX * 100}%" title="${esc(x.rank)} ${rankInfo(x.rank).chars}자">${esc(initial(x.rank))}</span>`).join("")}</div>
    <p class="om-note">1칸 = 10자 · 동그라미에서 그 직급이 지시를 자릅니다</p>
  </div>`;
}

function paintOrderMeter(len) {
  const meter = document.getElementById("order-meter");
  if (!meter) return;
  meter.querySelectorAll(".om-cell i").forEach((cell, k) => {
    cell.style.width = `${Math.max(0, Math.min(1, (len - k * 10) / 10)) * 100}%`;
  });
  meter.querySelectorAll(".om-mark").forEach(m => m.classList.toggle("cut", len > Number(m.dataset.chars)));
  meter.classList.toggle("full", len >= ORDER_MAX);
}

function renderEvent() {
  const c = game.company;
  const ev = c.events[game.round];
  const round = c.rounds[game.round];
  const activeStaff = staffOf(c);
  const total = totalProfit(c);
  document.getElementById("event-heading").textContent = `${quarterLabel(game.round)} · ${game.round + 1} / ${ROUNDS}`;
  document.getElementById("profit-now").innerHTML = `<div class="hud-money"><span class="hud-label">누적 수익</span>
      <b class="${total < 0 ? "neg" : total > 0 ? "pos" : ""}">${game.round ? money(total) : money(0, false)}</b></div>${profitChart(c)}`;
  const line = transmissionStaff(c);
  const chain = line.map(x => `<li class="rk-${rankNo(x.rank)}">${avatar(x)}
    <span class="chain-who"><span class="rank rk-${rankNo(x.rank)}">${esc(x.rank)}</span>${esc(x.name)} <small>${esc(x.mbti)}</small></span>
    ${hearts(x.loyalty)}<span class="chain-chars">${cells(rankInfo(x.rank).chars / 10)}<small>${rankInfo(x.rank).chars}자</small></span></li>`).join("");
  const quit = allCandidates(c).filter(x => x.quit).map(x => `<span class="quit-chip">📦 ${esc(x.rank)} ${esc(x.name)}</span>`);
  document.getElementById("event-box").innerHTML = `
    <div class="mission-grid">
    <div class="card mission">
      ${companyTitle(c)}
      ${quarterTrack(c)}
      <div class="event ${ev.type === "기회" ? "chance" : "crisis"}">
        <p class="tag">${ev.type === "기회" ? "✨ 기회" : "⚠️ 위기"}</p>
        <h3>${esc(ev.title)}</h3>
        <p>${esc(ev.text)}</p>
      </div>
      ${activeStaff.length ? powerPanel("before") : ""}
    </div>
    <div class="card orders">
      ${game.round === ROUNDS - 1 && activeStaff.length ? `<fieldset class="final-strategy">
        <legend>🏁 마지막 분기, 어떤 승부를 걸까요?</legend>
        <p class="hint">두 전략 모두 인건비·불이익·필살기 비용은 별도입니다. 지시를 내리기 전에 하나를 골라 주세요.</p>
        <div class="strategy-grid">${FINAL_STRATEGIES.map(s => {
          const [icon, label] = splitIcon(s.name);
          return `<label class="strategy-option ${s.id} ${round.strategy === s.id ? "picked" : ""}">
          <input type="radio" name="final-strategy" data-strategy="${s.id}" ${round.strategy === s.id ? "checked" : ""}>
          <span class="st-ico" aria-hidden="true">${esc(icon)}</span>
          <span class="st-text"><b>${esc(label)}</b><small>${esc(s.text)}</small></span></label>`;
        }).join("")}</div>
        <p class="hint">신사업 매출 범위 0~1억 4,000만원 · 안전 운영 매출 범위 4,000~6,000만원</p>
      </fieldset>` : ""}
      <label class="field order-field">📣 사장님 지시
        <span class="counter" data-for="order">${round.order.length} / ${ORDER_MAX}</span>
        <textarea id="order" maxlength="${ORDER_MAX}" rows="4" ${!activeStaff.length ? "disabled" : ""} placeholder="예: 오늘 안에 해결해. 고객에게는 솔직하게 사과하고, 원인은 내일 아침까지 보고해.">${esc(round.order)}</textarea>
      </label>
      ${activeStaff.length ? orderMeter(line) : ""}
      <p class="field-label">이 지시를 듣는 순서 <span class="hint">♥ 충성심 · 칸 = 전달 글자 수</span></p>
      <ol class="chain">
        <li class="ceo">${avatar(null)}<span class="chain-who"><span class="rank rk-0">사장</span>${esc(c.player)} <small>나</small></span><span class="chain-chars">${cells(ORDER_MAX / 10)}<small>${ORDER_MAX}자</small></span></li>
        ${chain}
      </ol>
      ${quit.length ? `<p class="hint quit-list">퇴사: ${quit.join(" ")}</p>` : ""}
      ${!activeStaff.length ? `<p class="choice-result bad">직원이 모두 퇴사해 영업을 중단합니다. 남은 분기마다 매출·인건비는 0원이며, 임대료와 위약금으로 ${money(CLOSED_PENALTY, false)}의 손실이 발생합니다.</p>` : `<p class="hint">이번 분기 인건비 ${money(payroll(c) * COST_PER_SALARY, false)} · 성과 ${SUCCESS_LINE}점 이상이면 잘 수행한 것으로 판정합니다.</p>`}
    </div>
    </div>`;
  const order = document.getElementById("order");
  if (order) order.addEventListener("input", () => paintOrderMeter(order.value.length));
  // 고른 전략 카드 표시 (선택 저장은 main.js가 합니다)
  const picks = document.querySelectorAll("#event-box [data-strategy]");
  picks.forEach(input => input.addEventListener("change", () => {
    picks.forEach(x => x.closest(".strategy-option").classList.toggle("picked", x.checked));
  }));
  paintOrderMeter(round.order.length);
  quarterPop(c, ev);
}

// ===== 라운드 결과 =====

function roomHead(title, count) {
  return `<div class="room-head"><p class="room">${esc(title)}</p>
    <span class="room-count" aria-label="대화 상대 ${count}명">👥 ${count}</span>
    <button type="button" class="skip-btn">⏩ 탭하면 바로 보기</button></div>`;
}

async function renderReports() {
  const c = game.company;
  const r = c.rounds[game.round].result;
  resetSkip();
  document.getElementById("result-title").textContent = "사장님께 보고가 올라왔습니다";
  document.getElementById("result-lead").textContent = "직원들이 일을 마치고 보고했습니다. 정말 이렇게 잘 됐을까요?";
  const up = [...c.rounds[game.round].chain].reverse().map(id => candidateById(c, id));
  document.getElementById("result-box").innerHTML = `
    <div class="card chat-card">
      <div class="messenger playing" id="room">${roomHead("📈 보고 라인", up.length + 1)}</div>
    </div><div id="decision-tools"></div>`;
  const room = document.getElementById("room");
  room.onclick = skipReveal;
  for (let k = 0; k < up.length; k++) {
    const isFinal = k === up.length - 1;
    await addBubble(room, `${up[k].rank} ${up[k].name}${isFinal ? " → 사장님께" : ""}`, r.up[k].say, isFinal ? "final" : "", up[k]);
  }
  room.classList.remove("playing");
  renderDecisionTools();
}

// 파고들기/칭찬하기를 누른 직후 1초 남짓 두구두구 (탭하면 바로 넘어감)
async function suspense(choice) {
  const box = document.getElementById("suspense");
  if (!box || skipping) return;
  const dig = choice === "dig";
  box.innerHTML = `<div class="suspense-card ${dig ? "dig" : "praise"}">
      <span class="suspense-ico" aria-hidden="true">${dig ? "🔍" : "👏"}</span>
      <p class="suspense-title">${dig ? "꼬치꼬치 캐묻는 중…" : "믿고 칭찬하는 중…"}</p>
      <p class="drum" aria-hidden="true">두구두구두구</p>
      <small>탭하면 바로 공개</small>
    </div>`;
  box.hidden = false;
  box.onclick = skipReveal;
  document.getElementById("result-box").classList.add("dim");
  await beat(reduceMotion() ? 500 : SUSPENSE_DELAY);
  box.hidden = true;
  document.getElementById("result-box").classList.remove("dim");
}

async function renderTruth() {
  const c = game.company;
  const round = c.rounds[game.round];
  const r = round.result;
  const closed = round.choice === "closed";
  resetSkip();
  document.getElementById("decision-tools")?.remove();
  const staff = round.chain.map(id => candidateById(c, id)); // 이번 분기에 있던 직원 (퇴사자 포함)
  document.getElementById("result-title").textContent = closed ? "🚪 직원 부재로 영업을 중단했습니다" : round.choice === "dig" ? "🔍 파고들어 보니…" : "👏 칭찬했습니다. 그런데 진실은…";
  document.getElementById("result-lead").textContent = closed ? "직원이 없어 이번 이벤트를 수행하지 못했습니다. 4분기까지 결산은 이어집니다." : "🤥 표시는 일부러 말을 바꾸거나 거짓말한 직원입니다.";
  if (!closed) await suspense(round.choice);

  const room = document.getElementById("room");
  room.innerHTML = roomHead("📉 실제 지시 라인", staff.length + 1);
  room.classList.add("truth", "playing");
  room.classList.remove("skipped");
  room.onclick = skipReveal;
  if (!closed) {
    document.getElementById("result-title").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    await addBubble(room, `사장 ${c.player} (나)`, round.order, "ceo");
  } else room.hidden = true;
  for (let k = 0; k < staff.length; k++) {
    await addBubble(room, `${staff[k].rank} ${staff[k].name}`, r.down[k].say, r.down[k].lie ? "lie" : "", staff[k]);
  }
  room.classList.remove("playing");

  const upLies = [...staff].reverse().map((x, k) => r.up[k].lie ? x : null).filter(Boolean);
  const finalLie = !closed && r.up.length && r.up[r.up.length - 1].lie;
  const box = document.createElement("div");
  box.className = "action";
  box.innerHTML = `
    <p class="tag">실제로 한 일</p><p>${esc(r.action)}</p>
    ${!closed ? `<p class="tag">사장님이 받은 보고</p><p class="got-report">"${esc(r.up[r.up.length - 1].say)}"${finalLie ? stamp("반전", "twist-stamp") : ""}</p>` : ""}
    ${upLies.length ? `<p class="tag">보고를 부풀린 직원</p><p>🤥 ${upLies.map(x => esc(x.name)).join(", ")}</p>` : ""}
    ${round.choice === "dig" ? `<p class="tag">🔍 파고들어 알아낸 것</p><p>${esc(r.audit)}</p>` : ""}
    ${!closed ? allHonestNote(r) : ""}`;
  room.after(box);
  await beat(closed ? 0 : 300);

  const verdict = document.createElement("article");
  verdict.className = `news verdict ${round.success ? "good" : "bad"}`;
  verdict.innerHTML = `
    <p class="paper">경희경제신문 · ${quarterLabel(game.round)} <span>${closed ? "영업 중단 결산" : r.practice ? "연습 모드" : `ChatKHU 판정${r.model ? " · " + esc(r.model) : ""}`}</span></p>
    <h3>${esc(r.news)}</h3>
    <div class="verdict-row">
      ${stamp(closed ? "휴업" : round.success ? "승인" : "반려", `verdict-stamp ${round.success ? "ok" : "no"}`)}
      <p class="outcome ${round.success ? "good" : "bad"}">${round.success ? "✅ 잘 수행함" : "❌ 수행 실패"} <small>성과 <b class="score-count">0</b>점 · ${esc(r.reason)}</small></p>
    </div>
    <p class="choice-result ${round.penalty ? "bad" : round.choice === "dig" && round.success ? "warn" : "good"}">
      ${closed ? "🚪 영업 중단" : round.choice === "dig" ? "🔍 파고들기" : "👏 칭찬하기"} → ${esc(round.loyaltyNote)}</p>
    ${round.quits.length ? `<div class="quit-scene" role="img" aria-label="${esc(round.quits.join(", "))} 퇴사">
        <span class="door" aria-hidden="true">🚪</span>
        ${round.quits.map((q, k) => `<span class="walker" style="--i:${k}" aria-hidden="true"><span class="box">📦</span><span class="person">🚶</span></span>`).join("")}
        <span class="quit-name">📦 ${round.quits.length}명이 짐을 쌌습니다</span>
        ${stamp("퇴사", "quit-stamp")}
      </div>` : ""}
    ${round.quits.length ? `<p class="choice-result bad">🚪 충성심이 바닥난 ${round.quits.map(esc).join(", ")}이(가) 퇴사했습니다</p>` : ""}
    ${round.power ? `<p class="hint">이번 분기 필살기: ${esc(CEO_POWERS.find(p => p.id === round.power).name)}</p>` : ""}
    <table class="ledger">
      <tr><td>기본 매출 (성과 ${r.score}점)</td><td>${money(round.baseRevenue)}</td></tr>
      ${round.strategy && !closed ? `<tr><td>${esc(FINAL_STRATEGIES.find(s => s.id === round.strategy).name)} 매출 조정</td><td>${money(round.strategyDelta)}</td></tr>` : ""}
      <tr><td>인건비</td><td>${money(-round.cost)}</td></tr>
      ${round.powerCost ? `<tr><td>회식 비용</td><td>${money(-round.powerCost)}</td></tr>` : ""}
      ${round.penalty ? `<tr class="bad"><td>${closed ? "영업 중단 손실 (임대료·위약금)" : "칭찬 실패 불이익"}</td><td>${money(-round.penalty)}</td></tr>` : ""}
      <tr class="sum"><td>이번 분기 수익</td><td class="${round.profit < 0 ? "neg" : "pos"}"><span class="profit-count">${money(0)}</span></td></tr>
      <tr><td>누적 수익</td><td class="${totalProfit(c) < 0 ? "neg" : "pos"}">${money(totalProfit(c))}</td></tr>
    </table>
    <div class="verdict-chart"><span class="hud-label">누적 수익 추이</span>${profitChart(c)}</div>
    ${r.over ? `<p class="note">AI가 글자 수를 ${r.over}번 넘겨서 잘랐어요</p>` : ""}`;
  document.getElementById("result-box").appendChild(verdict);
  if (!skipping && !reduceMotion()) verdict.scrollIntoView({ behavior: "smooth", block: "center" });

  await countUp(verdict.querySelector(".score-count"), r.score, 600, v => String(Math.round(v)));
  const profitEl = verdict.querySelector(".profit-count");
  await countUp(profitEl, round.profit, 900);
  if (round.profit < 0) replay(profitEl, "drop");
  if (round.profit <= BIG_LOSS) shakeScreen();
}

function allHonestNote(r) {
  return r.down.some(x => x.lie) || r.up.some(x => x.lie) ? "" : `<p class="tag honest-note">이번엔 아무도 거짓말하지 않았습니다 😇</p>`;
}

// ===== 최종 결산 =====

function confetti() {
  return `<div class="confetti" aria-hidden="true">${Array.from({ length: 26 }, (_, k) =>
    `<i style="--x:${(k * 37) % 100}%;--d:${(k % 9) * 0.09}s;--r:${(k * 53) % 360}deg;--c:var(--rank-${(k % 6) + 1})"></i>`).join("")}</div>`;
}

function renderFinal(placed) {
  const c = game.company;
  const twist = fundingTwist(c);
  const everyone = HIRE_RANKS.map(r => c.hires[r] ? candidateById(c, c.hires[r]) : null).filter(Boolean);

  // 거짓말왕: 4분기 동안 거짓말한 횟수 (그 분기에 있던 직원 기준)
  const lies = new Map(everyone.map(x => [x.id, 0]));
  c.rounds.forEach(round => {
    const chain = round.chain || [];
    chain.forEach((id, k) => { if (round.result.down[k] && round.result.down[k].lie) lies.set(id, lies.get(id) + 1); });
    [...chain].reverse().forEach((id, k) => { if (round.result.up[k] && round.result.up[k].lie) lies.set(id, lies.get(id) + 1); });
  });
  const topLiar = everyone.reduce((best, x) => (lies.get(x.id) > (best ? lies.get(best.id) : 0) ? x : best), null);
  const honest = everyone.filter(x => lies.get(x.id) === 0 && !x.quit);
  const profit = totalProfit(c);
  const ending = endingFor(c);

  const banner = placed
    ? `<div class="placed-wrap ${placed.rank <= 3 ? "podium" : ""}">
        <p class="placed-drum" aria-hidden="true">🥁 두구두구… 순위 발표!</p>
        <p class="placed">${medal(placed.rank)} 같은 업종 <b>${placed.rank}위</b> <span>/ ${placed.total}명</span></p>
        ${placed.rank <= 3 ? confetti() : ""}
      </div>`
    : `<p class="placed practice">연습 모드가 섞여서 순위에 기록되지 않았어요</p>`;

  const rows = c.rounds.map((round, i) => `
    <li style="--i:${i}"><span class="etype ${c.events[i].type === "기회" ? "chance" : "crisis"}">${quarterLabel(i)}</span>
      <span class="ename">${esc(c.events[i].title)} ${round.choice === "closed" ? "🚪" : round.choice === "dig" ? "🔍" : "👏"}${round.success ? "✅" : "❌"}<small>${esc(round.result.news)}</small></span>
      <b class="${round.profit < 0 ? "neg" : "pos"}">${money(round.profit)}</b></li>`).join("");

  document.getElementById("final").innerHTML = `
    <h2 class="center final-title">1년 결산</h2>
    ${banner}
    <div class="solo front">
      <article class="news win front-page">
        <div class="masthead"><span>1년 결산 특별호</span><b>경희경제신문</b><span>${esc(today())}</span></div>
        <p class="paper">사장님 특별호 · ${esc(c.industry)} <span>${isPractice(c) ? "연습 모드" : "ChatKHU 판정"}</span></p>
        <h3 class="front-headline">${esc(ending.headline)}</h3>
        <div class="ending-line">
          <p class="tag">올해의 사장 유형</p>
          ${stamp(ending.title, "ending-stamp")}
        </div>
        <p class="ending-text">${esc(ending.text)}</p>
        <div class="front-grid">
          <div class="front-money">
            <p class="tag">1년 누적 수익</p>
            <p class="score big ${profit < 0 ? "neg" : "pos"}"><span class="total-count">${money(0)}</span></p>
            ${profitChart(c, true)}
          </div>
          <div class="front-company">
            ${companyTitle(c)}
            <p class="hint">칭찬 ${c.rounds.filter(r => r.choice === "praise").length}회 · 추궁 ${c.rounds.filter(r => r.choice === "dig").length}회 · 재직 직원 ${staffOf(c).length}명</p>
          </div>
        </div>
        <p class="section-title">분기별 기사</p>
        <ol class="rounds">${rows}</ol>
        ${twist ? `<p class="twist ${twist.kind}">${stamp("반전", "twist-stamp")} ${esc(twist.text)}</p>` : ""}
        <div class="share-row">
          <button class="secondary" data-action="copy-ending">📋 내 결산 복사하기</button>
          <details class="ending-share"><summary>공유할 결산 문구 보기</summary>
            <textarea id="ending-share" rows="5" readonly aria-label="공유할 결산 문구">${esc(endingShareText(c))}</textarea></details>
        </div>
      </article>
      <div class="card awards">
        ${topLiar ? `<div class="wanted">
          <p class="wanted-head">WANTED · 1년간의 거짓말왕</p>
          ${avatar(topLiar, "big")}
          <p class="wanted-name">🤥 <b>${esc(topLiar.rank)} ${esc(topLiar.name)}</b> <small>(${lies.get(topLiar.id)}번, 정직도 ${topLiar.honesty})</small></p>
        </div>` : ""}
        ${honest.length ? `<p class="honest-award">😇 <b>끝까지 정직했던 직원</b> ${honest.map(x => `${esc(x.name)} <small>(정직도 ${x.honesty})</small>`).join(", ")}</p>` : ""}
        <p class="field-label">직원들의 진짜 정직도와 마지막 충성심</p>
        <ul class="reveal-list">${everyone.map(x => `<li class="${x.quit ? "left" : ""}">${avatar(x)}<span class="rank rk-${rankNo(x.rank)}">${esc(x.rank)}</span><span class="rv-name">${esc(x.name)}${x.quit ? " 🚪" : ""}</span>
          ${statBar("정직", x.honesty, "honest")} ${hearts(x.loyalty)}</li>`).join("")}</ul>
      </div>
    </div>`;
  const total = document.querySelector("#final .total-count");
  setTimeout(() => countUp(total, profit, 1400), reduceMotion() ? 0 : 900);
}

// ===== 순위표 =====

function renderBoard(highlightAt) {
  const list = sortedBoard();
  const season = getSeason();
  document.getElementById("board-lead").textContent = list.length
    ? `같은 업종의 사장님 ${list.length}명이 겨뤘습니다. 1년 누적 수익 순위예요. (이 노트북에 저장 · 다른 기기와 자동 합산되지 않음)`
    : "아직 기록이 없어요. 첫 번째 사장님이 되어 보세요!";
  document.getElementById("season-box").innerHTML = season ? `
    <div class="card season">
      <p><b>이번 대결 업종</b> ${esc(season.emoji)} ${esc(season.industry)}</p>
      <p class="hint">다른 기기에서도 같은 업종으로 겨루려면 이 링크로 접속하세요.</p>
      <div class="row">
        <input id="season-link" readonly value="${esc(seasonLink())}">
        <button id="btn-copy-link" class="secondary small">링크 복사</button>
      </div>
    </div>` : "";
  document.getElementById("board").innerHTML = list.length ? `
    <ol class="board">
      ${list.map((e, k) => `
        <li class="${k < 3 ? `top place-${k + 1}` : ""} ${e.at === highlightAt ? "me" : ""}" style="--i:${Math.min(k, 12)}">
          <span class="pos">${medal(k + 1) || k + 1}</span>
          <span class="who">
            <b>${esc(e.player)}${e.at === highlightAt ? ' <span class="me-tag">방금 나</span>' : ""}</b>
            <small>${esc(e.emoji)} ${esc(e.name)} · ${esc(e.industry)}</small>
            <small class="headline">${esc(e.news)}</small>
          </span>
          <span class="pts ${e.profit < 0 ? "neg" : ""}">${money(e.profit)}</span>
        </li>`).join("")}
    </ol>` : `<div class="board-empty" aria-hidden="true">🏆</div>`;
}

function medal(rank) {
  return ["🥇", "🥈", "🥉"][rank - 1] || "";
}

// ===== 설정 =====

function renderSettings() {
  document.getElementById("model-select").innerHTML = CHATKHU_MODELS.map(m =>
    `<option value="${esc(m.id)}" ${m.id === getModel() ? "selected" : ""}>${esc(m.name)}</option>`).join("");
  document.getElementById("key-input").value = "";
  document.getElementById("key-state").textContent = getApiKey()
    ? "✅ 내 키가 저장되어 있어요. 지금은 팀 서버 대신 내 키로 ChatKHU를 불러요."
    : TEAM_SERVER_URL ? "✅ 팀 서버로 연결돼 있어요. 키를 넣지 않아도 됩니다." : "아직 연결이 없어요. 키를 넣어 주세요.";
  document.getElementById("btn-key-clear").hidden = !getApiKey();
}

// ===== 공통 =====

// 단톡방 말풍선. person은 직급 색 프로필용 ({rank, name}), 사장(ceo)은 없음
async function addBubble(room, who, text, kind, person) {
  const fast = skipping || reduceMotion();
  if (!fast && kind !== "ceo") {
    const typing = document.createElement("div");
    typing.className = "msg typing";
    typing.innerHTML = `${avatar(person)}<div class="msg-body"><div class="who">${esc(who)} <span class="typing-label">입력 중…</span></div>
      <div class="bubble"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></div></div>`;
    room.appendChild(typing);
    await beat(TYPING_DELAY);
    typing.remove();
  }
  const div = document.createElement("div");
  div.className = `msg ${kind || ""}`;
  div.innerHTML = `${kind === "ceo" ? "" : avatar(person)}<div class="msg-body">
      <div class="who">${esc(who)}${kind === "lie" ? " 🤥" : ""}</div>
      <div class="bubble">${esc(text)}${kind === "lie" ? stamp("🤥 거짓말", "lie-stamp") : ""}</div></div>`;
  room.appendChild(div);
  if (fast) return;
  div.scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (kind === "lie") replay(room, "thud", 500);
  await beat(kind === "lie" ? BUBBLE_DELAY + 380 : BUBBLE_DELAY);
}

let toastTimer;
function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
