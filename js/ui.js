// 담당 A: 화면 그리기
// 계산은 game.js, AI는 ai.js에 맡기고 여기서는 보여주기만 합니다.
// 사용자가 쓴 글이나 AI가 쓴 글은 반드시 esc()를 거쳐서 넣기! (textContent로 넣는 곳은 그대로 안전)
// 연출(사무실 무대, 단톡방, 도장, 숫자 올라가기, 흔들림, 효과음)도 모두 여기 있습니다.
// 게임 상태와 공개 순서는 바꾸지 않습니다. 사무실 직원들의 움직임과 잡담은 "보이는 성격"(능력·운·MBTI·애착·충성심)만 쓰고,
// 숨은 정직도는 결산 전까지 절대 쓰지 않습니다.

const BUBBLE_DELAY = 420;    // 말풍선이 뜬 뒤 다음 사람까지 쉬는 시간 (ms)
const TYPING_DELAY = 380;    // 말풍선 전에 "입력 중…"을 보여 주는 시간 (ms)
const SUSPENSE_DELAY = 1100; // 파고들기/칭찬하기 직후 두구두구 (ms)
const BIG_LOSS = -3000;      // 분기 수익이 이 이하면 화면이 흔들림 (만원)
const BIG_WIN = 3000;        // 분기 수익이 이 이상이면 색종이 (만원)
const FUND_ICONS = { parents: "👪", angel: "😇", vc: "🦈" };
const FLOOR_RANKS = ["사장", ...HIRE_RANKS]; // 사무실 층: 0 = 사장실, 1 = 임원 … 6 = 사원

const OFFICE_SCREENS = ["screen-interview", "screen-event", "screen-result", "screen-final"];
const TALK_SCREENS = ["screen-event", "screen-result"];

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
  document.body.classList.toggle("at-title", id === "screen-found" && screen.classList.contains("intro"));
  stageFor(id);
  renderHud();
  window.scrollTo(0, 0);
}

// 화면마다 사무실·단톡방을 보여 줄지 정하고, 잡담을 켜고 끕니다
function stageFor(id) {
  const eventWait = id === "screen-ai" && aiKind === "event";
  const withOffice = OFFICE_SCREENS.includes(id) || eventWait;
  const withTalk = TALK_SCREENS.includes(id) || eventWait;
  document.body.classList.toggle("with-office", withOffice);
  document.body.classList.toggle("with-talk", withTalk);
  if (withTalk) talkEnsure();
  if (withOffice) {
    officeSync(false);
    if (id !== "screen-final") officeEpilogue(null);
  }
  if (id === "screen-event") ambientStart("event");
  else if (eventWait) ambientStart("wait");
  else ambientStop();
  if (!withTalk) talkOpen(false);
}

function renderSettingsButton() {
  const btn = document.getElementById("btn-settings");
  const model = CHATKHU_MODELS.find(m => m.id === getModel());
  const shown = model ? model.name.replace(/ \(.*\)/, "") : getModel();
  const full = hasAI() ? `ChatKHU · ${shown} · ${aiSourceLabel()}` : "ChatKHU 연결";
  btn.innerHTML = hasAI()
    ? `<span aria-hidden="true">🔌</span><span class="pill-text"> ChatKHU</span><small class="pill-more"> · ${esc(shown)} · ${esc(aiSourceLabel())}</small>`
    : `<span aria-hidden="true">⚠️</span><span class="pill-text"> ChatKHU 연결</span>`;
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

// ===== HUD: 목표·진행(왼쪽) / 자원(오른쪽) =====

const hudSeen = { money: null, company: null };

function renderHud() {
  const c = game.company;
  const id = document.body.dataset.screen || "";
  const inQuarter = (id === "screen-event" || id === "screen-result" || (id === "screen-ai" && aiKind === "event")) && c.events.length > 0;
  document.body.classList.toggle("in-quarter", inQuarter);
  const goal = document.getElementById("hud-goal");
  const res = document.getElementById("hud-res");
  if (!goal || !res) return;
  goal.innerHTML = inQuarter ? `<span class="goal-q"><b>${esc(quarterLabel(game.round))}</b><small>${game.round + 1} / ${ROUNDS}</small></span>
    <ol class="pips" aria-label="1년 경영 진행도">${Array.from({ length: ROUNDS }, (_, i) => {
      const type = (c.events[i] && c.events[i].type) || EVENT_ORDER[i];
      const r = c.rounds[i];
      const done = r && typeof r.profit === "number";
      const state = done ? (r.profit < 0 ? "done neg" : "done pos") : i === game.round ? "current" : "";
      return `<li class="${state} ${type === "기회" ? "chance" : "crisis"}" title="${esc(quarterLabel(i))} · ${esc(type)}">${done ? (r.profit < 0 ? "▼" : "▲") : type === "기회" ? "✨" : "⚠"}</li>`;
    }).join("")}</ol>` : "";

  const staff = staffOf(c);
  const hired = HIRE_RANKS.filter(r => c.hires[r]).length;
  let items = [];
  if (id === "screen-interview") {
    items = [
      { ico: "👥", label: "채용", value: `${hired} / ${HIRE_RANKS.length}` },
      { ico: "💰", label: "인건비", value: `${payroll(c)} / ${budgetOf(c)}`, tone: payroll(c) / budgetOf(c) >= .9 ? "neg" : "" }
    ];
  } else if (inQuarter || id === "screen-final") {
    const total = totalProfit(c);
    const avg = staff.length ? Math.round(staff.reduce((s, x) => s + x.loyalty, 0) / staff.length) : 0;
    items = [
      { ico: "💰", label: "누적 수익", value: money(total, total !== 0), tone: total < 0 ? "neg" : total > 0 ? "pos" : "", money: total, key: "money" },
      { ico: "👥", label: "직원", value: `${staff.length}명` },
      { ico: "♥", label: "충성심", value: staff.length ? `${avg}/10` : "—", tone: avg && avg <= 3 ? "neg" : "" }
    ];
  }
  res.innerHTML = items.map(it => `<span class="res ${it.key || ""}"><i aria-hidden="true">${it.ico}</i><span class="res-text"><small>${esc(it.label)}</small><b class="${it.tone || ""}">${esc(it.value)}</b></span></span>`).join("");
  const moneyItem = items.find(it => it.key === "money");
  if (moneyItem) {
    const el = res.querySelector(".res.money b");
    const before = hudSeen.company === c ? hudSeen.money : null;
    hudSeen.company = c;
    hudSeen.money = moneyItem.money;
    if (before !== null && before !== moneyItem.money && el && !reduceMotion()) {
      const from = before, to = moneyItem.money;
      let k = 0;
      const tick = () => {
        k++;
        const t = Math.min(1, k / 18);
        el.textContent = money(Math.round((from + (to - from) * (1 - Math.pow(1 - t, 3))) / 10) * 10);
        if (t < 1) setTimeout(tick, 40); else { el.textContent = money(to); replay(el.closest(".res"), "bump", 600); }
      };
      tick();
    }
  }
}

// ===== 연출 도구 =====

function reduceMotion() {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

// 탭하면 바로 끝나는 기다림. skipReveal()이 불리면 남은 기다림이 모두 즉시 풀립니다.
let skipping = false;
let skipWaiters = [];
let revealing = false;

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
  if (!revealing) return;
  skipping = true;
  skipWaiters.slice().forEach(f => f());
  document.querySelectorAll(".messenger.playing").forEach(r => r.classList.add("skipped"));
  const off = document.getElementById("office");
  if (off) off.classList.add("skipped");
}

function resetSkip() {
  skipping = false;
  skipWaiters = [];
  const off = document.getElementById("office");
  if (off) off.classList.remove("skipped");
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
      if (k % 3 === 0) sfx("tick");
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

function clockNow() {
  try {
    return new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pickOne(list) {
  return list[Math.floor(Math.random() * list.length)];
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

// 1년 4분기 레벨 카드
function quarterTrack(c) {
  return `<ol class="quarter-track" aria-label="1년 경영 진행도">${Array.from({ length: ROUNDS }, (_, i) => {
    const type = (c.events[i] && c.events[i].type) || EVENT_ORDER[i];
    const r = c.rounds[i];
    const state = i < game.round ? "done" : i === game.round ? "current" : "";
    const result = state === "done" && r && typeof r.profit === "number"
      ? `<em class="${r.profit < 0 ? "neg" : "pos"}">${money(r.profit)}</em>` : "";
    return `<li class="${state} ${type === "기회" ? "chance" : "crisis"}" title="${esc(quarterLabel(i))}" ${state === "current" ? 'aria-current="step"' : ""}>
      <span class="q-node" aria-hidden="true">${state === "done" ? "✓" : type === "기회" ? "✨" : "⚠"}</span>
      <b>${esc(quarterLabel(i).split(" ").pop())}</b><small>${esc(type)}</small>${result}</li>`;
  }).join("")}</ol>`;
}

// ===== 효과음 (WebAudio로 합성, 파일 없음. 첫 탭 이후에만 소리가 납니다) =====

const sound = { on: true, ctx: null };
try { sound.on = localStorage.getItem("kcb_sound") !== "off"; } catch {}

function audio() {
  if (!sound.on) return null;
  if (!sound.ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      sound.ctx = new AC();
    } catch { return null; }
  }
  if (sound.ctx.state === "suspended") sound.ctx.resume().catch(() => {});
  return sound.ctx;
}

function tone(ctx, freq, dur, type, vol, at, slide) {
  const t = ctx.currentTime + (at || 0);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || "sine";
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(ctx, dur, vol, at, freq, type) {
  const t = ctx.currentTime + (at || 0);
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type || "lowpass";
  f.frequency.value = freq || 800;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
}

let lastTick = 0;
function sfx(name, ms) {
  if (!sound.on || !sound.ctx) return; // 첫 탭 전에는 조용히
  const ctx = audio();
  if (!ctx) return;
  try {
    switch (name) {
      case "tap": tone(ctx, 620, 0.07, "sine", 0.07); break;
      case "tapBig": tone(ctx, 520, 0.08, "triangle", 0.09); tone(ctx, 780, 0.1, "triangle", 0.08, 0.06); break;
      case "pop": tone(ctx, 760, 0.06, "sine", 0.05, 0, 1180); break;
      case "tick": {
        const now = performance.now();
        if (now - lastTick < 70) return;
        lastTick = now;
        tone(ctx, 1500, 0.03, "square", 0.018);
        break;
      }
      case "stamp": noise(ctx, 0.14, 0.45, 0, 380); tone(ctx, 95, 0.18, "sine", 0.28, 0, 55); break;
      case "lie": tone(ctx, 260, 0.12, "triangle", 0.12, 0, 520); tone(ctx, 520, 0.18, "triangle", 0.1, 0.11, 230); noise(ctx, 0.1, 0.25, 0.05, 420); break;
      case "whoosh": noise(ctx, 0.32, 0.18, 0, 1400, "bandpass"); break;
      case "coin": tone(ctx, 1320, 0.06, "square", 0.04); tone(ctx, 1760, 0.12, "square", 0.04, 0.06); break;
      case "drum": {
        const n = Math.max(4, Math.floor((ms || 1000) / 75));
        for (let i = 0; i < n; i++) noise(ctx, 0.05, 0.16 + i / n * 0.2, i * 0.075, 260);
        noise(ctx, 0.2, 0.4, n * 0.075, 300);
        break;
      }
      case "fanfare": [523, 659, 784, 1047].forEach((f, i) => tone(ctx, f, 0.22, "triangle", 0.08, i * 0.11)); break;
      case "fail": tone(ctx, 330, 0.5, "sawtooth", 0.04, 0, 140); break;
      case "walk": tone(ctx, 180, 0.04, "sine", 0.03); break;
      case "hire": tone(ctx, 660, 0.1, "triangle", 0.08); tone(ctx, 990, 0.16, "triangle", 0.08, 0.09); noise(ctx, 0.12, 0.3, 0.2, 380); break;
    }
  } catch {}
}

function renderSoundButton() {
  const btn = document.getElementById("btn-sound");
  if (!btn) return;
  btn.setAttribute("aria-pressed", String(sound.on));
  btn.setAttribute("aria-label", sound.on ? "효과음 끄기" : "효과음 켜기");
  btn.innerHTML = `<span aria-hidden="true">${sound.on ? "🔊" : "🔇"}</span>`;
}

// ===== 캐릭터 그림 (인라인 SVG) =====
// 옷 색 = 직급 색. 머리 모양·안경·헤드폰·넥타이·표정은 MBTI와 애착 유형(면접에서 보이는 정보)으로만 바뀝니다.

const HAIR = {
  tuft: "M7.2 17.5C6.5 9 12 4.6 20 4.6s13.4 4.2 13 12.2c-3-3.6-7.6-5.6-12.6-5.4-5.4.2-9.6 2.4-13.2 6.1zM16.6 6l2.8-4.8 2.8 4.8z",
  part: "M7 18.5C6 9.4 12 4.5 20.4 4.5 28.4 4.5 34 9.6 33 17.5c-1.6-2.8-4-5-7-6.4-4.4 3-10.6 4.6-19 7.4z",
  flat: "M7.4 15.6C8.4 8.4 13.4 4.8 20 4.8s11.8 3.6 12.6 10.8C24.4 12.4 15.6 12.4 7.4 15.6z",
  bob: "M6 23C4.6 11 11 4.5 20 4.5S35.4 11 34 23h-2.6c.2-6-2.6-10.8-9-12.2-5 1.4-10.6 2-13.4 7.8l-.2 4.4z"
};

function chibiSvg(person) {
  const ceo = !person;
  const mbti = ceo ? "ENTJ" : String(person.mbti || "ISTJ");
  const E = mbti[0] === "E", N = mbti[1] === "N", T = mbti[2] === "T", J = mbti[3] === "J";
  const secure = ceo ? true : person.secure >= 50;
  const hair = ceo ? HAIR.part : E ? (T ? HAIR.tuft : HAIR.part) : (T ? HAIR.flat : HAIR.bob);
  return `<svg class="chibi" viewBox="0 0 40 58" aria-hidden="true" focusable="false">
    <ellipse class="c-shadow" cx="20" cy="55.6" rx="11" ry="2.4"/>
    <g class="c-legs"><rect class="c-leg l" x="13.2" y="43" width="5.4" height="11" rx="2.7"/><rect class="c-leg r" x="21.4" y="43" width="5.4" height="11" rx="2.7"/></g>
    <rect class="c-arm l" x="7.4" y="31.5" width="6" height="12.5" rx="3"/>
    <path class="c-torso" d="M12 30.5h16a5 5 0 0 1 5 5v8.5a3.5 3.5 0 0 1-3.5 3.5h-19A3.5 3.5 0 0 1 7 44v-8.5a5 5 0 0 1 5-5z"/>
    <path class="c-collar" d="M15.5 30.5 20 36l4.5-5.5z"/>
    ${J || ceo ? `<path class="c-tie" d="M18.8 33.6h2.4l1 6.4-2.2 2.4-2.2-2.4z"/>` : ""}
    <rect class="c-arm r" x="26.6" y="31.5" width="6" height="12.5" rx="3"/>
    <g class="c-head">
      <circle class="c-face" cx="20" cy="18" r="13"/>
      <path class="c-hair" d="${hair}"/>
      <g class="c-eyes"><ellipse cx="22.6" cy="19" rx="1.5" ry="2.1"/><ellipse cx="29" cy="19" rx="1.5" ry="2.1"/></g>
      <circle class="c-cheek" cx="20.4" cy="23.6" r="2"/><circle class="c-cheek" cx="31.2" cy="23.2" r="1.5"/>
      <path class="c-mouth" d="${secure ? "M24.6 25.2q1.9 2.1 3.8 0" : "M24.8 26h3.4"}"/>
      <rect class="c-nose" x="31.3" y="20.2" width="3.4" height="2.8" rx="1.4"/>
      ${N ? `<g class="c-glasses"><circle cx="22.6" cy="19" r="3.3"/><circle cx="29" cy="19" r="3.3"/></g>` : ""}
      ${!E && !N ? `<path class="c-phones" d="M7.6 17.5a12.4 12.4 0 0 1 24.8 0"/><rect class="c-cup" x="5.2" y="15.6" width="4.6" height="7.4" rx="2.2"/>` : ""}
      ${ceo ? `<path class="c-crown" d="M12.6 7.2l1.8-6 4 3.6 1.6-4.4 1.6 4.4 4-3.6 1.8 6z"/>` : ""}
    </g>
  </svg>`;
}

const DESK_SVG = `<svg class="desk-svg" viewBox="0 0 64 46" aria-hidden="true" focusable="false">
  <rect class="d-mon" x="22" y="3" width="26" height="18" rx="3"/><rect class="d-screen" x="25" y="6" width="20" height="12" rx="1.5"/>
  <path class="d-stand" d="M33 21h4v5h-4z"/><rect class="d-mug" x="51" y="19" width="6" height="7" rx="1.6"/>
  <rect class="d-top" x="2" y="26" width="60" height="6" rx="2.4"/><path class="d-legs" d="M7 32h4v14H7zM53 32h4v14h-4z"/></svg>`;

const PROP_SVG = {
  shelf: `<svg viewBox="0 0 34 48" focusable="false"><rect class="p-body" x="2" y="2" width="30" height="44" rx="3"/><path class="p-line" d="M2 17h30M2 31h30"/><path class="p-book" d="M6 6h4v11H6zM11 8h4v9h-4zM18 20h4v11h-4zM23 22h4v9h-4zM7 34h4v12H7z"/></svg>`,
  coffee: `<svg viewBox="0 0 30 50" focusable="false"><rect class="p-body" x="3" y="3" width="24" height="44" rx="4"/><rect class="p-panel" x="7" y="7" width="16" height="9" rx="2"/><path class="p-hole" d="M8 22h14v13H8z"/><rect class="p-cup" x="11" y="28" width="8" height="7" rx="1.5"/></svg>`,
  printer: `<svg viewBox="0 0 40 46" focusable="false"><path class="p-paper" d="M11 4h18v12H11z"/><rect class="p-body" x="4" y="14" width="32" height="14" rx="3"/><path class="p-line" d="M10 22h20"/><path class="p-leg" d="M8 28h4v18H8zM28 28h4v18h-4z"/></svg>`,
  water: `<svg viewBox="0 0 26 54" focusable="false"><path class="p-bottle" d="M7 4h12v4l3 3v12H4V11l3-3z"/><rect class="p-body" x="3" y="23" width="20" height="30" rx="3"/><rect class="p-panel" x="9" y="28" width="8" height="5" rx="1.2"/></svg>`
};
const FLOOR_PROPS = ["", "shelf", "coffee", "printer", "water", "coffee", "printer"];
const PROP_FX = { shelf: "📚", coffee: "☕", printer: "📄", water: "💧" };

// ===== 살아 있는 사무실 무대 =====
// 층 = 직급 (위에서부터 사장실 → 사원). 직원 캐릭터는 스스로 돌아다니고, 보고·진실 공개 때는 자리로 돌아와 연기합니다.

const office = { company: null, el: null, floors: [], layer: null, mates: new Map(), mode: "idle", strip: false, size: "", epilogue: null, holdQuit: false };

function officeIsStrip() {
  return !!(window.matchMedia && window.matchMedia("(max-width: 759px)").matches);
}

function officeVisible() {
  return document.body.classList.contains("with-office") && office.el && office.el.offsetWidth > 0;
}

function officeWait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function officeBuild(c) {
  const el = document.getElementById("office");
  if (!el) return;
  office.mates.forEach(m => { m.gen++; });
  office.mates.clear();
  office.company = c;
  office.el = el;
  office.epilogue = null;
  el.className = "office";
  el.innerHTML = `
    <div class="office-sign"><span class="os-emoji" aria-hidden="true">${esc(c.emoji || "🏢")}</span><b class="os-name">${esc(c.name || "우리 회사")}</b><span class="os-where" id="office-where"></span></div>
    <div class="office-floors">
      ${FLOOR_RANKS.map((rank, i) => `<div class="floor f-${i} rk-${i}" data-floor="${i}">
        <span class="win" aria-hidden="true"></span>
        ${i ? `<span class="prop prop-${FLOOR_PROPS[i]}" aria-hidden="true">${PROP_SVG[FLOOR_PROPS[i]]}</span>` : ""}
        <span class="desk" aria-hidden="true">${DESK_SVG}</span>
        <span class="vacant" aria-hidden="true">공석</span>
        <span class="plate"></span>
        <span class="speech" aria-hidden="true"></span>
        <span class="floor-stamp" aria-hidden="true"></span>
      </div>`).join("")}
      <span class="stairs" aria-hidden="true"></span>
      <div class="mates" aria-hidden="true"></div>
      <div class="fly" aria-hidden="true"></div>
      <span class="spot" aria-hidden="true"></span>
      <span class="lens" aria-hidden="true">🔍</span>
    </div>
    <div class="caption" aria-hidden="true"></div>`;
  office.floors = [...el.querySelectorAll(".floor")];
  office.layer = el.querySelector(".mates");
  office.size = "";
  el.onclick = skipReveal;
}

function floorPerson(c, i) {
  if (i === 0) return null;
  const id = c.hires[FLOOR_RANKS[i]];
  return id ? candidateById(c, id) : null;
}

function plateHtml(c, i, person) {
  const rank = FLOOR_RANKS[i];
  const chars = i === 0 ? ORDER_MAX : rankInfo(rank).chars;
  const here = i === 0 || (person && !person.quit);
  const name = i === 0 ? c.player || "사장님" : here ? person.name : person && person.quit ? "퇴사" : "공석";
  const shownName = i === 0 ? name : person && (!person.quit || office.holdQuit) ? person.name : name;
  return `<b class="rank rk-${i}">${esc(rank)}</b><span class="pn">${esc(shownName)}</span>${here && person ? `<span class="ph" title="충성심 ${person.loyalty}/10">♥${person.loyalty}</span>` : ""}
    <span class="pl-chars">${cells(chars / 10)}<small>${chars}자</small></span>`;
}

// 사람이 바뀐 층만 고칩니다. animate면 새 직원은 계단에서 걸어 들어옵니다.
function officeSync(animate) {
  const c = game.company;
  if (!office.el || office.company !== c || !office.el.firstElementChild) officeBuild(c);
  if (!office.el) return;
  office.strip = officeIsStrip();
  office.el.classList.toggle("strip", office.strip);
  const sign = office.el.querySelector(".os-name");
  if (sign) sign.textContent = c.name || "우리 회사";
  const emoji = office.el.querySelector(".os-emoji");
  if (emoji) emoji.textContent = c.emoji || "🏢";
  const where = document.getElementById("office-where");
  if (where) {
    const id = document.body.dataset.screen;
    where.textContent = id === "screen-interview" ? "면접 중" : id === "screen-final" ? "1년 결산" : c.events.length ? quarterLabel(game.round) : "";
  }
  if (!officeVisible()) return;
  const size = `${office.el.offsetWidth}x${office.el.offsetHeight}x${office.strip}`;
  const moved = size !== office.size;
  office.size = size;
  FLOOR_RANKS.forEach((rank, i) => {
    const floor = office.floors[i];
    const person = floorPerson(c, i);
    const held = office.holdQuit && person && person.quit && office.mates.get(i) && office.mates.get(i).id === person.id;
    const here = i === 0 || (person && (!person.quit || held));
    floor.classList.toggle("empty", !here);
    floor.classList.toggle("left", !!(person && person.quit && !held));
    floor.querySelector(".vacant").textContent = person && person.quit ? "퇴사" : "공석";
    floor.querySelector(".plate").innerHTML = plateHtml(c, i, person);
    const want = i === 0 ? "ceo" : here ? person.id : null;
    const m = office.mates.get(i);
    if (m && m.id !== want) { mateRemove(m, animate); office.mates.delete(i); }
    if (want && !office.mates.get(i)) mateAdd(i, i === 0 ? null : person, animate);
    else if (want && office.mates.get(i)) office.mates.get(i).person = i === 0 ? null : person;
  });
  if (moved) officeRelayout();
}

function officeRelayout() {
  office.mates.forEach(m => {
    if (m.leaving) return;
    m.gen++;
    const home = officeSpot(m.i, "desk");
    mateJump(m, home.x, home.y);
    if (office.mode === "idle") mateLife(m);
  });
}

// 층 안의 자리 좌표 (사무실 바닥 기준 px)
function officeSpot(i, kind) {
  const f = office.floors[i];
  if (!f) return { x: 0, y: 0 };
  const W = f.offsetWidth, H = f.offsetHeight, X = f.offsetLeft, Y = f.offsetTop;
  if (office.strip) {
    const dx = { desk: 0, prop: 0, win: 0, stair: W * .45, door: W * .45, visit: 0, side: -W * .12 }[kind] || 0;
    return { x: X + W / 2 + dx, y: Y + H - 22 };
  }
  const frac = { desk: .2, prop: .72, win: .52, stair: .92, door: .92, visit: .36, side: .3 }[kind] ?? .2;
  return { x: X + W * frac, y: Y + H - 5 };
}

function mateAdd(i, person, animate) {
  if (!office.layer) return null;
  const el = document.createElement("div");
  el.className = `mate rk-${i}${i === 0 ? " ceo" : ""}`;
  el.innerHTML = `<div class="mate-fig">${chibiSvg(person)}<span class="mate-box" aria-hidden="true">📦</span></div><span class="mate-fx"></span><span class="mate-say"></span>`;
  office.layer.appendChild(el);
  const m = { i, id: person ? person.id : "ceo", person, el, gen: 0, x: 0, y: 0, busy: false, leaving: false };
  office.mates.set(i, m);
  const home = officeSpot(i, "desk");
  if (animate && !reduceMotion()) {
    const door = officeSpot(i, office.strip ? "side" : "door");
    mateJump(m, door.x, office.strip ? door.y + 30 : door.y);
    el.classList.add("arrive");
    mateFx(m, "👋", 1600);
    sfx("walk");
    requestAnimationFrame(() => mateGo(m, home.x, home.y, 110).then(() => {
      el.classList.remove("arrive");
      if (office.mode === "idle") mateLife(m);
    }));
  } else {
    mateJump(m, home.x, home.y);
    if (office.mode === "idle") mateLife(m);
  }
  return m;
}

function mateRemove(m, animate) {
  m.gen++;
  m.leaving = true;
  if (!animate || reduceMotion()) { m.el.remove(); return; }
  const door = officeSpot(m.i, office.strip ? "side" : "door");
  mateGo(m, door.x, door.y, 120).then(() => { m.el.classList.add("gone"); setTimeout(() => m.el.remove(), 400); });
}

// 위치는 사무실 크기에 대한 비율(cq 단위)로 저장해서, 창 크기가 바뀌어도 캐릭터가 제자리에 있습니다
function officeDims() {
  const l = office.layer;
  return { W: (l && l.offsetWidth) || 1, H: (l && l.offsetHeight) || 1 };
}

function mateSet(m, x, y) {
  const { W, H } = officeDims();
  m.fx = x / W;
  m.fy = y / H;
  m.el.style.setProperty("--mx", (m.fx * 100).toFixed(3));
  m.el.style.setProperty("--my", (m.fy * 100).toFixed(3));
}

function matePos(m) {
  const { W, H } = officeDims();
  return { x: (m.fx || 0) * W, y: (m.fy || 0) * H };
}

function mateJump(m, x, y) {
  m.el.style.transition = "none";
  mateSet(m, x, y);
  void m.el.offsetWidth;
}

function mateGo(m, x, y, speed, waitFn) {
  const now = matePos(m);
  const dist = Math.hypot(x - now.x, y - now.y);
  if (dist < 1) return Promise.resolve();
  const ms = Math.max(140, dist / (speed || 80) * 1000);
  if (Math.abs(x - now.x) > 2) m.el.classList.toggle("face-left", x < now.x);
  m.el.classList.add("walk");
  m.el.style.transition = `transform ${Math.round(ms)}ms linear`;
  mateSet(m, x, y);
  return (waitFn || officeWait)(ms).then(() => m.el.classList.remove("walk"));
}

function mateFx(m, text, ms) {
  if (!m || !m.el) return;
  const fx = m.el.querySelector(".mate-fx");
  fx.textContent = text;
  replay(fx, "on");
  if (reduceMotion()) fx.classList.add("on");
  clearTimeout(m.fxTimer);
  m.fxTimer = setTimeout(() => fx.classList.remove("on"), ms || 1400);
}

function mateSay(m, text, ms) {
  if (!m || !m.el) return;
  const say = m.el.querySelector(".mate-say");
  m.el.classList.toggle("say-left", (m.fx || 0) > .55);
  const t = Array.from(String(text));
  say.textContent = t.length > 13 ? t.slice(0, 12).join("") + "…" : t.join("");
  say.classList.add("on");
  clearTimeout(m.sayTimer);
  m.sayTimer = setTimeout(() => say.classList.remove("on"), ms || 2200);
}

function mateOf(person) {
  if (!person) return office.mates.get(0);
  for (const m of office.mates.values()) if (m.id === person.id) return m;
  return null;
}

const IDLE_CLASSES = ["walk", "type", "phone", "nap", "sip", "hop", "lookup", "read", "cheer", "slump", "clap", "pack", "liar", "run"];

function mateReset(m, keep) {
  m.gen++;
  m.busy = false;
  IDLE_CLASSES.forEach(k => { if (!keep || !keep.includes(k)) m.el.classList.remove(k); });
}

// 직원 성격(보이는 정보)으로 할 일 고르기
function pickActivity(m) {
  const x = m.person;
  if (!x) return weighted({ work: 5, pace: office.strip ? 0 : 1.4, stretch: 0.6 });
  const mbti = String(x.mbti || "");
  const E = mbti[0] === "E", P = mbti[3] === "P";
  const avoid = x.secure < 50;
  const w = {
    work: 2.6 + (x.skill - 5) * 0.55,
    coffee: office.strip ? 0 : 1.1,
    visit: office.strip ? 0 : (E ? 1.5 : 0.4) + (avoid ? 0 : 0.6),
    phone: avoid ? 1.5 : 0.5,
    nap: (P ? 0.9 : 0.25) + (x.skill <= 4 ? 0.7 : 0),
    window: office.strip ? 0 : 0.6,
    stretch: 0.6,
    lucky: x.luck >= 7 ? 0.7 : 0.08,
    sigh: x.loyalty <= 3 ? 1.6 : 0,
    proud: x.loyalty >= 8 ? 0.8 : 0
  };
  return weighted(w);
}

function weighted(w) {
  const entries = Object.entries(w).filter(([, v]) => v > 0);
  let r = Math.random() * entries.reduce((s, [, v]) => s + v, 0);
  for (const [k, v] of entries) { r -= v; if (r <= 0) return k; }
  return entries[0][0];
}

const PAIR_LINES = [["커피 한잔?", "콜 ☕"], ["회의 몇 시예요?", "방금 끝남 ㅋㅋ"], ["이거 누가 해요?", "…저요?"], ["사장님 오셨어요?", "쉿 🤫"], ["점심 뭐 먹지", "학식 ㄱ"], ["보고서 봤어요?", "아직요…"]];

async function mateLife(m) {
  if (reduceMotion() || m.leaving) return;
  const gen = ++m.gen;
  const live = () => m.gen === gen && office.mode === "idle" && m.el.isConnected && !m.leaving;
  await officeWait(rand(300, 2600));
  while (live()) {
    if (document.hidden || !officeVisible() || m.busy) { await officeWait(1200); continue; }
    await mateAct(m, pickActivity(m), live);
    if (!live()) return;
    await officeWait(rand(500, 1600));
  }
}

async function mateAct(m, act, live) {
  const home = officeSpot(m.i, "desk");
  const back = () => live() ? mateGo(m, home.x, home.y, 75) : null;
  switch (act) {
    case "work":
      m.el.classList.add("type");
      if (m.person && m.person.skill >= 7 && Math.random() < .5) mateFx(m, "🔥", 1600);
      await officeWait(rand(2800, 6000));
      m.el.classList.remove("type");
      break;
    case "coffee": {
      const p = officeSpot(m.i, "prop");
      await mateGo(m, p.x - 16, p.y, 70);
      if (!live()) return;
      m.el.classList.add("sip");
      mateFx(m, PROP_FX[FLOOR_PROPS[m.i]] || "☕", 2200);
      await officeWait(rand(1800, 2800));
      m.el.classList.remove("sip");
      await back();
      break;
    }
    case "window":
    case "pace": {
      const p = officeSpot(m.i, "win");
      await mateGo(m, p.x, p.y, 60);
      if (!live()) return;
      m.el.classList.add("lookup");
      if (act === "pace") mateFx(m, "🤔", 1500);
      await officeWait(rand(1500, 2600));
      m.el.classList.remove("lookup");
      await back();
      break;
    }
    case "visit": {
      const j = m.i + (Math.random() < .5 ? -1 : 1);
      const other = office.mates.get(j);
      if (j < 1 || !other || other.busy || other.leaving) break;
      m.busy = true;
      other.busy = true;
      const a = officeSpot(m.i, "stair"), b = officeSpot(j, "stair"), t = officeSpot(j, "visit");
      await mateGo(m, a.x, a.y, 95);
      if (live()) await mateGo(m, b.x, b.y, 55);
      if (live()) await mateGo(m, t.x, t.y, 95);
      if (live()) {
        const [ask, reply] = pickOne(PAIR_LINES);
        m.el.classList.add("face-left");
        other.el.classList.remove("face-left");
        mateSay(m, ask, 1700);
        await officeWait(1100);
        mateSay(other, reply, 1700);
        await officeWait(1800);
      }
      if (live()) await mateGo(m, b.x, b.y, 95);
      if (live()) await mateGo(m, a.x, a.y, 55);
      other.busy = false;
      m.busy = false;
      await back();
      break;
    }
    case "phone":
      m.el.classList.add("phone");
      mateFx(m, "📱", 2800);
      await officeWait(rand(2400, 3800));
      m.el.classList.remove("phone");
      break;
    case "nap":
      m.el.classList.add("nap");
      mateFx(m, "💤", 3800);
      await officeWait(rand(3000, 4400));
      m.el.classList.remove("nap");
      break;
    case "stretch":
      m.el.classList.add("hop");
      await officeWait(800);
      m.el.classList.remove("hop");
      break;
    case "lucky":
      mateFx(m, Math.random() < .5 ? "🍀" : "🪙", 1500);
      m.el.classList.add("hop");
      await officeWait(1000);
      m.el.classList.remove("hop");
      break;
    case "sigh":
      mateFx(m, "😮‍💨", 2000);
      await officeWait(2200);
      break;
    case "proud":
      mateFx(m, "✨", 1500);
      m.el.classList.add("hop");
      await officeWait(900);
      m.el.classList.remove("hop");
      break;
  }
}

// 대본 모드: 모두 자리로 (보고·진실 공개·결산)
function officeBusy(fast) {
  office.mode = "busy";
  office.mates.forEach(m => {
    if (m.leaving) return;
    mateReset(m, ["liar"]);
    const h = officeSpot(m.i, "desk");
    if (fast || reduceMotion()) mateJump(m, h.x, h.y);
    else mateGo(m, h.x, h.y, 280);
  });
}

function officeIdle() {
  if (!office.el) return;
  office.mode = reduceMotion() ? "still" : "idle";
  office.mates.forEach(m => {
    if (m.leaving) return;
    mateReset(m, ["liar"]);
    if (office.mode === "idle") mateLife(m);
  });
}

// 새 분기 이벤트가 오면 자리로 뛰어 들어가고 ❗
function officeRush(text) {
  if (!office.el) return;
  officeBusy();
  officeClearSay();
  office.mates.forEach(m => { if (!m.leaving) { m.el.classList.remove("liar"); m.el.classList.add("run"); mateFx(m, text || "❗", 1300); } });
  setTimeout(() => {
    if (office.mode === "busy" && document.body.dataset.screen === "screen-event") officeIdle();
  }, 1500);
}

// 지시가 내려오면 사장 쪽을 보고, 바빠집니다
function officeGather() {
  if (!office.el) return;
  officeBusy();
  office.mates.forEach(m => {
    if (m.leaving) return;
    if (m.i === 0) { mateSay(m, "지시 나갑니다!", 1800); return; }
    m.el.classList.add("lookup");
    if (office.strip) m.el.classList.add("face-left");
    mateFx(m, "❗", 1200);
  });
  setTimeout(() => {
    office.mates.forEach(m => {
      if (m.leaving || office.mode !== "busy") return;
      m.el.classList.remove("lookup");
      m.el.classList.add("type");
      if (Math.random() < .5) mateFx(m, "💦", 2000);
    });
  }, 1300);
}

function officeTyping(person, on) {
  const m = mateOf(person);
  if (!m) return;
  if (on) mateFx(m, "💬", 900);
}

function officeClearSay() {
  if (!office.el) return;
  office.el.querySelectorAll(".speech").forEach(s => { s.className = "speech"; s.textContent = ""; });
  office.el.querySelectorAll(".floor-stamp").forEach(s => { s.className = "floor-stamp"; s.textContent = ""; });
  const cap = office.el.querySelector(".caption");
  if (cap) cap.classList.remove("on");
  office.el.querySelectorAll(".floor").forEach(f => f.classList.remove("lit"));
}

// 무대 말풍선. level이 높을수록(보고가 위로 올라갈수록) 부풀어 오릅니다
function officeSay(i, text, opts) {
  if (!office.el || !officeVisible()) return;
  const o = opts || {};
  const t = Array.from(String(text || ""));
  if (office.strip) {
    const cap = office.el.querySelector(".caption");
    const f = office.floors[i];
    if (!cap || !f) return;
    cap.textContent = t.length > 40 ? t.slice(0, 39).join("") + "…" : t.join("");
    cap.className = `caption on ${o.lie ? "lie" : ""} ${o.up ? "up" : ""}`;
    const x = f.offsetLeft + f.offsetWidth / 2;
    cap.style.setProperty("--ax", `${Math.round(x)}px`);
    cap.style.setProperty("--lv", o.level || 0);
    replay(cap, "pop");
    return;
  }
  const sp = office.floors[i] && office.floors[i].querySelector(".speech");
  if (!sp) return;
  sp.textContent = t.join("");
  sp.className = `speech on ${o.lie ? "lie" : ""} ${o.up ? "up" : ""} ${o.final ? "final" : ""} ${i === 0 ? "ceo" : ""}`;
  sp.style.setProperty("--lv", o.level || 0);
  replay(sp, "pop");
}

function officeSpot2(i) {
  if (!office.el) return;
  office.el.querySelectorAll(".floor").forEach((f, k) => f.classList.toggle("lit", k === i));
  office.el.classList.toggle("spotting", i !== null && i !== undefined);
  const spot = office.el.querySelector(".spot");
  const f = i !== null && i !== undefined ? office.floors[i] : null;
  if (!spot) return;
  if (!f) { spot.classList.remove("on"); return; }
  const { W, H } = officeDims();
  spot.style.left = `${(f.offsetLeft / W * 100).toFixed(2)}%`;
  spot.style.top = `${(f.offsetTop / H * 100).toFixed(2)}%`;
  spot.style.width = `${(f.offsetWidth / W * 100).toFixed(2)}%`;
  spot.style.height = `${(f.offsetHeight / H * 100).toFixed(2)}%`;
  spot.classList.add("on");
}

// 사장 지시서가 층마다 내려가며 글자칸이 떨어져 나갑니다 (직급 글자 수 한도 = 공개된 규칙)
async function officePaper(order, chain) {
  if (!office.el || !officeVisible() || !chain.length) return;
  const fly = office.el.querySelector(".fly");
  const letters = Array.from(String(order || ""));
  const showText = n => letters.slice(0, n).join("") + (letters.length > n ? "…" : "");
  fly.innerHTML = `<span class="fly-text"></span><span class="fly-cells">${"<i></i>".repeat(ORDER_MAX / 10)}</span><b class="fly-limit">${ORDER_MAX}자</b>`;
  fly.querySelector(".fly-text").textContent = showText(14);
  const place = (i, ms) => {
    const p = officeSpot(i, "desk");
    const { W, H } = officeDims();
    const half = office.strip ? 30 : 78;
    const x = Math.max(half, Math.min(W - half, p.x + (office.strip ? 0 : 70)));
    fly.style.transition = ms ? `transform ${ms}ms cubic-bezier(.45,.05,.3,1)` : "none";
    fly.style.setProperty("--fx", (x / W * 100).toFixed(3));
    fly.style.setProperty("--fy", ((p.y - (office.strip ? 58 : 38)) / H * 100).toFixed(3));
  };
  place(0, 0);
  void fly.offsetWidth;
  fly.classList.add("on");
  const ceo = office.mates.get(0);
  if (ceo) { ceo.el.classList.add("hop"); setTimeout(() => ceo.el.classList.remove("hop"), 700); }
  await beat(380);
  for (const x of chain) {
    const i = rankNo(x.rank);
    place(i, 420);
    sfx("whoosh");
    await beat(430);
    const keep = rankInfo(x.rank).chars / 10;
    fly.querySelectorAll(".fly-cells i").forEach((cell, k) => cell.classList.toggle("drop", k >= keep));
    fly.querySelector(".fly-limit").textContent = `✂ ${rankInfo(x.rank).chars}자`;
    fly.querySelector(".fly-text").textContent = showText(Math.max(1, Math.round(14 * keep / 10)));
    replay(fly, "land");
    const m = mateOf(x);
    if (m) { m.el.classList.add("read"); setTimeout(() => m.el.classList.remove("read"), 700); }
    await beat(340);
  }
  fly.classList.remove("on");
}

function officeLie(i, label) {
  if (!office.el) return;
  const m = office.mates.get(i);
  if (m) { m.el.classList.add("liar"); mateFx(m, "😳", 1400); }
  const st = office.floors[i] && office.floors[i].querySelector(".floor-stamp");
  if (st) {
    st.innerHTML = `<span class="fs-long">${esc(label || "🤥 거짓말")}</span><span class="fs-short">🤥</span>`;
    st.className = "floor-stamp stamp on";
    replay(st, "thud");
  }
  replay(office.el, "jolt", 400);
}

function officeHearts(n) {
  const wrap = office.el && office.el.querySelector(".office-floors");
  if (!wrap || reduceMotion()) return;
  const spots = [...office.mates.values()].filter(m => !m.leaving);
  for (let k = 0; k < n; k++) {
    const m = spots[k % Math.max(1, spots.length)];
    if (!m) return;
    const h = document.createElement("span");
    h.className = "heart-fx";
    h.textContent = k % 3 ? "❤" : "👏";
    const p = matePos(m);
    h.style.transform = `translate3d(${(p.x + rand(-14, 14)).toFixed(0)}px, ${(p.y - 50).toFixed(0)}px, 0)`;
    h.style.animationDelay = `${(k * 0.07).toFixed(2)}s`;
    wrap.appendChild(h);
    setTimeout(() => h.remove(), 1900);
  }
}

function officeClap() {
  if (!office.el) return;
  office.mates.forEach(m => { if (!m.leaving) m.el.classList.add("clap"); });
  officeHearts(14);
  setTimeout(() => office.mates.forEach(m => m.el.classList.remove("clap")), 1500);
}

function officeLens() {
  if (!office.el || reduceMotion()) return;
  const lens = office.el.querySelector(".lens");
  const wrap = office.el.querySelector(".office-floors");
  if (!lens || !wrap || !lens.animate) return;
  const W = wrap.offsetWidth, H = wrap.offsetHeight;
  const pts = office.strip
    ? [[.08, .45], [.35, .55], [.62, .4], [.92, .5]]
    : [[.2, .08], [.75, .24], [.25, .42], [.75, .6], [.25, .78], [.6, .94]];
  lens.classList.add("on");
  lens.animate(pts.map(([x, y]) => ({ transform: `translate3d(${(x * W).toFixed(0)}px, ${(y * H).toFixed(0)}px, 0) translate(-50%, -50%)` })),
    { duration: SUSPENSE_DELAY, easing: "ease-in-out" }).onfinish = () => lens.classList.remove("on");
  office.mates.forEach(m => { if (!m.leaving && m.i) { m.el.classList.add("slump"); mateFx(m, "💦", 1100); } });
  setTimeout(() => office.mates.forEach(m => m.el.classList.remove("slump")), 1200);
}

function officeMood(kind) {
  if (!office.el) return;
  office.mates.forEach(m => {
    if (m.leaving || m.i === 0) return;
    m.el.classList.add(kind);
    mateFx(m, kind === "cheer" ? pickOne(["🎉", "😆", "🙌"]) : pickOne(["😨", "💦", "😵"]), 1800);
  });
  setTimeout(() => office.mates.forEach(m => m.el.classList.remove(kind)), 1900);
}

// 퇴사: 상자를 들고 계단(문) 쪽으로 걸어 나갑니다
async function officeQuit(i) {
  const m = office.mates.get(i);
  if (!m || !officeVisible()) return;
  m.gen++;
  m.leaving = true;
  mateReset(m);
  m.leaving = true;
  m.el.classList.add("pack");
  mateFx(m, "😢", 1400);
  const st = office.floors[i] && office.floors[i].querySelector(".floor-stamp");
  if (st) { st.innerHTML = `<span class="fs-long">퇴사</span><span class="fs-short">📦</span>`; st.className = "floor-stamp stamp quit on"; replay(st, "thud"); }
  sfx("stamp");
  await beat(650);
  const door = officeSpot(i, office.strip ? "side" : "door");
  await mateGo(m, door.x, door.y, 85, beat);
  m.el.classList.add("gone");
  await beat(380);
  m.el.remove();
  office.mates.delete(i);
  const f = office.floors[i];
  if (f) { f.classList.add("empty", "left"); f.querySelector(".vacant").textContent = "퇴사"; }
}

// 결산 에필로그: party(흑자) / pack(적자) / dark(직원 없음)
function officeEpilogue(kind) {
  if (!office.el) return;
  if (office.epilogue === kind) return;
  office.el.classList.remove("ep-party", "ep-pack", "ep-dark");
  office.epilogue = kind;
  if (!kind) return;
  officeBusy(true);
  officeClearSay();
  office.el.classList.add(`ep-${kind}`);
  office.mates.forEach(m => {
    if (m.leaving) return;
    if (kind === "party") { m.el.classList.add("cheer"); mateFx(m, pickOne(["🎉", "🥳", "🍾", "🙌"]), 60000); }
    if (kind === "pack" && m.i) { m.el.classList.add("pack", "slump"); mateFx(m, pickOne(["😭", "📦", "😮‍💨"]), 60000); }
    if (kind === "dark" && m.i === 0) mateFx(m, "☕", 60000);
  });
}

// ===== 사내 단톡방 (실시간 잡담 + 실제 보고) =====

const talk = { company: null, unread: 0, open: false, timer: null, kind: "", slowUntil: 0, posted: null, recent: [], afterLeft: 0 };

function talkFeed() {
  return document.getElementById("talk-feed");
}

function talkIsSheet() {
  return !!(window.matchMedia && window.matchMedia("(max-width: 1179px)").matches);
}

function talkEnsure() {
  const c = game.company;
  const feed = talkFeed();
  if (!feed) return;
  if (talk.company !== c) {
    talk.company = c;
    talk.unread = 0;
    talk.posted = null;
    talk.recent = [];
    feed.innerHTML = "";
    document.getElementById("talk-peek").textContent = "";
    talkSystem(`💬 '${c.name || "우리 회사"}' 사내 단톡방에 오신 것을 환영합니다`);
  }
  document.getElementById("talk-name").textContent = `${c.name || "우리 회사"} 단톡방`;
  if (!revealing) document.getElementById("talk-members").textContent = `👥 ${staffOf(c).length + 1}`;
  talkBadge();
}

function talkSystem(text) {
  const feed = talkFeed();
  if (!feed) return null;
  const p = document.createElement("p");
  p.className = "sys";
  p.textContent = text;
  feed.appendChild(p);
  talkNew(p, true);
  return p;
}

function talkNearBottom() {
  const feed = talkFeed();
  return !feed || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
}

function talkScroll(force) {
  const feed = talkFeed();
  if (!feed) return;
  if (force || talkNearBottom()) feed.scrollTop = feed.scrollHeight;
}

// 새 메시지: 맨 아래면 따라 내려가고, 안 보이면 안 읽음 숫자
function talkNew(node, quiet) {
  const feed = talkFeed();
  if (!feed || !node || !feed.contains(node)) return;
  const near = feed.scrollHeight - node.offsetHeight - feed.scrollTop - feed.clientHeight < 90;
  if (near || revealing) feed.scrollTop = feed.scrollHeight;
  const hidden = talkIsSheet() && !talk.open;
  if (!quiet && (hidden || !near) && !revealing) { talk.unread++; talkBadge(); }
  const peek = document.getElementById("talk-peek");
  if (peek && !quiet) {
    const who = node.querySelector(".who");
    const bubble = node.querySelector(".bubble");
    if (bubble) peek.textContent = `${who ? who.textContent.replace(/\s+→.*$/, "") + ": " : "나: "}${bubble.textContent}`;
  }
  // 오래된 잡담은 지워서 가볍게
  const amb = feed.querySelectorAll(":scope > .msg.amb, :scope > .sys");
  for (let k = 0; k < amb.length - 60; k++) amb[k].remove();
}

function talkBadge() {
  const b = document.getElementById("talk-unread");
  if (!b) return;
  b.hidden = talk.unread <= 0;
  b.textContent = talk.unread > 99 ? "99+" : String(talk.unread);
}

function talkOpen(open) {
  const el = document.getElementById("talk");
  if (!el) return;
  talk.open = !!open;
  el.classList.toggle("open", talk.open);
  const t = document.getElementById("talk-toggle");
  if (t) t.setAttribute("aria-expanded", String(talk.open));
  if (talk.open) { talk.unread = 0; talkBadge(); setTimeout(() => talkScroll(true), 30); }
}

function msgNode(o) {
  const div = document.createElement("div");
  const me = o.kind === "ceo";
  div.className = `msg ${o.kind || ""}${o.amb ? " amb" : ""}`;
  if (o.amb) div.setAttribute("aria-hidden", "true");
  div.innerHTML = `${me ? "" : avatar(o.person)}<div class="msg-body">
      <div class="who">${esc(o.who)}${o.kind === "lie" ? " 🤥" : ""}</div>
      <div class="line"><div class="bubble">${esc(o.text)}${o.kind === "lie" ? stamp("🤥 거짓말", "lie-stamp") : ""}</div>
        <span class="meta">${o.unread ? `<b class="unread">${Number(o.unread)}</b>` : ""}<time>${esc(clockNow())}</time></span></div>
      ${o.react ? `<div class="reacts" aria-label="반응"></div>` : ""}
    </div>`;
  return div;
}

function talkPost(o) {
  const feed = talkFeed();
  if (!feed) return null;
  const node = msgNode(o);
  feed.appendChild(node);
  talkNew(node);
  return node;
}

function talkTypingShow(text) {
  const el = document.getElementById("talk-typing");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("on", !!text);
}

function roundKey() {
  return `${game.round}:${game.company.rounds[game.round] ? game.company.rounds[game.round].order.length : 0}`;
}

// 사장 지시가 단톡방에 올라가고, 직원들이 읽고(숫자 감소) 이모지로 반응합니다
function talkOrder(order) {
  const c = game.company;
  talk.posted = roundKey();
  talkSystem(`📣 ${quarterLabel(game.round)} · 사장님 지시`);
  const staff = transmissionStaff(c);
  const node = talkPost({ who: `사장 ${c.player} (나)`, text: order, kind: "ceo", unread: staff.length, react: true });
  if (!node) return;
  sfx("pop");
  const unread = node.querySelector(".unread");
  const reacts = node.querySelector(".reacts");
  let left = staff.length;
  staff.forEach((x, k) => {
    setTimeout(() => {
      left--;
      if (unread) { if (left > 0) unread.textContent = String(left); else unread.remove(); }
      if (reacts && k < 4) {
        const mbti = String(x.mbti || "");
        const emo = x.skill >= 7 ? "🔥" : x.secure < 50 ? "😅" : x.loyalty <= 3 ? "😮‍💨" : mbti[0] === "E" ? "👍" : "🫡";
        const r = document.createElement("span");
        r.className = "react";
        r.textContent = emo;
        reacts.appendChild(r);
        mateFx(mateOf(x), emo, 1200);
      }
    }, reduceMotion() ? 0 : 500 + k * 420);
  });
}

// 잡담 문구 (연출용, ChatKHU 호출 없음). {ev} = 이번 이벤트 제목, {n} = 내 직급 글자 수
const CHAT = {
  위기: ["'{ev}' 실화예요?", "{ev}… 오늘 야근각", "사장님 지시 언제 내려와요?", "일단 침착하게…", "방금 소식 들었어요 😱", "보고서 양식부터 찾는 중", "고객 전화 또 왔어요 📞"],
  기회: ["'{ev}' 대박 기회 아니에요?", "이번엔 보너스 각 🤑", "{ev}! 준비해야겠다", "벌써 설레요 ✨", "이거 잘되면 승진?", "사장님 표정 좋으시던데요"],
  rank: {
    임원: ["보고서 표지 색이 마음에 안 드는데", "회의는 짧게, 결론은 길게", "골프 약속은 미뤘습니다"],
    부장: ["또 회의야…", "내가 들은 거랑 좀 다른데?", "다들 자리에 있죠?"],
    차장: ["부장님 말씀 40자로 줄이는 중", "점심 뭐 먹지", "엑셀 파일명 최종_진짜최종"],
    과장: ["30자… 조사는 빼도 되겠지", "엑셀이 또 멈췄다", "과장이라 과하게 일함"],
    대리: ["20자면 이모티콘은 포기", "'알아서 잘'이라고 전하자", "대리 출석 ✋"],
    사원: ["10자면 '네 알겠습니다'도 빠듯", "아무도 설명을 안 해 줘요", "저 사원인데 이거 제가 해요?"]
  },
  skill: ["제가 맡을게요 💪", "자료 벌써 정리해 뒀어요", "엑셀 켜 놨습니다"],
  luck: ["느낌이 좋아요 🍀", "오늘 운세 대길이래요", "어쩌다 보니 잘 될 듯"],
  avoid: ["(읽음)", "잠깐 커피 좀…", "알림 껐다 켰다 하는 중", "일단 지켜볼게요"],
  secure: ["다들 화이팅이에요!", "모르는 거 있으면 물어보세요", "점심 같이 드실 분?"],
  E: ["점심 뭐 먹어요? 🍜", "회의실 잡을까요?", "단톡방 너무 조용한데요 ㅋㅋ"],
  I: ["…넵", "(조용히 이어폰 낌)", "저는 자리에서 할게요"],
  low: ["요즘 이직 사이트 구경 중…", "월급날 언제였죠", "하아…"],
  high: ["우리 회사 최고 👍", "사장님 믿습니다!"],
  wait: ["넵 확인했습니다!", "지시 받았습니다 🫡", "{n}자로 줄이는 중…", "앞부분만 기억나는데…", "윗분이 뭐라고 하셨죠?", "보고서 쓰는 중 ✍️", "이거 어떻게 줄이지", "일단 '알아서 잘'로…", "마감 언제예요?", "지금 처리 중입니다!"],
  good: ["휴 살았다 😮‍💨", "다음 분기도 가즈아", "오늘 회식인가요? 🍗"],
  bad: ["망했다…", "다음엔 잘해 봐요 😢", "회의 소집각…"],
  praise: ["칭찬받았다 🎉", "사장님 최고!", "(뿌듯)"],
  dig: ["사장님 눈빛 무서워요", "다 보고 계셨어…", "(식은땀)"],
  dinner: ["회식이다!! 🍗", "사장님이 쏘신대요!", "치킨 반반 무 많이"]
};

function ambientStart(kind) {
  if (talk.kind === kind && talk.timer) return;
  talk.kind = kind;
  clearTimeout(talk.timer);
  ambientSchedule(true);
}

function ambientStop() {
  talk.kind = "";
  clearTimeout(talk.timer);
  talk.timer = null;
  talkTypingShow("");
}

function ambientSchedule(first) {
  clearTimeout(talk.timer);
  if (!talk.kind) return;
  if (first) talk.burst = 3;
  const base = talk.burst > 0 ? 1300 : talk.kind === "wait" ? 2300 : talk.kind === "after" ? 1500 : 3600;
  const slow = Date.now() < talk.slowUntil ? 3 : 1;
  talk.timer = setTimeout(ambientTick, (first ? 700 : rand(base, base * 1.6)) * slow);
}

function ambientPerson() {
  const staff = staffOf(game.company).filter(x => mateOf(x) || !officeVisible());
  return staff.length ? pickOne(staff) : null;
}

function fillLine(text, x) {
  const ev = game.company.events[game.round] || {};
  return text.replace("{ev}", ev.title || "이번 일").replace("{n}", String(rankInfo(x.rank).chars));
}

function ambientLine(x) {
  const c = game.company;
  const round = c.rounds[game.round] || {};
  const ev = c.events[game.round] || {};
  if (talk.kind === "wait") return pickOne(CHAT.wait);
  if (talk.kind === "after") {
    if (round.quits && round.quits.length && Math.random() < .4) return `${round.quits[0]}님 짐 싸셨대요…`;
    if (round.choice === "praise" && round.success) return pickOne([...CHAT.praise, ...CHAT.good]);
    if (round.choice === "dig") return pickOne(round.success ? CHAT.dig : [...CHAT.dig, ...CHAT.good]);
    return pickOne(round.success ? CHAT.good : CHAT.bad);
  }
  if (round.power === "dinner" && Math.random() < .35) return pickOne(CHAT.dinner);
  const pools = [CHAT[ev.type === "기회" ? "기회" : "위기"], CHAT[ev.type === "기회" ? "기회" : "위기"], CHAT.rank[x.rank] || []];
  const mbti = String(x.mbti || "");
  if (x.skill >= 7) pools.push(CHAT.skill);
  if (x.luck >= 7) pools.push(CHAT.luck);
  pools.push(x.secure < 50 ? CHAT.avoid : CHAT.secure);
  pools.push(mbti[0] === "E" ? CHAT.E : CHAT.I);
  if (x.loyalty <= 3) pools.push(CHAT.low, CHAT.low);
  if (x.loyalty >= 8) pools.push(CHAT.high);
  return pickOne(pickOne(pools.filter(p => p.length)));
}

async function ambientTick() {
  talk.timer = null;
  const kind = talk.kind;
  if (!kind) return;
  if (document.hidden || !document.body.classList.contains("with-talk") || revealing) return ambientSchedule();
  if (kind === "after" && talk.afterLeft-- <= 0) { talk.kind = ""; return; }
  const x = ambientPerson();
  if (!x) return ambientSchedule();
  let text = "";
  for (let k = 0; k < 4; k++) {
    text = fillLine(ambientLine(x), x);
    if (!talk.recent.includes(text)) break;
  }
  talk.recent = [text, ...talk.recent].slice(0, 8);
  const typing = Date.now() < talk.slowUntil;
  if (!typing && !reduceMotion()) {
    talkTypingShow(`${x.rank} ${x.name}님이 입력 중…`);
    officeTyping(x, true);
    await officeWait(800);
    talkTypingShow("");
  }
  if (talk.kind !== kind) return;
  talkPost({ person: x, who: `${x.rank} ${x.name}`, text, amb: true });
  mateSay(mateOf(x), text, 2400);
  talk.burst = (talk.burst || 0) - 1;
  ambientSchedule();
}

// ===== 창업 (타이틀 화면 + 회사 만들기) =====

let titleFor = null;

const DEMO = [
  { rank: "부장", name: "부", mbti: "ESTJ", secure: 70 },
  { rank: "대리", name: "대", mbti: "INFP", secure: 40 },
  { rank: "사원", name: "사", mbti: "ISTP", secure: 60 }
];

function renderTitle() {
  const demo = document.getElementById("title-demo");
  if (demo && !demo.firstElementChild) {
    // 8초짜리 반복 데모: 지시가 줄어들며 내려가고, 보고가 부풀며 올라오고, 🤥 공개 (고정 문구)
    const floors = [{ rank: "사장", p: null, say: "오늘 안에 고객께 사과하고 환불해 드려요" }, ...DEMO.map((p, k) => ({ rank: p.rank, p, say: ["고객께 사과하고 환불", "고객 환불", "환불"][k] }))];
    const ups = ["대성공! 고객 감동 200%!!", "완벽하게 처리했습니다!", "환불했어요"];
    demo.innerHTML = `<div class="demo-tower">${floors.map((f, i) => `
      <div class="demo-floor rk-${i ? rankNo(f.rank) : 0} df-${i}">
        <span class="demo-rank rank rk-${i ? rankNo(f.rank) : 0}">${esc(f.rank)}</span>
        <span class="demo-desk">${DESK_SVG}</span>
        <span class="demo-mate${i === 1 ? " demo-liar" : ""}">${chibiSvg(f.p)}</span>
        <span class="demo-down dd-${i}">${esc(f.say)}</span>
        ${i ? `<span class="demo-up du-${i}">${esc(ups[i - 1])}</span>` : ""}
      </div>`).join("")}
      <span class="demo-paper"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
      <span class="demo-stamp stamp">🤥 거짓말</span>
    </div>`;
  }
  const ranks = document.getElementById("title-ranks");
  if (!ranks) return;
  const top = sortedBoard().slice(0, 3);
  const html = top.length ? `<p class="tr-head">🏆 명예의 전당</p><ol class="tr-list">${top.map((e, k) => `
    <li class="tr-${k + 1}" style="--k:${k}"><span class="tr-medal" aria-hidden="true">${medal(k + 1)}</span><b>${esc(e.player)}</b><small>${esc(e.emoji)} ${esc(e.name)}</small><span class="tr-money ${e.profit < 0 ? "neg" : "pos"}">${money(e.profit)}</span></li>`).join("")}</ol>`
    : `<p class="tr-head">🏆 첫 번째 사장님이 되어 보세요!</p>`;
  if (ranks.dataset.html !== html) { ranks.innerHTML = html; ranks.dataset.html = html; }
}

function renderFound() {
  const c = game.company;
  const screen = document.getElementById("screen-found");
  if (titleFor !== c) {
    titleFor = c;
    resetSkip();
    revealing = false;
    document.body.classList.remove("revealing", "in-suspense");
    if (screen) screen.classList.add("intro");
    if (screen && screen.classList.contains("active")) document.body.classList.add("at-title");
    renderTitle();
    setTimeout(() => { if (titleFor === c && screen && screen.classList.contains("intro")) renderTitle(); }, 2500);
  }
  const season = getSeason();
  const industryHtml = season
    ? `<div class="industry-card">
         <span class="emoji" aria-hidden="true">${esc(c.emoji)}</span>
         <div><small>이번 대결 업종 · 모든 사장님이 같아요</small><b>${esc(c.industry)}</b></div>
       </div>`
    : c.industry
    ? `<div class="industry-card fresh">
         <span class="emoji" aria-hidden="true">${esc(c.emoji)}</span>
         <div><small>ChatKHU가 뽑은 업종</small><b>${esc(c.industry)}</b></div>
       </div>
       <button class="text-btn" data-action="roll" ${c.rolls >= MAX_ROLLS ? "disabled" : ""}>
         ${c.rolls >= MAX_ROLLS ? "다시 뽑기 사용함" : "🎲 다시 뽑기 (1회)"}</button>`
    : `<button class="roll-btn" data-action="roll"><span class="dice" aria-hidden="true">🎲</span> ChatKHU로 업종 뽑기</button>
       <p class="hint">업종은 사장님마다 랜덤이에요. 순위는 업종 상관없이 수익으로 겨룹니다.</p>`;

  const funding = FUNDING.map(f => `
    <label class="fund ${c.funding === f.id ? "picked" : ""}">
      <input type="radio" name="fund" value="${f.id}" ${c.funding === f.id ? "checked" : ""} data-action="fund">
      <span class="fund-ico" aria-hidden="true">${FUND_ICONS[f.id] || "💰"}</span>
      <b>${esc(f.name)}</b><span class="fund-budget">예산 <strong>${f.budget}</strong></span><small>${esc(f.note)}</small>
    </label>`).join("");

  const box = document.getElementById("found-box");
  box.innerHTML = `
    <div class="step-block"><p class="step-label"><span class="step-no">1</span>사장님</p>
    <label class="field">사장님 닉네임 <span class="hint">(순위표에 나와요)</span>
      <input data-field="player" maxlength="${PLAYER_MAX}" value="${esc(c.player)}" placeholder="예: 경희왕">
    </label></div>
    <div class="step-block"><p class="step-label"><span class="step-no">2</span>업종</p>
    ${industryHtml}</div>
    <div class="step-block"><p class="step-label"><span class="step-no">3</span>회사</p>
    <label class="field">우리 회사는 무슨 일을 하나요? <span class="counter" data-for="detail">${c.detail.length} / ${DETAIL_MAX}</span>
      <textarea data-field="detail" maxlength="${DETAIL_MAX}" rows="2" placeholder="예: 시험기간에 교수님 몰래 족보를 배달해 줌">${esc(c.detail)}</textarea>
    </label>
    <div class="field-pair">
    <label class="field">회사 이름
      <input data-field="name" maxlength="${NAME_MAX}" value="${esc(c.name)}" placeholder="예: 족보특급">
    </label>
    <label class="field">사훈 <span class="counter" data-for="motto">${c.motto.length} / ${MOTTO_MAX}</span>
      <input data-field="motto" maxlength="${MOTTO_MAX}" value="${esc(c.motto)}" placeholder="예: 빠르게 실패하자">
    </label></div></div>
    <div class="step-block"><p class="step-label"><span class="step-no">4</span>창업 자금 <span class="hint">난이도</span></p>
    <div class="funds">${funding}</div></div>
  `;
  // 입력하는 대로 명함 미리 보기 (보여 주기만, 저장은 main.js)
  box.oninput = () => setTimeout(renderFoundPreview, 0);
  box.onchange = () => setTimeout(renderFoundPreview, 0);
  renderFoundPreview();
}

function renderFoundPreview() {
  const c = game.company;
  const el = document.getElementById("found-preview");
  if (!el) return;
  const f = fundingOf(c);
  el.innerHTML = `<p class="biz-head"><span>사업자 등록증</span><span>No.${String((c.name || "").length * 7 + 101).padStart(4, "0")}</span></p>
    <div class="biz-main"><span class="biz-emoji" aria-hidden="true">${esc(c.emoji || "🏢")}</span>
    <div><b class="biz-name">${esc(c.name || "회사 이름")}</b><small>${esc(c.industry || "업종 미정")}</small></div></div>
    <p class="biz-motto">${c.motto ? `"${esc(c.motto)}"` : "사훈을 정해 주세요"}</p>
    <p class="biz-foot"><span>대표 <b>${esc(c.player || "???")}</b></span><span>${FUND_ICONS[f.id] || "💰"} 예산 ${f.budget}</span></p>
    ${c.name && c.motto && c.industry && c.player ? stamp("승인 대기", "biz-stamp") : ""}`;
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
  document.getElementById("screen-ai").classList.toggle("in-quarter", aiKind === "event");
  if (aiKind === "event") {
    const round = game.company.rounds[game.round];
    talkEnsure();
    talk.slowUntil = 0; // 지시를 보냈으니 단톡방이 다시 바빠집니다
    if (round && round.order && talk.posted !== roundKey()) {
      talkOrder(round.order);
      setTimeout(officeGather, 60);
    }
  }
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
  document.getElementById("screen-ai").dataset.state = state;
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
    ["사원", "자기소개 10자로 줄이는 중… '열심히하겠습니다'"], ["임원", "면접 질문이 어렵지 않기를"],
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
    if (tick % 3 === 0 && thought && lines.length && aiKind !== "event") {
      const line = lines[(tick / 3 + offset) % lines.length];
      thought.innerHTML = `<div class="thought-pop">${avatar(line.person)}<p class="thought-bubble"><b>${esc(line.who)}</b> ${esc(line.text)}</p></div>`;
    }
    if (tick % 6 === 0 && tip) {
      tip.textContent = tips[(tick / 6 + offset) % tips.length];
      replay(tip, "fresh");
    }
    tick++;
  };
  if (thought && aiKind === "event") thought.innerHTML = "";
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
    <section class="roadmap" aria-label="1년 로드맵">
      <p class="roadmap-title"><b>1년 = 4개 레벨</b> <span>위기 ${EVENT_ORDER.filter(t => t === "위기").length} · 기회 ${EVENT_ORDER.filter(t => t === "기회").length}</span></p>
      <ol class="plan">${EVENT_ORDER.map((t, i) => `<li class="${t === "기회" ? "chance" : "crisis"}" style="--i:${i}"><small>LEVEL ${i + 1}</small><b>${t === "기회" ? "✨ 기회" : "⚠ 위기"}</b><span>${esc(quarterLabel(i))}</span></li>`).join("")}</ol>
      <p class="hint">1년 누적 수익으로 순위를 겨룹니다. 인건비 예산은 ${budgetOf(c)}, 분기마다 연봉 1당 ${COST_PER_SALARY}만원이 나갑니다.</p>
    </section>`;
}

// ===== 면접 =====

const STAT_ICONS = { 능력: "⚔️", 운: "🍀", 정직: "😇" };

function statBar(label, value, cls) {
  return `<div class="stat ${cls || ""}"><span><i aria-hidden="true">${STAT_ICONS[label] || ""}</i>${esc(label)}</span>
    <div class="bar">${Array.from({ length: 10 }, (_, k) => `<i class="${k < value ? "on" : ""}"></i>`).join("")}</div><b>${value}</b></div>`;
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
      <span class="hire-fig" aria-hidden="true">${chibiSvg(x)}</span><b>${esc(x.name)}</b><small>${esc(rank)} · 연봉 ${x.salary}</small>
      ${stamp("합격!", "hire-stamp")}
    </div>`;
  pop.hidden = false;
  replay(pop, "show");
  sfx("hire");
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

  const cards = c.candidates[rank].map((x, n) => {
    const hired = c.hires[rank] === x.id;
    const newAnswer = (asked[x.id] ?? x.interviewed.length) < x.interviewed.length;
    return `
    <article class="candidate rk-${rankNo(rank)} ${hired ? "hired" : ""}" style="--n:${n}">
      <p class="id-strip"><span>${esc(rank)} 지원자</span><span class="id-no">No.${String(x.id).padStart(3, "0")}</span></p>
      <div class="cand-head">
        <span class="cand-fig" aria-hidden="true">${chibiSvg(x)}</span>
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
        <div class="stat hidden-stat"><span><i aria-hidden="true">🔒</i>정직</span><div class="bar locked"><i></i></div><b>???</b></div>
      </div>
      <div class="interview-questions" aria-label="${esc(x.name)}에게 할 질문">
        ${INTERVIEW_QUESTIONS.map(q => `<button class="secondary small q-btn" data-action="ask" data-id="${x.id}" data-question="${q.id}" aria-pressed="${x.interviewed.includes(q.id)}">${esc(q.label)}${x.interviewed.includes(q.id) ? " ✓" : ""}</button>`).join("")}
      </div>
      <div class="qa-list">
      ${x.interviewed.length ? x.interviewed.map((id, k) => `<div class="qa ${newAnswer && k === x.interviewed.length - 1 ? "fresh" : ""}">
        <p class="q">${esc(INTERVIEW_QUESTIONS.find(q => q.id === id).question)}</p>
        <p class="a">${esc(interviewAnswer(x, id))}</p>
      </div>`).join("") : '<p class="hint qa-empty">질문을 골라 답변을 들어 보세요. 면접 답변이 모두 진실일까요?</p>'}
      </div>
      <div class="cand-foot">
        <span class="salary"><span aria-hidden="true">💰</span> 연봉 <b>${x.salary}</b></span>
        <button class="${hired ? "secondary" : "primary"} small hire-btn" data-action="hire" data-id="${x.id}" ${!x.interviewed.length ? "disabled" : ""}>${hired ? "채용됨 ✓" : "채용"}</button>
      </div>
      ${hired ? stamp("합격!", `hire-stamp${fresh === x.id ? " fresh" : ""}`) : ""}
    </article>`;
  }).join("");

  seenAsked = { company: c, counts: Object.fromEntries(allCandidates(c).map(x => [x.id, x.interviewed.length])) };

  const cellsTotal = Math.max(budget, used);
  const last = index === HIRE_RANKS.length - 1;
  document.getElementById("interview").innerHTML = `
    <div class="tabs" role="list">${tabs}</div>
    <div class="budget-wrap">
      <p class="spent"><span aria-hidden="true">💰</span> 인건비 <b>${used} / ${budget}</b> <small>${esc(fundingOf(c).name)}</small></p>
      <div class="budget ${used / budget >= .9 ? "tight" : ""}" role="img" aria-label="인건비 ${used} / ${budget}">${Array.from({ length: cellsTotal }, (_, k) => `<i class="${k < used ? "on" : ""}"></i>`).join("")}</div>
    </div>
    <h3 class="rank-title rk-${rankNo(rank)}"><span class="rank rk-${rankNo(rank)}">${esc(rank)}</span> 면접 <small>지시를 ${info.chars}자까지 전달 ${cells(info.chars / 10)}</small></h3>
    <div class="candidates ${entering ? "enter" : ""}">${cards}</div>
    <div class="interview-nav">
      <button class="text-btn" data-action="vacant">이 자리는 비워 두기 (지시가 건너뜀)</button>
      <div class="row">
        ${index > 0 ? `<button class="secondary" data-action="prev">← ${esc(HIRE_RANKS[index - 1])}</button>` : ""}
        <button class="primary" data-action="${last ? "done" : "next"}">${last ? "면접 끝, 업무 시작" : `${esc(HIRE_RANKS[index + 1])} 면접 →`}</button>
      </div>
    </div>`;
  if (document.body.dataset.screen === "screen-interview") {
    officeSync(true);
    renderHud();
  }
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
    <h3><span>⚡ 사장 필살기</span> <small>${used ? "남은 횟수 0 / 1" : "한 판에 한 번"}</small></h3>
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
  if (!box) return;
  box.innerHTML = `<section class="clues" aria-label="보고와 비교할 추리 단서">
    <h3>📎 보고 옆에 놓인 단서</h3>
    <div class="clue-list">${cluesFor(round).map((text, k) => `<p class="clue" style="--i:${k}"><span class="clue-no" aria-hidden="true">증거 ${k + 1}</span>${esc(text)}</p>`).join("")}</div>
    <p class="hint">일부 상황만 담긴 단서입니다. 보고와 비교해 보세요. 성공 여부를 확정하는 증거는 아닙니다.</p>
    </section>${powerPanel("after")}
    ${round.power === "visit" ? `<section class="visit-result" aria-label="현장 출동 결과">
      <h3>🔎 사장님이 직접 확인한 현장</h3>
      <p>${esc(round.result.action)}</p><p>${esc(round.result.audit)}</p>
      <p class="visit-score"><b>성과 ${round.result.score}점 · ${round.result.score >= SUCCESS_LINE ? "잘 수행함" : "수행 실패"}</b></p>
      ${stamp("현장 확인", "visit-stamp")}
      <p class="hint">확인한 사실을 바탕으로 칭찬·추궁을 선택하세요.</p></section>` : ""}`;
  if (round.power === "visit") {
    sfx("stamp");
    const m = office.mates.get(0);
    if (m) { mateFx(m, "🔎", 1600); m.el.classList.add("hop"); setTimeout(() => m.el.classList.remove("hop"), 700); }
  }
}

let seenQuarter = null;
let seenPower = null;

// 새 분기가 시작될 때만 "1년차 2분기" 타이틀 카드 + WARNING/CHANCE 띠가 지나갑니다 (클릭을 막지 않음)
function quarterPop(c, ev) {
  if (seenQuarter && seenQuarter.company === c && seenQuarter.round === game.round) return false;
  seenQuarter = { company: c, round: game.round };
  const pop = document.getElementById("quarter-pop");
  if (!pop) return true;
  const chance = ev.type === "기회";
  const word = chance ? "CHANCE · 기회 · " : "WARNING · 위기 · ";
  pop.innerHTML = `<div class="qp-banner ${chance ? "chance" : "crisis"}" aria-hidden="true"><span>${(chance ? "✨ " : "⚠ ") + word.repeat(6)}</span></div>
    <div class="qp-card ${chance ? "chance" : "crisis"}">
      <small>LEVEL ${game.round + 1} / ${ROUNDS}</small>
      <b>${esc(quarterLabel(game.round))}</b>
      <span class="qp-type">${chance ? "✨ 기회" : "⚠ 위기"}</span>
      <p>${esc(ev.title)}</p>
    </div>`;
  pop.hidden = false;
  replay(pop, "show");
  sfx("whoosh");
  setTimeout(() => sfx("stamp"), 260);
  clearTimeout(quarterPop.timer);
  quarterPop.timer = setTimeout(() => { pop.hidden = true; }, reduceMotion() ? 900 : 2100);
  return true;
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
  const chance = ev.type === "기회";
  document.querySelectorAll("#room").forEach(el => el.removeAttribute("id")); // 지난 분기 단톡방 기록은 그대로, 이름표만 뗌
  document.getElementById("event-heading").innerHTML = `<span class="lv">LEVEL ${game.round + 1}<small> / ${ROUNDS}</small></span><span class="lv-name">${esc(quarterLabel(game.round))}</span>`;
  document.getElementById("profit-now").innerHTML = `<span class="hud-label">누적 수익 ${game.round ? money(total) : money(0, false)}</span>${profitChart(c)}`;
  const line = transmissionStaff(c);
  const quit = allCandidates(c).filter(x => x.quit).map(x => `<span class="quit-chip">📦 ${esc(x.rank)} ${esc(x.name)}</span>`);
  const chain = line.map(x => `<li class="rk-${rankNo(x.rank)}" title="${esc(x.rank)} ${esc(x.name)} · 충성심 ${x.loyalty}/10">${avatar(x)}<small>${rankInfo(x.rank).chars}</small></li>`).join("");
  document.getElementById("event-box").innerHTML = `
    <article class="mission ${chance ? "chance" : "crisis"}">
      <p class="mission-tag"><span class="alert">${chance ? "✨ CHANCE" : "⚠ WARNING"}</span><span>이번 분기 목표</span></p>
      <h3>${esc(ev.title)}</h3>
      <p class="mission-text">${esc(ev.text)}</p>
      <p class="goal-line"><span>🎯 성과 <b>${SUCCESS_LINE}점</b> 이상</span><span>💸 인건비 <b>${money(payroll(c) * COST_PER_SALARY, false)}</b></span></p>
    </article>
    ${activeStaff.length ? powerPanel("before") : ""}
    ${game.round === ROUNDS - 1 && activeStaff.length ? `<fieldset class="final-strategy">
      <legend>🏁 마지막 분기, 어떤 승부를 걸까요?</legend>
      <div class="strategy-grid">${FINAL_STRATEGIES.map(s => {
        const [icon, label] = splitIcon(s.name);
        return `<label class="strategy-option ${s.id} ${round.strategy === s.id ? "picked" : ""}">
        <input type="radio" name="final-strategy" data-strategy="${s.id}" ${round.strategy === s.id ? "checked" : ""}>
        <span class="st-ico" aria-hidden="true">${esc(icon)}</span>
        <span class="st-text"><b>${esc(label)}</b><small>${esc(s.text)}</small></span></label>`;
      }).join("")}</div>
      <p class="hint">두 전략 모두 인건비·불이익·필살기 비용은 별도입니다. 지시를 내리기 전에 하나를 골라 주세요. 신사업 매출 범위 0~1억 4,000만원 · 안전 운영 4,000~6,000만원</p>
    </fieldset>` : ""}
    <div class="composer">
      <label class="field order-field"><span class="composer-head">📣 사장님 지시 <span class="counter" data-for="order">${round.order.length} / ${ORDER_MAX}</span></span>
        <textarea id="order" maxlength="${ORDER_MAX}" rows="3" ${!activeStaff.length ? "disabled" : ""} placeholder="예: 오늘 안에 해결해. 고객에게는 솔직하게 사과하고, 원인은 내일 아침까지 보고해.">${esc(round.order)}</textarea>
      </label>
      ${activeStaff.length ? orderMeter(line) : ""}
      ${activeStaff.length ? `<div class="chain-row"><span class="hint">전달 순서</span><ol class="chain-mini">
        <li class="rk-0">${avatar(null)}<small>${ORDER_MAX}</small></li>${chain}</ol></div>` : ""}
    </div>
    ${quit.length ? `<p class="hint quit-list">퇴사: ${quit.join(" ")}</p>` : ""}
    ${!activeStaff.length ? `<p class="choice-result bad">직원이 모두 퇴사해 영업을 중단합니다. 남은 분기마다 매출·인건비는 0원이며, 임대료와 위약금으로 ${money(CLOSED_PENALTY, false)}의 손실이 발생합니다.</p>` : ""}`;
  const order = document.getElementById("order");
  if (order) {
    order.addEventListener("input", () => { paintOrderMeter(order.value.length); talk.slowUntil = Date.now() + 6000; talkTypingShow(""); });
    order.addEventListener("focus", () => { talk.slowUntil = Date.now() + 8000; });
  }
  // 고른 전략 카드 표시 (선택 저장은 main.js가 합니다)
  const picks = document.querySelectorAll("#event-box [data-strategy]");
  picks.forEach(input => input.addEventListener("change", () => {
    picks.forEach(x => x.closest(".strategy-option").classList.toggle("picked", x.checked));
  }));
  paintOrderMeter(round.order.length);
  const fresh = quarterPop(c, ev);
  if (document.body.dataset.screen === "screen-event" || fresh) {
    talkEnsure();
    officeSync(false);
  }
  if (fresh) {
    talkSystem(`📣 ${quarterLabel(game.round)} 시작 · ${chance ? "✨ 기회" : "⚠ 위기"}: ${ev.title}`);
    setTimeout(() => officeRush(chance ? "✨" : "❗"), 80);
  }
  // 회식을 쏘면 사무실이 들썩
  const powerKey = round.power ? `${game.round}:${round.power}` : null;
  if (powerKey && seenPower !== powerKey) {
    seenPower = powerKey;
    if (round.power === "dinner") {
      officeHearts(10);
      office.mates.forEach(m => { if (!m.leaving) { mateFx(m, "🍗", 1800); m.el.classList.add("hop"); setTimeout(() => m.el.classList.remove("hop"), 800); } });
      const x = ambientPerson();
      if (x) talkPost({ person: x, who: `${x.rank} ${x.name}`, text: pickOne(CHAT.dinner), amb: true });
    }
    if (round.power === "direct") {
      const x = line[0];
      const m = x && mateOf(x);
      if (m) mateFx(m, "☎️", 1800);
    }
  }
  renderHud();
}

// ===== 라운드 결과 =====

function roomHead(title, count) {
  return `<div class="room-head"><p class="room">${esc(title)}</p><span class="room-count" aria-label="대화 상대 ${count}명">👥 ${count}</span></div>`;
}

// 단톡방 안에 이번 분기 기록(#room)을 새로 엽니다. 지난 기록은 위에 그대로 남습니다.
function talkRoom(title, count) {
  document.querySelectorAll("#room").forEach(el => el.removeAttribute("id"));
  const host = talkFeed() || document.getElementById("result-box");
  host.insertAdjacentHTML("beforeend", `<div class="messenger playing" id="room">${roomHead(title, count)}</div>`);
  return document.getElementById("room");
}

function revealUI(on) {
  revealing = on;
  if (!on && office.el) { const cap = office.el.querySelector(".caption"); if (cap) cap.classList.remove("on"); }
  document.body.classList.toggle("revealing", on);
  const skip = document.getElementById("talk-skip");
  if (skip) skip.hidden = !on;
  if (talkIsSheet()) talkOpen(on);
  if (on) talkTypingShow("");
}

async function renderReports() {
  const c = game.company;
  const round = c.rounds[game.round];
  const r = round.result;
  resetSkip();
  document.getElementById("result-title").textContent = "사장님께 보고가 올라왔습니다";
  document.getElementById("result-lead").textContent = "직원들이 일을 마치고 보고했습니다. 정말 이렇게 잘 됐을까요?";
  const chain = round.chain.map(id => candidateById(c, id));
  const up = [...chain].reverse();
  document.getElementById("result-box").innerHTML = `
    <button type="button" class="report-wait" id="report-wait"><span class="rw-ico" aria-hidden="true">📈</span><b>단톡방에 보고가 올라오는 중…</b><small>탭하면 바로 보기</small></button>
    <div id="decision-tools"></div>`;
  document.getElementById("report-wait").onclick = skipReveal;
  talkEnsure();
  ambientStop();
  officeSync(false);
  if (talk.posted !== roundKey()) talkOrder(round.order);
  const room = talkRoom("📈 보고 라인", up.length + 1);
  room.onclick = skipReveal;
  revealUI(true);
  officeBusy();
  officeClearSay();
  await beat(320);
  await officePaper(round.order, chain);
  for (let k = 0; k < up.length; k++) {
    const isFinal = k === up.length - 1;
    const fl = rankNo(up[k].rank);
    await addBubble(room, `${up[k].rank} ${up[k].name}${isFinal ? " → 사장님께" : ""}`, r.up[k].say, isFinal ? "final" : "", up[k],
      () => officeSay(fl, r.up[k].say, { level: k, up: true, final: isFinal }));
  }
  room.classList.remove("playing");
  revealUI(false);
  document.getElementById("report-wait")?.remove();
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
  revealing = true;
  document.body.classList.add("in-suspense");
  officeBusy(true);
  if (dig) officeLens(); else officeClap();
  sfx("drum", SUSPENSE_DELAY);
  await beat(reduceMotion() ? 500 : SUSPENSE_DELAY);
  box.hidden = true;
  document.body.classList.remove("in-suspense");
}

async function renderTruth() {
  const c = game.company;
  const round = c.rounds[game.round];
  const r = round.result;
  const closed = round.choice === "closed";
  resetSkip();
  revealing = true;
  office.holdQuit = true; // 퇴사자는 진실 공개가 끝나고 직접 걸어 나갈 때까지 자리에 둡니다
  document.getElementById("decision-tools")?.remove();
  document.getElementById("report-wait")?.remove();
  const resultBox = document.getElementById("result-box");
  const staff = round.chain.map(id => candidateById(c, id)); // 이번 분기에 있던 직원 (퇴사자 포함)
  document.getElementById("result-title").textContent = closed ? "🚪 직원 부재로 영업을 중단했습니다" : round.choice === "dig" ? "🔍 파고들어 보니…" : "👏 칭찬했습니다. 그런데 진실은…";
  document.getElementById("result-lead").textContent = closed ? "직원이 없어 이번 이벤트를 수행하지 못했습니다. 4분기까지 결산은 이어집니다." : "🤥 표시는 일부러 말을 바꾸거나 거짓말한 직원입니다.";
  talkEnsure();
  ambientStop();
  officeSync(false);
  if (!closed) await suspense(round.choice);

  let room = document.getElementById("room");
  if (closed) {
    if (room) room.hidden = true;
    talkSystem(`🚪 ${quarterLabel(game.round)} · 직원이 아무도 없어 단톡방이 조용합니다`);
  } else {
    if (!room || !room.closest("#talk")) room = talkRoom("📉 실제 지시 라인", staff.length + 1);
    else room.insertAdjacentHTML("beforeend", roomHead("📉 진실 공개 · 실제 지시 라인", staff.length + 1));
    room.classList.add("truth", "playing");
    room.classList.remove("skipped");
    room.onclick = skipReveal;
    revealUI(true);
    officeBusy(true);
    officeClearSay();
    officeSpot2(0);
    await addBubble(room, `사장 ${c.player} (나)`, round.order, "ceo", null, () => officeSay(0, round.order, {}));
    for (let k = 0; k < staff.length; k++) {
      const fl = rankNo(staff[k].rank);
      const lie = !!r.down[k].lie;
      officeSpot2(fl);
      await addBubble(room, `${staff[k].rank} ${staff[k].name}`, r.down[k].say, lie ? "lie" : "", staff[k], () => {
        officeSay(fl, r.down[k].say, { lie });
        if (lie) officeLie(fl, "🤥 거짓말");
      });
    }
    officeSpot2(null);
    room.classList.remove("playing");
    revealUI(false);
    revealing = true;
  }

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
  resultBox.appendChild(box);
  if (upLies.length) {
    upLies.forEach(x => officeLie(rankNo(x.rank), "🤥 거짓 보고"));
    sfx("lie");
  }
  if (finalLie) sfx("stamp");
  if (!skipping && !reduceMotion()) box.scrollIntoView({ behavior: "smooth", block: "start" });
  await beat(closed ? 0 : 500);

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
  resultBox.appendChild(verdict);
  sfx("stamp");
  if (!skipping && !reduceMotion()) setTimeout(() => verdict.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  if (!closed) officeMood(round.success ? "cheer" : "slump");

  await countUp(verdict.querySelector(".score-count"), r.score, 600, v => String(Math.round(v)));
  const profitEl = verdict.querySelector(".profit-count");
  await countUp(profitEl, round.profit, 900);
  if (round.profit < 0) { replay(profitEl, "drop"); sfx("fail"); }
  else sfx("coin");
  if (round.profit <= BIG_LOSS) shakeScreen();
  if (round.profit >= BIG_WIN) burst(26);
  renderHud();

  // 퇴사자는 상자를 들고 걸어 나갑니다
  for (const label of round.quits) {
    const x = staff.find(s => `${s.rank} ${s.name}` === label);
    if (x) await officeQuit(rankNo(x.rank));
  }
  revealing = false;
  office.holdQuit = false;
  officeSync(false);
  talkEnsure();
  officeIdle();
  if (!closed) {
    talk.afterLeft = 2;
    ambientStart("after");
  }
}

function allHonestNote(r) {
  return r.down.some(x => x.lie) || r.up.some(x => x.lie) ? "" : `<p class="tag honest-note">이번엔 아무도 거짓말하지 않았습니다 😇</p>`;
}

// ===== 최종 결산 =====

function confetti() {
  return `<div class="confetti" aria-hidden="true">${Array.from({ length: 26 }, (_, k) =>
    `<i style="--x:${(k * 37) % 100}%;--d:${(k % 9) * 0.09}s;--r:${(k * 53) % 360}deg;--c:var(--rank-${(k % 6) + 1})"></i>`).join("")}</div>`;
}

// 화면 전체에 색종이 (연출 레이어, 클릭을 막지 않음)
function burst(n) {
  const fx = document.getElementById("fx");
  if (!fx || reduceMotion()) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = confetti();
  const conf = wrap.firstElementChild;
  conf.classList.add("burst");
  conf.querySelectorAll("i").forEach((i, k) => { if (k >= n) i.remove(); });
  fx.appendChild(conf);
  setTimeout(() => conf.remove(), 2600);
}

let finalToken = 0;

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
        <p class="placed">${medal(placed.rank)} ${SHARED_INDUSTRY ? "같은 업종" : "전체"} <b>${placed.rank}위</b> <span>/ ${placed.total}명</span></p>
        ${placed.rank <= 3 ? confetti() : ""}
      </div>`
    : `<p class="placed practice">연습 모드가 섞여서 순위에 기록되지 않았어요</p>`;

  const rows = c.rounds.map((round, i) => `
    <li style="--i:${i}"><span class="etype ${c.events[i].type === "기회" ? "chance" : "crisis"}">${quarterLabel(i)}</span>
      <span class="ename">${esc(c.events[i].title)} ${round.choice === "closed" ? "🚪" : round.choice === "dig" ? "🔍" : "👏"}${round.success ? "✅" : "❌"}<small>${esc(round.result.news)}</small></span>
      <b class="${round.profit < 0 ? "neg" : "pos"}">${money(round.profit)}</b></li>`).join("");

  finalToken++;
  document.getElementById("final").innerHTML = `
    <h2 class="sr-only">1년 결산</h2>
    ${banner}
    <div class="front">
      <article class="news win front-page ${profit < 0 ? "loss" : "gain"}">
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
            <p class="stars" aria-label="별 ${finalStars(profit)}개">${[1, 2, 3].map(k => `<span class="star ${k <= finalStars(profit) ? "on" : ""}" style="--k:${k}">★</span>`).join("")}</p>
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
          <span class="wanted-fig" aria-hidden="true">${chibiSvg(topLiar)}</span>
          <p class="wanted-name">🤥 <b>${esc(topLiar.rank)} ${esc(topLiar.name)}</b> <small>(${lies.get(topLiar.id)}번, 정직도 ${topLiar.honesty})</small></p>
        </div>` : ""}
        ${honest.length ? `<p class="honest-award">😇 <b>끝까지 정직했던 직원</b> ${honest.map(x => `${esc(x.name)} <small>(정직도 ${x.honesty})</small>`).join(", ")}</p>` : ""}
        <p class="field-label">직원들의 진짜 정직도와 마지막 충성심</p>
        <ul class="reveal-list">${everyone.map(x => `<li class="${x.quit ? "left" : ""}">${avatar(x)}<span class="rank rk-${rankNo(x.rank)}">${esc(x.rank)}</span><span class="rv-name">${esc(x.name)}${x.quit ? " 🚪" : ""}</span>
          ${statBar("정직", x.honesty, "honest")} ${hearts(x.loyalty)}</li>`).join("")}</ul>
      </div>
    </div>`;
  finalShow(c, profit, placed, finalToken);
}

function finalStars(profit) {
  return profit >= 8000 ? 3 : profit >= 3000 ? 2 : profit >= 0 ? 1 : 0;
}

// '결산 발표' 연출: 두구두구 → 신문이 돌며 들어옴 → 숫자 → 별 → 순위 쾅 (탭하면 건너뜀)
async function finalShow(c, profit, placed, token) {
  const root = document.getElementById("final");
  const live = () => token === finalToken && game.company === c && (document.body.dataset.screen || "screen-final") === "screen-final";
  resetSkip();
  revealing = true;
  root.classList.add("pre");
  await beat(0);
  if (!live()) return;
  const kind = !staffOf(c).length ? "dark" : profit >= 0 ? "party" : "pack";
  if (document.body.classList.contains("with-office")) { officeSync(false); officeEpilogue(kind); }
  const pop = document.getElementById("final-pop");
  if (pop && !reduceMotion()) {
    pop.innerHTML = `<div class="fp-card"><small>${esc(c.name)} · 1년 결산</small><b>결산 발표</b><p class="drum" aria-hidden="true">두구두구두구</p><span>탭하면 바로 보기</span></div>`;
    pop.hidden = false;
    pop.onclick = skipReveal;
    replay(pop, "show");
    sfx("drum", 1300);
    await beat(1350);
    pop.hidden = true;
  }
  if (!live()) { revealing = false; root.classList.remove("pre"); return; }
  root.classList.remove("pre");
  root.classList.add("go");
  sfx("whoosh");
  await beat(650);
  sfx("stamp");
  await countUp(root.querySelector(".total-count"), profit, 1400);
  if (!live()) return;
  root.classList.add("stars-on");
  if (profit >= 0) { sfx("fanfare"); burst(24); } else sfx("fail");
  await beat(500);
  root.classList.add("rank-on");
  if (placed) sfx("stamp");
  if (placed && placed.rank <= 3) setTimeout(() => burst(26), 200);
  revealing = false;
  renderHud();
}

// ===== 순위표 =====

function renderBoard(highlightAt) {
  const list = sortedBoard();
  const season = getSeason();
  document.getElementById("board-lead").textContent = list.length
    ? `${SHARED_INDUSTRY ? "같은 업종의 " : ""}사장님 ${list.length}명이 겨뤘습니다. 1년 누적 수익 순위예요. (이 노트북에 저장 · 다른 기기와 자동 합산되지 않음)`
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
  const podium = list.slice(0, 3);
  document.getElementById("board").innerHTML = list.length ? `
    ${podium.length >= 2 ? `<div class="podium" aria-hidden="true">${[1, 0, 2].filter(k => podium[k]).map(k => `
      <div class="pod pod-${k + 1} ${podium[k].at === highlightAt ? "me" : ""}"><span class="pod-medal">${medal(k + 1)}</span><b>${esc(podium[k].player)}</b><small>${money(podium[k].profit)}</small><span class="pod-block">${k + 1}</span></div>`).join("")}</div>` : ""}
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

// 단톡방 말풍선. person은 직급 색 프로필용 ({rank, name}), 사장(ceo)은 없음.
// onShow: 말풍선이 뜨는 순간 사무실 무대도 같이 움직이게 (건너뛰어도 꼭 불림)
async function addBubble(room, who, text, kind, person, onShow) {
  const fast = skipping || reduceMotion();
  if (!fast && kind !== "ceo") {
    const typing = document.createElement("div");
    typing.className = "msg typing";
    typing.innerHTML = `${avatar(person)}<div class="msg-body"><div class="who">${esc(who)} <span class="typing-label">입력 중…</span></div>
      <div class="line"><div class="bubble"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></div></div></div>`;
    room.appendChild(typing);
    talkScroll(true);
    if (person) officeTyping(person, true);
    await beat(TYPING_DELAY);
    typing.remove();
  }
  const div = msgNode({ person, who, text, kind });
  room.appendChild(div);
  talkNew(div);
  if (onShow) onShow();
  if (fast) return;
  sfx(kind === "lie" ? "lie" : "pop");
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

// ===== 화면 연결 (보여 주기 전용: 효과음, 타이틀, 단톡방 열고 닫기, 크기 변화) =====

function setupUI() {
  renderSoundButton();
  // 첫 탭에서 소리 켜기 (브라우저 정책)
  document.addEventListener("pointerdown", () => { if (sound.on) audio(); }, { capture: true, passive: true });
  document.addEventListener("click", e => {
    const b = e.target.closest("button, .fund, .strategy-option");
    if (!b || b.disabled || b.id === "btn-sound") return;
    sfx(b.classList.contains("primary") || b.classList.contains("choice-btn") ? "tapBig" : "tap");
  }, true);
  const soundBtn = document.getElementById("btn-sound");
  if (soundBtn) soundBtn.addEventListener("click", () => {
    sound.on = !sound.on;
    try { localStorage.setItem("kcb_sound", sound.on ? "on" : "off"); } catch {}
    if (sound.on) { audio(); sfx("tapBig"); }
    renderSoundButton();
  });
  const start = document.getElementById("btn-start");
  if (start) start.addEventListener("click", () => {
    const screen = document.getElementById("screen-found");
    screen.classList.remove("intro");
    document.body.classList.remove("at-title");
    window.scrollTo(0, 0);
    const first = screen.querySelector('#found-box [data-field="player"]:not([disabled])') || screen.querySelector("#found-box [data-action='roll']");
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 50);
  });
  const toggle = document.getElementById("talk-toggle");
  if (toggle) toggle.addEventListener("click", () => {
    if (talkIsSheet()) talkOpen(!talk.open);
    else { talk.unread = 0; talkBadge(); talkScroll(true); }
  });
  const skip = document.getElementById("talk-skip");
  if (skip) skip.addEventListener("click", skipReveal);
  const feed = talkFeed();
  if (feed) feed.addEventListener("scroll", () => { if (talkNearBottom() && talk.unread && !talkIsSheet()) { talk.unread = 0; talkBadge(); } }, { passive: true });
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (document.body.classList.contains("with-office")) officeSync(false);
      if (!talkIsSheet()) talkOpen(false);
    }, 150);
  });
  document.addEventListener("visibilitychange", () => {
    document.body.classList.toggle("tab-hidden", document.hidden);
  });
}

setupUI();
