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
const FLOOR_RANKS = ["사장", ...HIRE_RANKS]; // 사무실 층: 0 = 사장실, 1 = 임원 … 6 = 사원

const OFFICE_SCREENS = ["screen-interview", "screen-event", "screen-result", "screen-final"];
const TALK_SCREENS = ["screen-event", "screen-result"];

function showScreen(id) {
  const screen = document.getElementById(id);
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  screen.classList.add("active");
  document.body.dataset.screen = id;
  if (id !== "screen-ai") stopAIWait();
  // 순위표·설정에 다녀와서 아직 기다리는 중이면 진행 막대·시계·속마음을 다시 움직입니다
  else if (screen.dataset.state === "busy" && !aiTimer) startAIWait();
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
  document.body.classList.remove("writing", "choosing");
  stageFor(id);
  renderHud();
  window.scrollTo(0, 0);
  screen.scrollTop = 0; // 데스크톱에서는 화면 패널이 따로 스크롤됩니다
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
    else if (finalKind && finalShownFor === game.company && !document.getElementById("final").classList.contains("pre")) officeEpilogue(finalKind);
    if (id !== "screen-interview") officeFocus(null);
    else if (lastInterview !== null) officeFocus(Number(lastInterview) + 1); // 면접 화면에 들어오자마자 그 책상에 "면접 중"
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
  const minStaff = minStaffRule();
  // 결산 화면: '결산 발표'(숫자 올라가기·별)가 끝나기 전에는 HUD가 총액을 먼저 알려 주지 않습니다
  const finalEl = document.getElementById("final");
  const hideTotal = id === "screen-final" && !!finalEl && !finalEl.classList.contains("stars-on");
  let items = [];
  if (id === "screen-interview") {
    items = [
      { ico: "👥", label: `채용 · 최소 ${minStaff}명`, value: `${hired} / ${HIRE_RANKS.length}`, tone: hired < minStaff ? "neg" : "pos" },
      { ico: "💰", label: "분기 급여", value: money(payroll(c) * COST_PER_SALARY, false), tone: payroll(c) / budgetOf(c) >= .9 ? "neg" : "" },
      { ico: "🏦", label: "통장", value: money(cashBalance(c), false), key: "bank" }
    ];
  } else if (inQuarter || id === "screen-final") {
    const total = totalProfit(c);
    const balance = cashBalance(c);
    const avg = staff.length ? Math.round(staff.reduce((s, x) => s + x.loyalty, 0) / staff.length) : 0;
    items = [
      { ico: "🏦", label: "통장 잔액", value: money(balance, false), tone: balance < 0 ? "neg" : "", key: "bank" },
      hideTotal
        ? { ico: "💰", label: "순이익", value: "???", key: "money", hidden: true }
        : { ico: "💰", label: "순이익", value: money(total, total !== 0), tone: total < 0 ? "neg" : total > 0 ? "pos" : "", money: total, key: "money" },
      { ico: "👥", label: "직원", value: `${staff.length}명`, key: "staff" },
      { ico: "♥", label: "충성심", value: staff.length ? `${avg}/10` : "—", tone: avg && avg <= 3 ? "neg" : "", key: "heart" }
    ];
  }
  res.innerHTML = items.map(it => `<span class="res ${it.key || ""}"><i aria-hidden="true">${it.ico}</i><span class="res-text"><small>${esc(it.label)}</small><b class="${it.tone || ""}">${esc(it.value)}</b></span></span>`).join("");
  const moneyItem = items.find(it => it.key === "money" && !it.hidden);
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

// 최소 채용 인원 (규칙은 game.js의 MIN_STAFF. 없으면 4명)
function minStaffRule() {
  return typeof MIN_STAFF === "number" ? MIN_STAFF : 4;
}

// 연출 중 오류가 나도 게임 진행(버튼이 다시 나오는 것)은 막지 않게
async function safely(fn) {
  try { await fn(); } catch (e) { console.warn("연출 오류 (게임은 계속됩니다)", e); }
}

function guard(fn) {
  try { return fn(); } catch (e) { console.warn("연출 오류 (게임은 계속됩니다)", e); }
}

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

// 빠르게 보기: 한 번 건너뛰었거나 첫 분기 공개를 끝까지 본 사장님은, 같은 판의 다음 공개부터 절반 속도.
// (순서·내용은 그대로, 기다리는 시간만 짧게. 새 판을 시작하면 다시 보통 속도)
let quickFor = null;

function quick() {
  return !!game.company && quickFor === game.company;
}

function pace(ms) {
  return quick() ? Math.round(ms * .5) : ms;
}

function skipReveal() {
  // 두구두구(suspense) 중에는 무시: 파고들기/칭찬하기를 두 번 누른 손가락이 진실 공개 전체를 건너뛰지 않게
  if (!revealing || document.body.classList.contains("in-suspense")) return;
  skipping = true;
  quickFor = game.company;
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

// 원고지 글자칸 미터 (1칸 = 10자). cls에 rk-N을 주면 그 직급 색으로 채운 칸
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
// PR #12 이후 화면마다 돈 그래프는 하나만: 분기 결과·결산은 financeChart(통장 잔액·수입·지출)를 씁니다.
// 이 함수는 다른 담당이 부를 수 있어 그대로 남겨 둡니다.
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
  btn.setAttribute("aria-label", sound.on ? "소리 끄기 (효과음·배경음)" : "소리 켜기 (효과음·배경음)");
  btn.innerHTML = `<span aria-hidden="true">${sound.on ? "🔊" : "🔇"}</span>`;
}

// ===== 배경음 (music/ 폴더의 CC0 곡, 출처는 music/CREDITS.md) =====
// 첫 탭 이후에만 재생되고(브라우저 정책), 🔊 버튼이 효과음과 함께 켜고 끕니다. 탭을 숨기면 멈춥니다.
// office = 평소 사무실, reveal = 보고가 올라오고 진실이 드러나는 동안. 소리 크기는 WebAudio로 줄입니다(아이폰은 audio.volume이 안 먹음).
const BGM_TRACKS = { office: "music/office.mp3", reveal: "music/reveal.mp3" };
const BGM_VOLUME = { office: 0.2, reveal: 0.24 };
const bgm = { want: "office", nodes: {} };

function bgmNode(name) {
  if (bgm.nodes[name]) return bgm.nodes[name];
  if (!sound.ctx) return null;
  const el = new Audio(BGM_TRACKS[name]);
  el.loop = true;
  el.preload = "auto";
  let gain = null;
  // 파일로 직접 연 index.html(file://)에서는 WebAudio로 연결하면 소리가 안 나서 audio 볼륨만 씁니다
  if (location.protocol !== "file:") {
    try {
      gain = sound.ctx.createGain();
      gain.gain.value = 0;
      sound.ctx.createMediaElementSource(el).connect(gain).connect(sound.ctx.destination);
    } catch { gain = null; }
  }
  if (!gain) el.volume = 0;
  return (bgm.nodes[name] = { el, gain, stop: 0 });
}

function bgmLevel(node, to, sec) {
  if (!node.gain) { node.el.volume = to; return; }
  const g = node.gain.gain;
  const t = sound.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(to, t + sec);
}

function bgmSync() {
  const on = sound.on && !!sound.ctx && !document.hidden;
  for (const name of Object.keys(BGM_TRACKS)) {
    const want = on && name === bgm.want;
    if (!want && !bgm.nodes[name]) continue;
    const node = bgmNode(name);
    if (!node) continue;
    clearTimeout(node.stop);
    if (want) {
      if (node.el.paused) node.el.play().catch(() => {});
      bgmLevel(node, BGM_VOLUME[name], 0.8);
    } else {
      bgmLevel(node, 0, 0.6);
      node.stop = setTimeout(() => node.el.pause(), 700);
    }
  }
}

function bgmScene(name) {
  if (bgm.want === name || !BGM_TRACKS[name]) return;
  bgm.want = name;
  bgmSync();
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
      <path class="c-sweat" d="M11 8.6c1.7 2.5 2.5 4 2.5 5.1a2.5 2.5 0 0 1-5 0c0-1.1.8-2.6 2.5-5.1z"/>
    </g>
  </svg>`;
}

// ===== 사무실 평면도: 한 층을 위에서 비스듬히 내려다본 3/4 시점 =====
// 좌표는 평면도 단위. 바닥의 한 점 (x, y)에 놓인 물건은 y가 클수록(입구 쪽일수록) 앞에 그려집니다.
// 결재 라인이 그대로 공간이 됩니다: 유리벽 사장실(안쪽 구석) → 임원 → 부장 → 팀 책상 → 입구.
// 책상이 클수록, 의자 등받이가 높을수록 높은 직급입니다. 직급 색은 이름표·옷 같은 작은 표시에만 씁니다.

const DESK_D = 26;   // 책상 윗면 깊이
const DESK_H = 18;   // 책상 앞판 높이
const MON_H = 16;    // 모니터가 책상 위로 올라오는 높이
const DESK_KIND = ["ceo", "exec", "boss", "team", "team", "team", "junior"];
const CHAIR_SIZE = { ceo: [56, 52], exec: [46, 42], boss: [42, 34], team: [36, 26], junior: [28, 10] };

const PLANS = {
  // 데스크톱·태블릿: 세로로 긴 사무실 (뒤 = 위쪽 벽, 입구 = 아래)
  tall: {
    W: 600, H: 780, mate: 36,
    desks: [
      { x: 122, y: 206, w: 150 }, { x: 330, y: 180, w: 112 }, { x: 300, y: 354, w: 124 },
      { x: 190, y: 476, w: 104 }, { x: 410, y: 476, w: 100 }, { x: 190, y: 606, w: 94 }, { x: 410, y: 606, w: 86 }
    ],
    deskNode: ["K0", "S1", "S2", "S3", "S4", "S5", "S6"],
    nodes: {
      K0: [219, 176], K1: [168, 110], S1: [408, 150], S2: [386, 324], S3: [264, 446], S4: [338, 446], S5: [260, 576], S6: [344, 576],
      T1: [128, 284], T2: [219, 284], T3: [300, 284], T4: [386, 284], T5: [408, 284], T6: [458, 284], T7: [506, 284],
      M1: [128, 398], M3: [300, 398], M7: [506, 398], A3: [300, 446],
      B1: [128, 522], B3: [300, 522], B7: [506, 522], C3: [300, 576],
      D1: [128, 664], D3: [300, 664], D7: [506, 664], E3: [300, 752], O3: [300, 840],
      W1: [458, 222], W2: [458, 112]
    },
    edges: "K0-K1 K0-T2 S1-T5 S2-T4 S3-A3 S4-A3 S5-C3 S6-C3 T1-T2 T2-T3 T3-T4 T4-T5 T5-T6 T6-T7 T6-W1 W1-W2 T1-M1 M1-B1 B1-D1 T3-M3 M3-A3 A3-B3 B3-C3 C3-D3 D3-E3 E3-O3 T7-M7 M7-B7 B7-D7 M1-M3 M3-M7 B1-B3 B3-B7 D1-D3 D3-D7",
    spots: {
      coffee: { x: 134, y: 412, node: "M1", left: true }, water: { x: 84, y: 534, node: "B1", left: true },
      printer: { x: 506, y: 414, node: "M7" }, cabinet: { x: 506, y: 544, node: "B7" },
      board: { x: 500, y: 112, node: "W2" }, window: { x: 168, y: 110, node: "K1", left: true },
      sofa: { x: 140, y: 700, node: "D1", left: true }, door: { x: 300, y: 752, node: "E3" }, out: { x: 300, y: 840, node: "O3" }
    },
    items: [
      { t: "glass", y: 262, x1: 8, x2: 236, gap: [172, 230], sign: "사장실" },
      { t: "glass", y: 246, x1: 424, x2: 592, gap: [432, 484], sign: "회의실" },
      { t: "table", x: 532, y: 186, w: 96 },
      { t: "shelf", x: 36, y: 112 }, { t: "plant", x: 214, y: 100 },
      { t: "counter", x: 62, y: 412, w: 92 }, { t: "cooler", x: 44, y: 534 },
      { t: "printer", x: 556, y: 414 }, { t: "cabinet", x: 568, y: 548 },
      { t: "plant", x: 28, y: 304 }, { t: "plant", x: 574, y: 312 }, { t: "plant", x: 568, y: 704 },
      { t: "sofa", x: 70, y: 726, w: 104 }, { t: "door", x1: 262, x2: 338, y: 774 }
    ],
    bg: `<rect class="pl-wall" x="0" y="0" width="600" height="64"/>
      <rect class="pl-floor" x="0" y="64" width="600" height="716"/>
      <path class="pl-plank" d="${Array.from({ length: 23 }, (_, k) => `M8 ${94 + k * 30}H592`).join("")}"/>
      <rect class="pl-carpet" x="8" y="64" width="228" height="198"/>
      <rect class="pl-tile" x="424" y="64" width="168" height="182"/>
      <rect class="pl-runner" x="14" y="272" width="572" height="24" rx="4"/>
      <rect class="pl-runner" x="278" y="296" width="44" height="474"/>
      <rect class="pl-mat" x="268" y="742" width="64" height="26" rx="5"/>
      <rect class="pl-base" x="0" y="58" width="600" height="6"/>
      <g class="pl-win"><rect x="70" y="12" width="96" height="38" rx="3"/><rect x="256" y="12" width="60" height="38" rx="3"/><rect x="332" y="12" width="60" height="38" rx="3"/></g>
      <path class="pl-mullion" d="M118 12v38M286 12v38M362 12v38M70 31h96M256 31h60M332 31h60"/>
      <rect class="pl-board" x="472" y="12" width="104" height="38" rx="3"/><path class="pl-scribble" d="M482 24h40M482 32q10-6 20 0t20 0M530 22l12 18M550 26h16"/>
      <circle class="pl-clock" cx="408" cy="30" r="9"/><path class="pl-hand" d="M408 30v-6M408 30h4"/>
      <rect class="pl-side" x="0" y="0" width="8" height="780"/><rect class="pl-side" x="592" y="0" width="8" height="780"/>
      <rect class="pl-glass-v" x="233" y="28" width="6" height="234"/><rect class="pl-wall-v" x="421" y="28" width="6" height="218"/>
      <rect class="pl-low" x="8" y="768" width="254" height="10"/><rect class="pl-low" x="338" y="768" width="254" height="10"/>`
  },
  // 휴대폰: 가로로 긴 축소 지도 (화면 폭에 딱 맞게, 소품을 줄임)
  wide: {
    W: 800, H: 360, mate: 52,
    desks: [
      { x: 100, y: 172, w: 120 }, { x: 292, y: 150, w: 96 }, { x: 440, y: 150, w: 100 },
      { x: 236, y: 342, w: 92 }, { x: 384, y: 342, w: 88 }, { x: 530, y: 342, w: 84 }, { x: 670, y: 342, w: 76 }
    ],
    deskNode: ["K0", "S1", "S2", "G3", "G5", "G7", "G9"],
    nodes: {
      K0: [182, 138], S1: [362, 118], S2: [512, 118],
      G0: [76, 216], G1: [120, 216], G2: [182, 216], G3: [236, 216], G4: [362, 216], G5: [384, 216], G6: [512, 216],
      G7: [530, 216], G8: [636, 216], G9: [670, 216], G10: [736, 216], W1: [636, 136], E0: [120, 344], O0: [120, 400]
    },
    edges: "K0-G2 S1-G4 S2-G6 G0-G1 G1-G2 G2-G3 G3-G4 G4-G5 G5-G6 G6-G7 G7-G8 G8-G9 G9-G10 G8-W1 G1-E0 E0-O0",
    spots: {
      printer: { x: 76, y: 228, node: "G0", left: true }, coffee: { x: 736, y: 228, node: "G10" },
      board: { x: 660, y: 120, node: "W1" }, door: { x: 120, y: 344, node: "E0" }, out: { x: 120, y: 400, node: "O0" }
    },
    items: [
      { t: "glass", y: 204, x1: 6, x2: 206, gap: [150, 204], sign: "사장실" },
      { t: "glass", y: 186, x1: 600, x2: 794, gap: [614, 662], sign: "" },
      { t: "table", x: 716, y: 142, w: 92 }, { t: "plant", x: 28, y: 100 }, { t: "plant", x: 566, y: 104 },
      { t: "printer", x: 34, y: 240 }, { t: "coffee", x: 774, y: 240 }, { t: "cooler", x: 772, y: 336 },
      { t: "door", x1: 90, x2: 150, y: 354 }
    ],
    bg: `<rect class="pl-wall" x="0" y="0" width="800" height="46"/>
      <rect class="pl-floor" x="0" y="46" width="800" height="314"/>
      <path class="pl-plank" d="${Array.from({ length: 10 }, (_, k) => `M6 ${74 + k * 30}H794`).join("")}"/>
      <rect class="pl-carpet" x="6" y="46" width="200" height="158"/>
      <rect class="pl-tile" x="600" y="46" width="194" height="140"/>
      <rect class="pl-runner" x="14" y="204" width="772" height="24" rx="4"/>
      <rect class="pl-runner" x="106" y="228" width="28" height="122"/>
      <rect class="pl-base" x="0" y="40" width="800" height="6"/>
      <g class="pl-win"><rect x="40" y="8" width="96" height="28" rx="3"/><rect x="250" y="8" width="84" height="28" rx="3"/><rect x="398" y="8" width="84" height="28" rx="3"/></g>
      <path class="pl-mullion" d="M88 8v28M292 8v28M440 8v28"/>
      <rect class="pl-board" x="650" y="8" width="110" height="28" rx="3"/><path class="pl-scribble" d="M662 18h40M662 26q10-6 20 0t20 0M714 16l12 14"/>
      <circle class="pl-clock" cx="540" cy="22" r="8"/><path class="pl-hand" d="M540 22v-5M540 22h4"/>
      <rect class="pl-side" x="0" y="0" width="6" height="360"/><rect class="pl-side" x="794" y="0" width="6" height="360"/>
      <rect class="pl-glass-v" x="203" y="12" width="6" height="192"/><rect class="pl-wall-v" x="597" y="12" width="6" height="174"/>
      <rect class="pl-low" x="6" y="350" width="84" height="10"/><rect class="pl-low" x="150" y="350" width="644" height="10"/>`
  }
};

// 타이틀 데모용 작은 사무실 (사장 → 부장 → 대리 → 사원)
const DEMO_PLAN = {
  W: 520, H: 340, mate: 44,
  desks: [{ x: 96, y: 152, w: 112 }, { x: 340, y: 142, w: 100 }, { x: 190, y: 320, w: 90 }, { x: 404, y: 320, w: 82 }],
  kinds: ["ceo", "boss", "team", "junior"],
  items: [{ t: "glass", y: 196, x1: 6, x2: 182, gap: [128, 176], sign: "" }, { t: "plant", x: 496, y: 160 }, { t: "cooler", x: 34, y: 312 }, { t: "plant", x: 496, y: 330 }],
  bg: `<rect class="pl-wall" x="0" y="0" width="520" height="42"/>
    <rect class="pl-floor" x="0" y="42" width="520" height="298"/>
    <path class="pl-plank" d="${Array.from({ length: 10 }, (_, k) => `M6 ${70 + k * 30}H514`).join("")}"/>
    <rect class="pl-carpet" x="6" y="42" width="176" height="154"/>
    <rect class="pl-runner" x="12" y="206" width="496" height="20" rx="4"/>
    <rect class="pl-base" x="0" y="36" width="520" height="6"/>
    <g class="pl-win"><rect x="40" y="8" width="80" height="26" rx="3"/><rect x="250" y="8" width="70" height="26" rx="3"/><rect x="352" y="8" width="70" height="26" rx="3"/></g>
    <path class="pl-mullion" d="M80 8v26M285 8v26M387 8v26"/>
    <rect class="pl-side" x="0" y="0" width="6" height="340"/><rect class="pl-side" x="514" y="0" width="6" height="340"/>
    <rect class="pl-glass-v" x="179" y="10" width="6" height="186"/>`
};

function planSeat(P, i) {
  const d = P.desks[i];
  return { x: d.x, y: d.y - DESK_H - DESK_D + 10 };
}

function deskSvg(kind, w) {
  const t = MON_H + 4, H = t + DESK_D + DESK_H, mx = Math.round(w - 22);
  const extra = {
    ceo: `<rect class="d-gold" x="12" y="${t + 6}" width="26" height="9" rx="2"/><rect class="d-paper" x="44" y="${t + 5}" width="16" height="12" rx="1.5"/>`,
    exec: `<rect class="d-pot" x="10" y="${t + 3}" width="13" height="11" rx="2"/><circle class="d-leaf" cx="16.5" cy="${t - 2}" r="8"/>`,
    boss: `<rect class="d-paper" x="9" y="${t + 6}" width="18" height="13" rx="1.5"/><rect class="d-paper" x="12" y="${t + 2}" width="18" height="13" rx="1.5"/>`,
    team: `<rect class="d-mug" x="9" y="${t + 6}" width="9" height="10" rx="2"/>`,
    junior: `<rect class="d-paper" x="5" y="${t - 14}" width="18" height="32" rx="1.5"/><path class="d-line" d="M8 ${t - 8}h12M8 ${t - 2}h12M8 ${t + 4}h12M8 ${t + 10}h12"/>`
  }[kind] || "";
  return `<svg class="desk-svg" viewBox="0 0 ${w} ${H}" aria-hidden="true" focusable="false">
    <ellipse class="d-glow" cx="${mx - 8}" cy="${t - 4}" rx="18" ry="11"/>
    <rect class="d-top" x="1" y="${t}" width="${w - 2}" height="${DESK_D}" rx="4"/>
    <rect class="d-front" x="1" y="${t + DESK_D - 2}" width="${w - 2}" height="${DESK_H + 1}" rx="3"/>
    <rect class="d-kb" x="${Math.round(w / 2 - 14)}" y="${t + 8}" width="28" height="8" rx="2"/>
    <rect class="d-mon" x="${mx - 14}" y="${t - 14}" width="28" height="19" rx="3"/>
    <rect class="d-stand" x="${mx - 3}" y="${t + 5}" width="6" height="5"/>
    ${extra}
  </svg>`;
}

function chairSvg(kind) {
  const [w, h] = CHAIR_SIZE[kind];
  return `<svg class="chair-svg" viewBox="0 0 ${w} ${h + 16}" aria-hidden="true" focusable="false">
    ${kind === "junior" ? "" : `<rect class="ch-back" x="2" y="2" width="${w - 4}" height="${h}" rx="${Math.min(12, Math.round(w / 3))}"/>`}
    <rect class="ch-seat" x="3" y="${h - 2}" width="${w - 6}" height="10" rx="4"/>
    <path class="ch-leg" d="M${w / 2} ${h + 8}v5M${w / 2 - 9} ${h + 14}h18"/>
  </svg>`;
}

// 소품: [폭, 높이, 그림]. 바닥에 닿는 아래쪽 가운데가 (x, y)
const PROP_ART = {
  plant: [32, 60, `<path class="p-leaf" d="M16 36C3 32 2 14 9 7c3 8 5 15 7 29zM16 36c13-4 14-22 7-29-3 8-5 15-7 29zM16 36c-6-11-4-25 0-33 4 8 6 22 0 33z"/><path class="p-pot" d="M6 36h20l-3 22H9z"/>`],
  cooler: [28, 64, `<path class="p-bottle" d="M8 4h12v5l4 4v14H4V13l4-4z"/><rect class="p-body" x="3" y="27" width="22" height="35" rx="3"/><rect class="p-panel" x="9" y="33" width="10" height="6" rx="1.5"/><rect class="p-cup" x="10" y="44" width="8" height="7" rx="1"/>`],
  printer: [56, 46, `<path class="p-paper p-out" d="M16 2h24v14H16z"/><rect class="p-body" x="3" y="12" width="50" height="20" rx="4"/><rect class="p-panel" x="38" y="16" width="10" height="5" rx="1.5"/><path class="p-line" d="M12 26h32"/><rect class="p-body" x="8" y="31" width="40" height="13" rx="2"/>`],
  cabinet: [42, 78, `<rect class="p-body" x="2" y="2" width="38" height="74" rx="3"/><path class="p-line" d="M2 27h38M2 51h38"/><path class="p-book" d="M7 7h5v20H7zM13 10h5v17h-5zM20 8h5v19h-5zM8 32h5v19H8zM15 35h5v16h-5zM26 54h5v22h-5zM9 56h5v20H9z"/>`],
  sofa: [104, 46, `<rect class="p-sofa" x="4" y="4" width="96" height="22" rx="8"/><rect class="p-sofa2" x="2" y="20" width="100" height="18" rx="7"/><rect class="p-sofa" x="0" y="14" width="12" height="28" rx="5"/><rect class="p-sofa" x="92" y="14" width="12" height="28" rx="5"/><path class="p-leg" d="M10 40v5M94 40v5"/>`],
  coffee: [40, 62, `<rect class="p-body" x="3" y="26" width="34" height="34" rx="3"/><rect class="p-machine" x="7" y="2" width="26" height="28" rx="4"/><rect class="p-hole" x="12" y="13" width="16" height="13" rx="1.5"/><rect class="p-cup" x="16" y="19" width="8" height="7" rx="1.5"/><g class="steam"><path d="M17 1q-3-4 0-8"/><path d="M23 1q3-4 0-8"/></g>`]
};

function propSvg(t, w) {
  if (t === "counter") {
    return [w, 66, `<svg viewBox="0 0 ${w} 66" aria-hidden="true" focusable="false">
      <rect class="p-top" x="1" y="24" width="${w - 2}" height="24" rx="4"/><rect class="p-front" x="1" y="46" width="${w - 2}" height="19" rx="3"/>
      <rect class="p-machine" x="10" y="2" width="28" height="34" rx="4"/><rect class="p-hole" x="15" y="15" width="18" height="14" rx="1.5"/><rect class="p-cup" x="20" y="22" width="8" height="7" rx="1.5"/>
      <rect class="d-mug" x="${w - 30}" y="30" width="9" height="10" rx="2"/><rect class="d-mug" x="${w - 18}" y="32" width="9" height="10" rx="2"/>
      <g class="steam"><path d="M21 1q-3-4 0-8"/><path d="M27 1q3-4 0-8"/></g></svg>`];
  }
  if (t === "table") {
    return [w, 64, `<svg viewBox="0 0 ${w} 64" aria-hidden="true" focusable="false">
      ${[.22, .5, .78].map(f => `<rect class="ch-back" x="${Math.round(w * f - 11)}" y="2" width="22" height="22" rx="7"/>`).join("")}
      <rect class="p-top" x="1" y="18" width="${w - 2}" height="26" rx="12"/><rect class="p-front" x="6" y="40" width="${w - 12}" height="12" rx="5"/>
      <path class="ch-leg" d="M${w / 2} 52v8M${w / 2 - 12} 60h24"/></svg>`];
  }
  const [pw, ph, art] = PROP_ART[t] || PROP_ART.plant;
  return [pw, ph, `<svg viewBox="0 0 ${pw} ${ph}" aria-hidden="true" focusable="false">${art}</svg>`];
}

// 평면도 위 한 점에 놓는 요소의 style (단위 → CSS 변수, 그리는 순서 = y)
function at(x, y, w, h, z) {
  return `style="--x:${Math.round(x)};--y:${Math.round(y)};--w:${Math.round(w)};--h:${Math.round(h)};z-index:${Math.round(z)}"`;
}

function itemHtml(it) {
  if (it.t === "glass") {
    const H = 34, segs = [[it.x1, it.gap[0]], [it.gap[1], it.x2]].filter(([a, b]) => b - a > 2);
    return segs.map(([a, b]) => `<span class="it glass" ${at(a, it.y - H, b - a, H, it.y)}></span>`).join("")
      + `<span class="it door-post" ${at(it.gap[0] - 3, it.y - H - 2, 6, H + 2, it.y)}></span><span class="it door-post" ${at(it.gap[1] - 3, it.y - H - 2, 6, H + 2, it.y)}></span>`
      + (it.sign ? `<span class="it room-sign" ${at((it.gap[0] + it.gap[1]) / 2, it.y - H / 2, 0, 0, it.y + 1)}>${esc(it.sign)}</span>` : "");
  }
  if (it.t === "door") {
    return `<span class="it door-leaf" ${at(it.x1, it.y - 5, it.x2 - it.x1, 8, it.y)}></span><span class="it room-sign door-sign" ${at((it.x1 + it.x2) / 2, it.y - 16, 0, 0, it.y + 1)}>입구</span>`;
  }
  const [w, h, svg] = propSvg(it.t, it.w);
  return `<span class="it prop ${it.t}" ${at(it.x - w / 2, it.y - h, w, h, it.y)}>${svg}</span>`;
}

function deskHtml(P, i, kind) {
  const d = P.desks[i];
  const s = planSeat(P, i);
  const [cw, ch] = CHAIR_SIZE[kind];
  const H = MON_H + 4 + DESK_D + DESK_H;
  // 책상 도장은 머리 위, 양옆 책상은 바깥쪽으로 비켜서 앞줄 이름표와 겹치지 않게
  const dx = s.x < P.W * .4 ? -24 : s.x > P.W * .6 ? 24 : 4;
  // 이름표는 걸어 다니는 직원보다 항상 위 (z 900대: 직원 < 이름표 < 스포트라이트·말풍선·도장)
  return `<span class="it chair ${kind}" data-i="${i}" ${at(s.x - cw / 2, s.y + 8 - (ch + 16), cw, ch + 16, s.y - 1)}>${chairSvg(kind)}</span>
    <span class="it desk ${kind}" data-i="${i}" ${at(d.x - d.w / 2, d.y - H, d.w, H, d.y)}>${deskSvg(kind, d.w)}</span>
    <span class="it plate" data-i="${i}" ${at(d.x, d.y - DESK_H / 2, 0, 0, 900 + i)}></span>
    <span class="it vacant" data-i="${i}" ${at(d.x, s.y - 2, 0, 0, d.y + 3)}>공석</span>
    <span class="it desk-stamp" data-i="${i}" ${at(s.x + dx, s.y - P.mate * 1.45 - 6, 0, 0, 960)}></span>`;
}

// 걸을 길 (노드 그래프에서 가장 짧은 길)
function planRoute(P, from, to) {
  if (!P.graph) {
    const g = {};
    Object.keys(P.nodes).forEach(k => { g[k] = []; });
    P.edges.split(" ").forEach(e => {
      const [a, b] = e.split("-");
      const d = Math.hypot(P.nodes[a][0] - P.nodes[b][0], P.nodes[a][1] - P.nodes[b][1]);
      g[a].push([b, d]);
      g[b].push([a, d]);
    });
    P.graph = g;
  }
  const dist = { [from]: 0 }, prev = {}, todo = new Set(Object.keys(P.nodes));
  while (todo.size) {
    let u = null;
    todo.forEach(k => { if (dist[k] !== undefined && (u === null || dist[k] < dist[u])) u = k; });
    if (u === null || u === to) break;
    todo.delete(u);
    P.graph[u].forEach(([v, d]) => {
      if (dist[u] + d < (dist[v] ?? Infinity)) { dist[v] = dist[u] + d; prev[v] = u; }
    });
  }
  const path = [to];
  while (path[0] !== from && prev[path[0]]) path.unshift(prev[path[0]]);
  return path[0] === from ? path.map(k => P.nodes[k]) : [P.nodes[from], P.nodes[to]];
}

// ===== 살아 있는 사무실 무대 =====
// 직원 캐릭터는 자기 책상에서 일하고, 복도를 따라 탕비실·프린터·회의실·동료 책상까지 걸어 다닙니다.
// 보고·진실 공개 때는 모두 자리로 돌아와 연기합니다.

const office = { company: null, el: null, stage: null, plan: null, kind: "", layer: null, mates: new Map(), mode: "idle", strip: false, epilogue: null, holdQuit: false, walkers: 0, focus: null, taken: new Set(), sayAt: null };

function officeIsStrip() {
  return !!(window.matchMedia && window.matchMedia("(max-width: 759px)").matches);
}

function officeVisible() {
  return document.body.classList.contains("with-office") && office.el && office.el.offsetWidth > 0 && !!office.plan;
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
  office.plan = null;
  office.kind = "";
  office.walkers = 0;
  office.taken.clear();
  // 지난 판의 결산 에필로그(busy)가 남으면 새 판 면접에서 직원들이 굳어 있음: 새 회사는 늘 평소 모드로 시작
  office.mode = reduceMotion() ? "still" : "idle";
  office.holdQuit = false;
  office.sayAt = null;
  el.className = "office";
  el.innerHTML = `
    <div class="office-sign"><span class="os-emoji" aria-hidden="true">${esc(c.emoji || "🏢")}</span><b class="os-name">${esc(c.name || "우리 회사")}</b><span class="os-where" id="office-where"></span></div>
    <div class="office-stage"></div>
    <div class="caption" aria-hidden="true"></div>
    <button type="button" class="office-skip">⏩ 탭하면 바로 보기</button>`;
  office.stage = el.querySelector(".office-stage");
  el.onclick = skipReveal;
}

// 평면도 그리기 (휴대폰 ↔ 데스크톱이 바뀌면 다시 그림)
function officeDraw(kind) {
  const P = PLANS[kind];
  office.kind = kind;
  office.plan = P;
  office.strip = kind === "wide";
  office.mates.forEach(m => { m.gen++; });
  office.mates.clear();
  office.walkers = 0;
  office.taken.clear();
  const st = office.stage;
  st.className = `office-stage plan-${kind}`;
  st.style.setProperty("--W", P.W);
  st.style.setProperty("--mate", P.mate);
  st.style.aspectRatio = `${P.W} / ${P.H}`;
  st.innerHTML = `<svg class="plan-bg" viewBox="0 0 ${P.W} ${P.H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${P.bg}</svg>
    <div class="plan-items" aria-hidden="true">${P.items.map(itemHtml).join("")}${P.desks.map((d, i) => deskHtml(P, i, DESK_KIND[i])).join("")}</div>
    <div class="mates" aria-hidden="true"></div>
    <svg class="plan-fx" viewBox="0 0 ${P.W} ${P.H}" preserveAspectRatio="none" aria-hidden="true" focusable="false"></svg>
    <span class="spot" aria-hidden="true"></span>
    <div class="fly" aria-hidden="true"></div>
    <div class="speech" aria-hidden="true"></div>
    <span class="focus-mark" aria-hidden="true"><b>면접 중</b></span>
    <span class="lens" aria-hidden="true">🔍</span>
    <span class="sweep" aria-hidden="true"></span>`;
  office.layer = st.querySelector(".mates");
  office.el.classList.toggle("strip", office.strip);
}

function deskPart(i, part) {
  return office.stage ? office.stage.querySelector(`.${part}[data-i="${i}"]`) : null;
}

function floorPerson(c, i) {
  if (i === 0) return null;
  const id = c.hires[FLOOR_RANKS[i]];
  return id ? candidateById(c, id) : null;
}

// 책상 앞 이름표: 직급(작은 직급 색 표시) + 이름 / 글자칸 + 글자 수
function plateHtml(c, i, person) {
  const rank = FLOOR_RANKS[i];
  const chars = i === 0 ? ORDER_MAX : rankInfo(rank).chars;
  const here = i === 0 || (person && (!person.quit || office.holdQuit));
  // 퇴사자는 이름에 줄을 긋고, 빨간 '퇴사' 팻말은 의자 자리에 (공석은 이름표 하나로만 알림)
  const gone = i !== 0 && !here && !!person && !!person.quit;
  const name = i === 0 ? c.player || "사장님" : person ? person.name : "공석";
  // 진실 공개가 끝날 때까지는 고르기 전의 충성심을 보여 줍니다 (♥가 먼저 바뀌면 판정을 미리 알려 주게 됨)
  const frozen = person && office.holdQuit && office.shownLoyalty && office.shownLoyalty.has(person.id);
  const hv = Number(frozen ? office.shownLoyalty.get(person.id) : person ? person.loyalty : 0);
  return `<span class="pl-row"><b class="rank rk-${i}">${esc(rank)}</b><span class="pn${gone ? " gone" : ""}">${esc(name)}</span></span>
    <span class="pl-row pl-chars">${cells(chars / 10, `rk-${i}`)}<small>${chars}자</small>${here && person ? `<span class="ph" title="충성심 ${hv}/10">♥${hv}</span>` : ""}</span>`;
}

// 사람이 바뀐 자리만 고칩니다. animate면 새 직원은 입구 문으로 걸어 들어옵니다.
function officeSync(animate) {
  const c = game.company;
  if (!office.el || office.company !== c || !office.stage || !office.el.contains(office.stage)) officeBuild(c);
  if (!office.el) return;
  const sign = office.el.querySelector(".os-name");
  if (sign) sign.textContent = c.name || "우리 회사";
  const emoji = office.el.querySelector(".os-emoji");
  if (emoji) emoji.textContent = c.emoji || "🏢";
  const where = document.getElementById("office-where");
  if (where) {
    const id = document.body.dataset.screen;
    where.textContent = id === "screen-interview" ? "면접 중" : id === "screen-final" ? "1년 결산" : c.events.length ? quarterLabel(game.round) : "";
  }
  // 진실 공개 중이 아닐 때 본 충성심을 기억해 두었다가, 공개하는 동안에는 이름표에 그 값을 그대로 둡니다
  if (!office.holdQuit) {
    office.shownLoyalty = new Map();
    FLOOR_RANKS.forEach((rank, i) => { const p = floorPerson(c, i); if (p) office.shownLoyalty.set(p.id, p.loyalty); });
  }
  if (!document.body.classList.contains("with-office") || !office.el.offsetWidth) return;
  const kind = officeIsStrip() ? "wide" : "tall";
  if (kind !== office.kind) officeDraw(kind);
  FLOOR_RANKS.forEach((rank, i) => {
    const person = floorPerson(c, i);
    const held = office.holdQuit && person && person.quit && office.mates.get(i) && office.mates.get(i).id === person.id;
    const here = i === 0 || (person && (!person.quit || held));
    const desk = deskPart(i, "desk");
    const plate = deskPart(i, "plate");
    const vacant = deskPart(i, "vacant");
    if (desk) {
      desk.classList.toggle("empty", !here);
      desk.classList.toggle("left", !!(person && person.quit && !held));
    }
    if (vacant) {
      vacant.textContent = person && person.quit ? "퇴사" : "공석";
      vacant.classList.toggle("on", !here);
      vacant.classList.toggle("quit", !!(person && person.quit && !held));
    }
    if (plate) {
      plate.innerHTML = plateHtml(c, i, person);
      plate.classList.toggle("empty", !here);
      plate.title = `${rank} ${i === 0 ? c.player || "" : person ? person.name : "공석"} · 지시 ${i === 0 ? ORDER_MAX : rankInfo(rank).chars}자`;
    }
    const want = i === 0 ? "ceo" : here ? person.id : null;
    const m = office.mates.get(i);
    if (m && m.id !== want) { mateRemove(m, animate); office.mates.delete(i); }
    if (want && !office.mates.get(i)) mateAdd(i, i === 0 ? null : person, animate);
    else if (want && office.mates.get(i)) office.mates.get(i).person = i === 0 ? null : person;
  });
}

function officeRelayout() {
  officeSync(false);
}

// 자리 좌표 (평면도 단위). kind: desk(앉는 자리) | stand(책상 옆) | door | out
function officeSpot(i, kind) {
  const P = office.plan;
  if (!P) return { x: 0, y: 0 };
  if (kind === "door" || kind === "out") return P.spots[kind];
  if (kind === "stand") { const n = P.nodes[P.deskNode[i]]; return { x: n[0], y: n[1] }; }
  return planSeat(P, i);
}

// 어떤 자리에서 어떤 자리로 가는 길 (자리 = 책상 번호 또는 장소 이름)
function officePath(from, to) {
  const P = office.plan;
  const loc = k => typeof k === "number" ? { ...planSeat(P, k), node: P.deskNode[k] } : P.spots[k];
  const a = loc(from), b = loc(to);
  if (!a || !b) return [];
  const pts = [[a.x, a.y], ...planRoute(P, a.node, b.node), [b.x, b.y]];
  return pts.filter((p, k) => k === 0 || Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) > 1).slice(1);
}

function officeDoor() {
  const door = office.stage && office.stage.querySelector(".door-leaf");
  if (door) replay(door, "open", 1400);
}

function mateAdd(i, person, animate) {
  if (!office.layer) return null;
  const el = document.createElement("div");
  el.className = `mate rk-${i}${i === 0 ? " ceo" : ""}`;
  el.innerHTML = `<div class="mate-fig">${chibiSvg(person)}<span class="mate-box" aria-hidden="true">📦</span></div><span class="mate-fx"></span><span class="mate-say"></span>`;
  office.layer.appendChild(el);
  const m = { i, id: person ? person.id : "ceo", person, el, gen: 0, x: 0, y: 0, busy: false, leaving: false, away: false };
  office.mates.set(i, m);
  if (animate && !reduceMotion()) {
    const out = officeSpot(i, "out");
    mateJump(m, out.x, out.y);
    m.away = true;
    el.classList.add("arrive");
    mateFx(m, "👋", 1800);
    sfx("walk");
    officeDoor();
    const gen = m.gen;
    requestAnimationFrame(() => mateWalk(m, officePath("out", i), 120, null, () => m.gen === gen).then(() => {
      if (m.gen !== gen) return;
      el.classList.remove("arrive");
      mateSit(m);
      if (office.mode === "idle") mateLife(m);
    }));
  } else {
    const s = planSeat(office.plan, i);
    mateJump(m, s.x, s.y);
    mateSit(m);
    if (office.mode === "idle") mateLife(m);
  }
  return m;
}

function mateRemove(m, animate) {
  m.gen++;
  m.leaving = true;
  deskOn(m.i, false);
  if (!animate || reduceMotion() || !office.plan) { m.el.remove(); return; }
  const gen = m.gen;
  mateWalk(m, officePath(m.away ? "door" : m.i, "out"), 120, null, () => m.gen === gen).then(() => {
    m.el.classList.add("gone");
    setTimeout(() => m.el.remove(), 400);
  });
}

// 위치는 평면도 단위로 저장합니다. 화면 크기가 바뀌어도 CSS가 알아서 맞춥니다.
function officeDims() {
  const P = office.plan || PLANS.tall;
  return { W: P.W, H: P.H, k: office.stage && office.stage.clientWidth ? office.stage.clientWidth / P.W : 1 };
}

function mateSet(m, x, y, z) {
  m.x = x;
  m.y = y;
  m.el.style.setProperty("--mx", x.toFixed(1));
  m.el.style.setProperty("--my", y.toFixed(1));
  m.el.style.zIndex = String(Math.round(z ?? y));
}

function matePos(m) {
  return { x: m.x || 0, y: m.y || 0 };
}

function mateJump(m, x, y) {
  m.el.style.transition = "none";
  mateSet(m, x, y);
  void m.el.offsetWidth;
}

function mateGo(m, x, y, speed, waitFn) {
  const dist = Math.hypot(x - m.x, y - m.y);
  if (dist < 1) return Promise.resolve();
  const ms = Math.max(160, dist / (speed || 80) * 1000);
  if (Math.abs(x - m.x) > 2) m.el.classList.toggle("face-left", x < m.x);
  m.el.classList.remove("saying"); // 말하다가 걷기 시작하면 이름표 아래로
  m.el.classList.add("walk");
  m.el.style.transition = `transform ${Math.round(ms)}ms linear`;
  mateSet(m, x, y, Math.max(y, m.y));
  return (waitFn || officeWait)(ms).then(() => {
    m.el.classList.remove("walk");
    m.el.style.zIndex = String(Math.round(m.y));
  });
}

// 길을 따라 걷기. live()가 false가 되면 그 자리에서 멈춥니다.
async function mateWalk(m, pts, speed, waitFn, live) {
  if (!pts.length) return;
  if (!m.away) mateStand(m);
  office.walkers++;
  try {
    for (const [x, y] of pts) {
      if (live && !live()) return;
      await mateGo(m, x, y, speed, waitFn);
    }
  } finally {
    office.walkers = Math.max(0, office.walkers - 1);
  }
}

function deskOn(i, on) {
  const d = deskPart(i, "desk");
  if (d) d.classList.toggle("on", !!on);
}

// 자리에 앉기 / 일어나기 (의자가 빙글)
function mateSit(m) {
  m.away = false;
  m.el.classList.add("seated");
  m.el.classList.remove("face-left");
  const s = planSeat(office.plan, m.i);
  if (Math.hypot(m.x - s.x, m.y - s.y) > 1) mateJump(m, s.x, s.y);
  m.el.style.zIndex = String(Math.round(s.y));
  deskOn(m.i, true);
  replay(deskPart(m.i, "chair"), "swivel", 500);
}

function mateStand(m) {
  if (m.away) return;
  m.away = true;
  m.el.classList.remove("seated");
  deskOn(m.i, false);
  replay(deskPart(m.i, "chair"), "swivel", 500);
}

function mateHome(m, speed, waitFn, live) {
  if (!m.away) return Promise.resolve();
  const from = m.at || m.i;
  return mateWalk(m, officePath(from, m.i), speed || 90, waitFn, live).then(() => {
    if (!live || live()) { m.at = null; mateSit(m); }
  });
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
  if (!m || !m.el || office.strip) return;
  // 거짓말·퇴사 도장이 찍힌 자리에서는 잡담 말풍선을 띄우지 않음 (도장·이름표를 가리지 않게)
  const st = deskPart(m.i, "desk-stamp");
  if (!m.away && st && st.classList.contains("on")) return;
  const say = m.el.querySelector(".mate-say");
  m.el.classList.toggle("say-left", (m.x || 0) > office.plan.W * .6);
  const t = Array.from(String(text));
  say.textContent = t.length > 13 ? t.slice(0, 12).join("") + "…" : t.join("");
  say.classList.add("on");
  // 자리에 앉아 말할 때만 이름표 위로. 걸어 다니거나 남의 책상에 가 있는 직원은 이름표 아래 그대로 (이름표 글자를 가리지 않게)
  m.el.classList.toggle("saying", !m.away && !m.el.classList.contains("walk"));
  clearTimeout(m.sayTimer);
  m.sayTimer = setTimeout(() => { say.classList.remove("on"); m.el.classList.remove("saying"); }, ms || 2200);
}

function mateOf(person) {
  if (!person) return office.mates.get(0);
  for (const m of office.mates.values()) if (m.id === person.id) return m;
  return null;
}

const IDLE_CLASSES = ["walk", "type", "phone", "nap", "sip", "hop", "lookup", "read", "cheer", "slump", "clap", "pack", "liar", "run", "sweat", "shrug", "jump"];

function mateReset(m, keep) {
  m.gen++;
  m.busy = false;
  IDLE_CLASSES.forEach(k => { if (!keep || !keep.includes(k)) m.el.classList.remove(k); });
}

// 직원 성격(보이는 정보: 능력·운·MBTI·애착·충성심)으로 할 일 고르기. 숨은 정직도는 쓰지 않습니다.
function pickActivity(m) {
  const x = m.person;
  const P = office.plan;
  const roam = office.walkers < (office.strip ? 2 : 3);
  const has = k => roam && !!P.spots[k] && !office.taken.has(k);
  if (!x) return weighted({ work: 5, window: has("window") ? 1.2 : 0, stretch: .6 });
  const mbti = String(x.mbti || "");
  const E = mbti[0] === "E", P2 = mbti[3] === "P";
  const avoid = x.secure < 50;
  return weighted({
    work: 2.8 + (x.skill - 5) * .55,
    coffee: has("coffee") ? 1.1 : 0,
    water: has("water") ? .5 : 0,
    printer: has("printer") ? (x.skill >= 6 ? .9 : .5) : 0,
    board: has("board") ? (mbti[1] === "N" ? .7 : .3) : 0,
    visit: roam ? (E ? 1.4 : .4) + (avoid ? 0 : .5) : 0,
    phone: avoid ? 1.4 : .5,
    nap: (P2 ? .9 : .25) + (x.skill <= 4 ? .7 : 0),
    stretch: .6,
    lucky: x.luck >= 7 ? .7 : .08,
    sigh: x.loyalty <= 3 ? 1.6 : 0,
    proud: x.loyalty >= 8 ? .8 : 0
  });
}

function weighted(w) {
  const entries = Object.entries(w).filter(([, v]) => v > 0);
  let r = Math.random() * entries.reduce((s, [, v]) => s + v, 0);
  for (const [k, v] of entries) { r -= v; if (r <= 0) return k; }
  return entries[0][0];
}

const PAIR_LINES = [["커피 한잔?", "콜 ☕"], ["회의 몇 시예요?", "방금 끝남 ㅋㅋ"], ["이거 누가 해요?", "…저요?"], ["사장님 오셨어요?", "쉿 🤫"], ["점심 뭐 먹지", "학식 ㄱ"], ["보고서 봤어요?", "아직요…"]];
const SPOT_FX = { coffee: "☕", water: "💧", printer: "📄", board: "📊", cabinet: "📁", window: "🌤️" };

async function mateLife(m) {
  if (reduceMotion() || m.leaving) return;
  const gen = ++m.gen;
  const live = () => m.gen === gen && office.mode === "idle" && m.el.isConnected && !m.leaving;
  await officeWait(rand(300, 2600));
  while (live()) {
    if (document.hidden || !officeVisible() || m.busy) { await officeWait(1200); continue; }
    await mateAct(m, pickActivity(m), live);
    if (!live()) return;
    await officeWait(rand(600, 1800));
  }
}

async function mateAct(m, act, live) {
  switch (act) {
    case "work":
      m.el.classList.add("type");
      if (m.person && m.person.skill >= 7 && Math.random() < .5) mateFx(m, "🔥", 1600);
      await officeWait(rand(2800, 6000));
      m.el.classList.remove("type");
      break;
    case "coffee": case "water": case "printer": case "board": case "window": {
      if (office.taken.has(act)) break;
      office.taken.add(act);
      m.at = act;
      try {
      await mateWalk(m, officePath(m.i, act), 70, null, live);
      if (!live()) return;
      const spot = office.plan.spots[act];
      m.el.classList.toggle("face-left", !!spot.left);
      m.el.classList.add(act === "coffee" || act === "water" ? "sip" : "lookup");
      mateFx(m, SPOT_FX[act] || "✨", 2200);
      const prop = office.stage.querySelector(`.prop.${act === "water" ? "cooler" : act === "coffee" ? (office.strip ? "coffee" : "counter") : act}`);
      if (prop) replay(prop, "use", 1600);
      await officeWait(rand(1800, 2800));
      m.el.classList.remove("sip", "lookup");
      } finally { office.taken.delete(act); }
      if (live()) await mateHome(m, 75, null, live);
      break;
    }
    case "visit": {
      const j = m.i + (Math.random() < .5 ? -1 : 1);
      const other = office.mates.get(j);
      if (j < 1 || !other || other.busy || other.leaving || other.away) break;
      m.busy = true;
      other.busy = true;
      const n = office.plan.nodes[office.plan.deskNode[j]];
      m.at = null;
      await mateWalk(m, [...officePath(m.i, j).slice(0, -1)], 85, null, live);
      if (live()) {
        const [ask, reply] = pickOne(PAIR_LINES);
        m.el.classList.toggle("face-left", n[0] > other.x);
        other.el.classList.toggle("face-left", m.x < other.x);
        mateSay(m, ask, 1700);
        await officeWait(1100);
        mateSay(other, reply, 1700);
        await officeWait(1800);
        other.el.classList.remove("face-left");
      }
      other.busy = false;
      m.busy = false;
      if (live()) {
        await mateWalk(m, officePath(j, m.i).slice(0), 85, null, live);
        if (live()) mateSit(m);
      }
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

// 대본 모드: 모두 자기 자리로 (보고·진실 공개·결산)
function officeBusy(fast) {
  office.mode = "busy";
  office.mates.forEach(m => {
    if (m.leaving) return;
    mateReset(m, ["liar"]);
    m.at = null;
    if (fast || reduceMotion() || !m.away) { mateSit(m); return; }
    const gen = m.gen;
    const s = planSeat(office.plan, m.i);
    mateGo(m, s.x, s.y, 320).then(() => { if (m.gen === gen) mateSit(m); });
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

// 새 분기: 카메라처럼 바닥을 쓸고 지나가는 띠 + 모두 자리로 뛰어 들어가며 ❗
function officeRush(text, chance) {
  if (!office.el) return;
  officeBusy();
  officeClearSay();
  const sweep = office.stage && office.stage.querySelector(".sweep");
  if (sweep) { sweep.classList.toggle("chance", !!chance); replay(sweep, "go", 900); }
  office.mates.forEach(m => { if (!m.leaving) { m.el.classList.remove("liar"); m.el.classList.add("run"); mateFx(m, text || "❗", 1300); } });
  setTimeout(() => {
    office.mates.forEach(m => m.el.classList.remove("run"));
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

// 무대 말풍선만 걷기 (책상 도장·자막은 그대로)
let truthSayToken = 0;
function officeHideSay() {
  const sp = office.stage && office.stage.querySelector(".speech");
  if (sp) sp.classList.remove("on");
  office.sayAt = null;
}

function officeClearSay() {
  if (!office.el) return;
  const sp = office.stage && office.stage.querySelector(".speech");
  if (sp) sp.className = "speech";
  office.sayAt = null;
  truthSayToken++; // 지난 진실 공개가 걸어 둔 '말풍선 걷기' 타이머가 새 보고 말풍선을 지우지 않게
  office.el.querySelectorAll(".desk-stamp").forEach(s => { s.className = "it desk-stamp"; s.textContent = ""; });
  const cap = office.el.querySelector(".caption");
  if (cap) cap.classList.remove("on");
  officeSpot2(null);
}

// 무대 말풍선: 말하는 사람 머리 위에 하나만. level이 높을수록(보고가 위로 올라갈수록) 부풀어 오릅니다
function officeSay(i, text, opts) {
  if (!office.el || !officeVisible()) return;
  const o = opts || {};
  const t = Array.from(String(text || ""));
  if (office.strip) {
    const cap = office.el.querySelector(".caption");
    if (!cap) return;
    cap.textContent = t.length > 44 ? t.slice(0, 43).join("") + "…" : t.join("");
    cap.className = `caption on ${o.lie ? "lie" : ""} ${o.up ? "up" : ""} ${o.paper ? "paper" : i === 0 ? "ceo" : ""} ${o.final ? "final" : ""}`;
    const s = planSeat(office.plan, i);
    cap.style.setProperty("--ax", `${(s.x / office.plan.W * 100).toFixed(1)}%`);
    cap.style.setProperty("--lv", o.level || 0);
    replay(cap, "pop");
    return;
  }
  const sp = office.stage.querySelector(".speech");
  if (!sp) return;
  const P = office.plan;
  const s = planSeat(P, i);
  sp.textContent = t.join("");
  const base = `speech ${o.lie ? "lie" : ""} ${o.up ? "up" : ""} ${o.final ? "final" : ""} ${i === 0 ? "ceo" : ""}`;
  sp.className = base;
  sp.style.setProperty("--lv", o.level || 0);
  const spot = speechSpot(sp, i, P, s);
  sp.className = `${base} on${spot.below ? " below" : ""}`;
  sp.style.setProperty("--sx", spot.x.toFixed(1));
  sp.style.setProperty("--sy", spot.y.toFixed(1));
  sp.style.setProperty("--tx", "0px");
  sp.style.setProperty("--to", `${spot.origin.toFixed(1)}px`);
  office.sayAt = i;
  replay(sp, "pop");
}

// 무대 말풍선 자리 고르기: 말하는 사람 머리 위(기본) 또는 자기 책상 아래에서,
// 말풍선이 그 사람 위를 지나도록 좌우로 밀어 보며 다른 책상 이름표·책상 도장·사람을 가장 덜 가리는 곳.
// (맨 아래 줄 직원이 말할 때 바로 윗줄 이름표를 덮던 문제) 반환값의 x·y는 평면도 단위, origin은 px
function speechSpot(sp, i, P, s) {
  const st = office.stage;
  const SW = st.clientWidth, SH = st.clientHeight;
  const u = SW / P.W;
  const w = sp.offsetWidth, h = sp.offsetHeight;
  const sx = s.x * u;
  const head = (s.y - P.mate * 1.45 - 4) * u;
  if (!u || !w || !h) return { x: s.x, y: s.y - P.mate * 1.45 - 4, below: false, origin: 0 };
  const fallback = { x: (sx - w / 2) / u, y: head / u, below: false, origin: w / 2 };
  const k = 1 + (Number(sp.style.getPropertyValue("--lv")) || 0) * .05;
  const obs = [];
  const box = (el, wt) => {
    if (!el || !el.offsetWidth) return;
    const cx = Number(el.style.getPropertyValue("--x")) * u, cy = Number(el.style.getPropertyValue("--y")) * u;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
    const hw = el.offsetWidth / 2 + 3, hh = el.offsetHeight / 2 + 3; // 그림자 몫 3px 여유
    obs.push([cx - hw, cy - hh, cx + hw, cy + hh, wt]);
  };
  // 이름표·도장은 조금만 덮어도 크게 벌점 (글자가 가려지면 안 됨), 사람은 가볍게
  st.querySelectorAll(".it.plate").forEach(el => { if (Number(el.dataset.i) !== i) box(el, 6); });
  st.querySelectorAll(".it.desk-stamp.on").forEach(el => { if (Number(el.dataset.i) !== i) box(el, 6); });
  office.mates.forEach(m => {
    if (m.i === i || !m.el.isConnected || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
    const mw = P.mate * u;
    obs.push([m.x * u - mw / 2, (m.y - P.mate * 1.45) * u, m.x * u + mw / 2, m.y * u, .3]);
  });
  const own = deskPart(i, "plate");
  const under = own && own.offsetWidth ? Number(own.style.getPropertyValue("--y")) * u + own.offsetHeight / 2 + 2 : P.desks[i].y * u + 2;
  const hit = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const lo = sx - w + 18, hi = sx - 18;
  const want = Math.min(Math.max(sx, w * k / 2 + 4), SW - w * k / 2 - 4); // 화면 안에서 가장 가운데에 가까운 자리
  const side = P.mate * u * .6;                   // 옆자리: 얼굴 바로 옆
  const faceMid = (s.y - P.mate * 1.05) * u;
  // 후보: [왼쪽 끝 L, 말풍선 아래 끝(머리 위·옆) 또는 위 끝(책상 아래), 아래 기준?, 벌점 비율]
  const cand = [];
  for (let n = 0; n <= 14; n++) {
    const L = hi <= lo ? sx - w / 2 : lo + (hi - lo) * n / 14;
    cand.push([L, head, false, 0], [L, under, true, .08]);
  }
  // 옆자리 후보는 무대 밖으로 나가면 안쪽으로 밀어 넣음 (글자가 잘리는 것보다 자기 얼굴을 조금 덮는 편이 나음)
  const fit = L => {
    const r0 = sx - (sx - L) * k, r2 = sx + (L + w - sx) * k;
    return r2 > SW - 2 ? L - (r2 - SW + 2) / k : r0 < 2 ? L + (2 - r0) / k : L;
  };
  cand.push([fit(sx + side), faceMid + h * k / 2, false, .05], [fit(sx - side - w), faceMid + h * k / 2, false, .05]);
  // 말하는 사람 자기 얼굴도 가리지 않게 (옆자리 후보가 밀려 들어왔을 때)
  obs.push([sx - P.mate * u * .45, (s.y - P.mate * 1.45) * u, sx + P.mate * u * .45, (s.y - P.mate * .6) * u, 2]);
  let best = null;
  cand.forEach(([L, y, below, cost]) => {
    const r = [sx - (sx - L) * k, below ? y : y - h * k, sx + (L + w - sx) * k, below ? y + h * k : y];
    const area = (r[2] - r[0]) * (r[3] - r[1]);
    const inside = Math.max(0, Math.min(r[2], SW) - Math.max(r[0], 0)) * Math.max(0, Math.min(r[3], SH) - Math.max(r[1], 0));
    let score = (area - inside) * 10 + area * cost + Math.abs((r[0] + r[2]) / 2 - want) * h * .04;
    obs.forEach(o => { score += hit(r, o) * o[4]; });
    if (!best || score < best.score) best = { score, L, y, below };
  });
  if (!best) return fallback;
  return { x: best.L / u, y: best.y / u, below: best.below, origin: sx - best.L };
}

// 스포트라이트: 그 사람 책상만 밝게
function officeSpot2(i) {
  if (!office.stage) return;
  const spot = office.stage.querySelector(".spot");
  const on = i !== null && i !== undefined && office.plan;
  office.el.classList.toggle("spotting", !!on);
  if (!spot) return;
  if (!on) { spot.classList.remove("on"); return; }
  const s = planSeat(office.plan, i);
  spot.style.setProperty("--px", s.x.toFixed(0));
  spot.style.setProperty("--py", (s.y - office.plan.mate * .55).toFixed(0));
  spot.classList.add("on");
}

// 사장 지시서가 실제 결재 라인을 따라 책상에서 책상으로 날아갑니다.
// 책상마다 그 직급의 글자 수 한도(공개된 규칙)만큼만 남고, 잘린 글자칸과 글자가 떨어져 나갑니다.
async function officePaper(order, chain) {
  if (!office.el || !officeVisible() || !chain.length) return;
  const P = office.plan;
  const st = office.stage;
  const fly = st.querySelector(".fly");
  const fx = st.querySelector(".plan-fx");
  const letters = Array.from(String(order || ""));
  const showText = n => letters.slice(0, n).join("") + (letters.length > n ? "…" : "");
  fx.innerHTML = "";
  fly.innerHTML = `<div class="fly-in"><span class="fly-text"></span><span class="fly-cells">${"<i></i>".repeat(ORDER_MAX / 10)}</span><b class="fly-limit">${ORDER_MAX}자</b></div>`;
  fly.querySelector(".fly-text").textContent = showText(12);
  // 데스크톱: 머리 위 / 휴대폰 지도: 몸 오른쪽 (지도 위쪽이 잘리지 않게)
  const head = i => { const s = planSeat(P, i); return office.strip ? { x: Math.min(P.W - 50, s.x + P.mate * .95), y: s.y - P.mate * .35 } : { x: s.x + 6, y: Math.max(46, s.y - P.mate * 1.45 - 2) }; };
  const K = () => st.clientWidth / P.W;
  const tf = (p, sc, rot) => `translate3d(${(p.x * K()).toFixed(1)}px, ${(p.y * K()).toFixed(1)}px, 0) translate(-50%, -100%) rotate(${rot || 0}deg) scale(${sc})`;
  let cur = head(0), scale = 1, keepChars = ORDER_MAX;
  const hop = pace(520);
  fly.style.transform = tf(cur, 1);
  fly.style.setProperty("--pk", "1"); // 종이는 작아져도 "✂ N자" 꼬리표·글자는 13px 그대로 (CSS에서 1/--pk로 되돌림)
  fly.classList.add("on");
  // 휴대폰 지도에서는 지시서가 작아 글자가 안 보이니, 지도 아래 자막으로 "지시 → 잘린 지시"를 보여 줍니다
  if (office.strip) officeSay(0, `📄 ${ORDER_MAX}자 · ${showText(ORDER_MAX)}`, { paper: true });
  const ceo = office.mates.get(0);
  if (ceo) { ceo.el.classList.add("hop"); setTimeout(() => ceo.el.classList.remove("hop"), 700); }
  await beat(pace(380));
  for (const x of chain) {
    const i = rankNo(x.rank);
    const to = head(i);
    const chars = rankInfo(x.rank).chars;
    const sc = .62 + .38 * chars / ORDER_MAX;
    const lift = Math.min(150, 50 + Math.hypot(to.x - cur.x, to.y - cur.y) * .3);
    const mid = { x: (cur.x + to.x) / 2, y: Math.min(cur.y, to.y) - lift };
    const trail = document.createElementNS("http://www.w3.org/2000/svg", "path");
    trail.setAttribute("class", "trail");
    trail.setAttribute("d", `M${cur.x.toFixed(0)} ${cur.y.toFixed(0)}Q${mid.x.toFixed(0)} ${mid.y.toFixed(0)} ${to.x.toFixed(0)} ${to.y.toFixed(0)}`);
    fx.appendChild(trail);
    requestAnimationFrame(() => trail.classList.add("on"));
    sfx("whoosh");
    // 날아가는 동안 종이는 scale → sc로 줄어듦: 미리 sc 기준으로 되돌려 두면 꼬리표는 늘 13px 이상
    fly.style.setProperty("--pk", sc.toFixed(3));
    if (!skipping && !reduceMotion() && fly.animate) {
      const frames = [];
      for (let n = 0; n <= 10; n++) {
        const t = n / 10, u = 1 - t;
        const p = { x: u * u * cur.x + 2 * u * t * mid.x + t * t * to.x, y: u * u * cur.y + 2 * u * t * mid.y + t * t * to.y };
        frames.push({ transform: tf(p, scale + (sc - scale) * t, Math.sin(t * Math.PI) * (to.x < cur.x ? -12 : 12)) });
      }
      const anim = fly.animate(frames, { duration: hop, easing: "ease-in-out" });
      fly.style.transform = tf(to, sc);
      await beat(hop);
      anim.cancel();
    } else {
      fly.style.transform = tf(to, sc);
    }
    // 착지: 잘린 칸과 글자가 떨어짐
    const keep = chars / 10;
    fly.querySelectorAll(".fly-cells i").forEach((cell, k) => cell.classList.toggle("drop", k >= keep));
    fly.querySelector(".fly-limit").textContent = `✂ ${chars}자`;
    fly.querySelector(".fly-text").textContent = showText(Math.max(2, Math.round(12 * keep / 10)));
    if (!skipping && !reduceMotion()) {
      const cut = letters.slice(chars, keepChars).filter(ch => ch.trim());
      cut.filter((_, k) => k % Math.max(1, Math.floor(cut.length / 4)) === 0).slice(0, 4).forEach((ch, k) => {
        const f = document.createElement("i");
        f.className = "fall";
        f.textContent = ch;
        f.style.setProperty("--fx", to.x.toFixed(0));
        f.style.setProperty("--fy", (to.y - 8).toFixed(0));
        f.style.setProperty("--dx", `${(k - 1.5) * 14}`);
        f.style.setProperty("--rot", `${(k % 2 ? 1 : -1) * (30 + k * 15)}deg`);
        st.appendChild(f);
        setTimeout(() => f.remove(), 900);
      });
    }
    keepChars = Math.min(keepChars, chars);
    if (office.strip) officeSay(i, `✂ ${x.rank} ${keepChars}자 · ${showText(keepChars)}`, { paper: true });
    replay(fly, "land");
    const m = mateOf(x);
    if (m) { m.el.classList.add("read"); setTimeout(() => m.el.classList.remove("read"), 700); }
    cur = to;
    scale = sc;
    await beat(pace(320));
  }
  fly.classList.remove("on");
  fx.querySelectorAll(".trail").forEach(p => p.classList.add("fade"));
  setTimeout(() => { if (!revealing) fx.innerHTML = ""; }, 700);
}

function deskStamp(i, long, short, cls) {
  const st = deskPart(i, "desk-stamp");
  if (!st) return;
  clearTimeout(st.fadeTimer);
  st.innerHTML = `<span class="fs-long">${esc(long)}</span><span class="fs-short">${esc(short)}</span>`;
  st.className = `it desk-stamp stamp on ${cls || ""}`;
  replay(st, "thud");
}

function officeLie(i, label) {
  if (!office.el) return;
  const m = office.mates.get(i);
  if (m) { m.el.classList.add("liar"); mateFx(m, "😳", 1400); }
  deskStamp(i, label || "🤥 거짓말", "🤥", "lie");
  replay(office.stage, "jolt", 400);
}

// 거짓말 도장은 그 순간에만 쾅 (빨간 도장이 여러 개 쌓이지 않게). 퇴사 도장은 그대로 둡니다.
// 누가 거짓말했는지는 직원의 긴 코(liar)와 단톡방 🤥 도장에 남습니다.
function officeUnstamp() {
  if (!office.el) return;
  office.el.querySelectorAll(".desk-stamp.on.lie").forEach(st => {
    st.classList.add("fade");
    clearTimeout(st.fadeTimer);
    st.fadeTimer = setTimeout(() => {
      if (!st.classList.contains("lie") || !st.classList.contains("fade")) return;
      st.className = "it desk-stamp";
      st.textContent = "";
    }, 320);
  });
}

// 보고를 부풀린 직원 도장: 한 명씩 차례로 (1.2초씩 보이고 사라짐). 진실 공개를 기다리게 하지는 않음
let lieSeq = 0;
function officeLieOneByOne(list, label) {
  const seq = ++lieSeq;
  const gap = pace(1200), lead = pace(500);
  list.forEach((i, k) => setTimeout(() => guard(() => {
    if (seq !== lieSeq || !office.el) return;
    const m = office.mates.get(i);
    const st = deskPart(i, "desk-stamp");
    if (!m || m.leaving || (st && st.classList.contains("quit"))) return;
    if (office.sayAt === i) { const sp = office.stage && office.stage.querySelector(".speech"); if (sp) sp.classList.remove("on"); }
    officeUnstamp();
    officeLie(i, label);
    if (k === 0) sfx("lie");
  }), lead + k * gap));
  setTimeout(() => { if (seq === lieSeq) guard(officeUnstamp); }, lead + list.length * gap);
}

function officeHearts(n, kind) {
  const st = office.stage;
  if (!st || reduceMotion() || !office.plan) return;
  const spots = [...office.mates.values()].filter(m => !m.leaving);
  for (let k = 0; k < n; k++) {
    const m = spots[k % Math.max(1, spots.length)];
    if (!m) return;
    const h = document.createElement("span");
    h.className = "heart-fx";
    h.textContent = kind ? kind[k % kind.length] : k % 3 ? "❤" : "👏";
    h.style.setProperty("--hx", (m.x + rand(-12, 12)).toFixed(0));
    h.style.setProperty("--hy", (m.y - office.plan.mate * 1.4).toFixed(0));
    h.style.animationDelay = `${(k * 0.07).toFixed(2)}s`;
    st.appendChild(h);
    setTimeout(() => h.remove(), 1900);
  }
}

function officeClap() {
  if (!office.el) return;
  office.mates.forEach(m => { if (!m.leaving && m.i) m.el.classList.add("clap", "jump"); });
  officeHearts(Math.min(14, office.mates.size * 2));
  setTimeout(() => office.mates.forEach(m => m.el.classList.remove("clap", "jump")), 1500);
}

function officeLens(ms) {
  if (!office.el || reduceMotion() || !office.plan) return;
  const dur = ms || SUSPENSE_DELAY;
  const lens = office.stage.querySelector(".lens");
  if (!lens || !lens.animate) return;
  const P = office.plan;
  const k = office.stage.clientWidth / P.W;
  const pts = FLOOR_RANKS.map((_, i) => planSeat(P, i)).slice(1);
  lens.classList.add("on");
  lens.animate(pts.map(p => ({ transform: `translate3d(${(p.x * k).toFixed(0)}px, ${((p.y - P.mate) * k).toFixed(0)}px, 0) translate(-50%, -50%)` })),
    { duration: dur, easing: "ease-in-out" }).onfinish = () => lens.classList.remove("on");
  office.mates.forEach(m => { if (!m.leaving && m.i) { m.el.classList.add("slump", "sweat"); } });
  setTimeout(() => office.mates.forEach(m => m.el.classList.remove("slump", "sweat")), dur + 200);
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

// 퇴사: 어깨를 으쓱하고 상자를 든 채 복도를 따라 입구 문으로 걸어 나갑니다.
// 어느 층에서든 걷는 시간은 2.4초 안쪽 (여러 명이면 renderTruth가 동시에 내보냄). 움직임 줄이기면 도장만 찍고 바로 비움.
async function officeQuit(i) {
  const m = office.mates.get(i);
  if (!m || !officeVisible()) return;
  m.gen++;
  mateReset(m);
  m.leaving = true;
  deskStamp(i, "퇴사", "📦", "quit");
  sfx("stamp");
  const finish = () => {
    m.el.remove();
    if (office.mates.get(i) === m) office.mates.delete(i);
    const vacant = deskPart(i, "vacant");
    if (vacant) { vacant.textContent = "퇴사"; vacant.classList.add("on", "quit"); }
    const desk = deskPart(i, "desk");
    if (desk) desk.classList.add("empty", "left");
  };
  if (reduceMotion() || skipping) return finish();
  m.el.classList.add("shrug");
  mateFx(m, "😢", 1400);
  await beat(450);
  m.el.classList.remove("shrug");
  m.el.classList.add("pack");
  await beat(300);
  officeDoor();
  const path = officePath(i, "out");
  let len = 0, prev = [m.x, m.y];
  path.forEach(p => { len += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; });
  await mateWalk(m, path, Math.max(110, len / 2.4), beat);
  m.el.classList.add("gone");
  await beat(350);
  finish();
}

// 면접 중인 자리를 표시 (화살표 + "면접 중")
function officeFocus(i) {
  office.focus = i;
  const mark = office.stage && office.stage.querySelector(".focus-mark");
  if (!mark || !office.plan) return;
  if (i === null || i === undefined) { mark.classList.remove("on"); office.el.querySelectorAll(".desk.focus").forEach(d => d.classList.remove("focus")); return; }
  const d = office.plan.desks[i];
  mark.style.setProperty("--x", d.x);
  // 휴대폰 지도의 윗줄 책상은 표시가 지도 위로 잘리지 않게 아래로
  mark.style.setProperty("--y", Math.max(office.strip ? 78 : 0, planSeat(office.plan, i).y - office.plan.mate * 1.3).toFixed(0));
  mark.classList.add("on");
  office.el.querySelectorAll(".desk").forEach(el => el.classList.toggle("focus", Number(el.dataset.i) === i));
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
  if (kind === "dark" && office.plan) {
    const s = planSeat(office.plan, 0);
    office.stage.style.setProperty("--lx", `${(s.x / office.plan.W * 100).toFixed(1)}%`);
    office.stage.style.setProperty("--ly", `${((s.y - 24) / office.plan.H * 100).toFixed(1)}%`);
  }
  office.mates.forEach(m => {
    if (m.leaving) return;
    if (kind === "party") { m.el.classList.add("cheer"); mateFx(m, pickOne(["🎉", "🥳", "🍾", "🙌"]), 60000); }
    if (kind === "pack" && m.i) { m.el.classList.add("pack", "slump"); mateFx(m, pickOne(["😭", "📦", "😮‍💨"]), 60000); }
    if (kind === "dark" && m.i === 0) mateFx(m, "☕", 60000);
  });
  if (kind === "party") officeHearts(12, ["🎉", "✨", "🎊"]);
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
  div.className = `msg ${o.kind || ""}${o.cls ? " " + o.cls : ""}${o.amb ? " amb" : ""}`;
  if (o.amb) div.setAttribute("aria-hidden", "true");
  div.innerHTML = `${me ? "" : avatar(o.person)}<div class="msg-body">
      <div class="who">${esc(o.who)}${o.tag ? ` <span class="cut-tag">${esc(o.tag)}</span>` : ""}</div>
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
  // 분기 시작·지시 쓰는 중(slowUntil)에는 한꺼번에 몰아치지 않음: 그 순간의 주인공은 미션과 지시서
  if (first) talk.burst = Date.now() < talk.slowUntil ? 0 : 3;
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

// 8초짜리 반복 데모 (같은 사무실 평면도): 지시서가 사장실 → 부장 → 대리 → 사원 책상으로 날아가며 칸이 떨어지고,
// 보고가 부풀며 되돌아오고, 부장에게 🤥 도장. 문구는 고정 (ChatKHU 호출 없음)
function demoHtml() {
  const P = DEMO_PLAN;
  const cast = [{ rank: "사장", p: null }, ...DEMO.map(p => ({ rank: p.rank, p }))];
  const H = MON_H + 4 + DESK_D + DESK_H;
  const desks = P.desks.map((d, i) => {
    const kind = P.kinds[i], s = planSeat(P, i), [cw, ch] = CHAIR_SIZE[kind];
    const no = i ? rankNo(cast[i].rank) : 0;
    return `<span class="it chair" ${at(s.x - cw / 2, s.y + 8 - (ch + 16), cw, ch + 16, s.y - 1)}>${chairSvg(kind)}</span>
      <span class="it demo-mate rk-${no}${i === 1 ? " demo-liar" : ""}" ${at(s.x, s.y, 0, 0, s.y)}><span class="mate-fig">${chibiSvg(cast[i].p)}</span></span>
      <span class="it desk on" ${at(d.x - d.w / 2, d.y - H, d.w, H, d.y)}>${deskSvg(kind, d.w)}</span>
      <span class="it plate" ${at(d.x, d.y - DESK_H / 2, 0, 0, d.y + 2)}><span class="pl-row"><b class="rank rk-${no}">${esc(cast[i].rank)}</b></span></span>`;
  }).join("");
  const says = [
    ["dd-0 side-l", 96, 52, "오늘 안에 고객께 사과하고 환불해 드려요"],
    ["dd-1 side-r", 340, 42, "고객께 사과하고 환불"],
    ["dd-2 side-c", 190, 220, "고객 환불"],
    ["dd-3 side-c", 404, 220, "환불"],
    ["du-3 up side-c", 404, 220, "환불했어요"],
    ["du-2 up side-c", 190, 220, "완벽하게 처리했습니다!"],
    ["du-1 up below", 318, 164, "대성공! 고객 감동 200%!!"]
  ];
  return `<div class="demo-stage" style="--W:${P.W};--mate:${P.mate}">
    <svg class="plan-bg" viewBox="0 0 ${P.W} ${P.H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${P.bg}</svg>
    <div class="plan-items">${P.items.map(itemHtml).join("")}${desks}</div>
    <div class="demo-track"><div class="demo-lift"><span class="demo-paper"><span class="demo-cells">${"<i></i>".repeat(10)}</span>
      <b class="demo-lim l0">100자</b><b class="demo-lim l1">✂ 50자</b><b class="demo-lim l2">✂ 20자</b><b class="demo-lim l3">✂ 10자</b></span></div></div>
    ${says.map(([cls, x, y, text]) => `<span class="demo-say ${cls}" style="--x:${x};--y:${y}">${esc(text)}</span>`).join("")}
    <span class="demo-stamp stamp" style="--x:438;--y:62">🤥 거짓말</span>
  </div>`;
}

function renderTitle() {
  const demo = document.getElementById("title-demo");
  // 공유 순위표(board-sync)가 늦게 도착해도 부스 대기 화면의 명예의 전당이 따라오게 (setupUI가 15초마다 다시 부름)
  if (demo && !demo.firstElementChild) demo.innerHTML = demoHtml();
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

  // 창업자금 = 봉투 세 장. 창업할 때 한 번만 열고(main.js의 openFunding), 연 뒤에는 바꿀 수 없습니다.
  const opened = Number.isFinite(c.initialCash);
  const funding = FUNDING.map(f => {
    const [icon, label] = fundParts(f);
    const lotto = f.id === "lottery";
    return `
    <label class="fund envelope ${c.funding === f.id ? "picked" : ""} ${opened ? "sealed-off" : ""} ${lotto ? "lotto" : ""}">
      <input type="radio" name="fund" value="${f.id}" ${c.funding === f.id ? "checked" : ""} ${opened ? "disabled" : ""} data-action="fund">
      <span class="env-flap" aria-hidden="true"></span>
      <span class="fund-ico" aria-hidden="true">${esc(icon)}</span>
      <b>${esc(label)}</b>
      <span class="fund-cash">${lotto ? `<strong>???</strong><small>봉투를 열면 금액 공개</small>` : `<strong>${money(f.cash, false)}</strong>`}</span>
      <small class="fund-note">${esc(f.note)}</small>
    </label>`;
  }).join("");

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
    <div class="step-block"><p class="step-label"><span class="step-no">4</span>창업 자금 <span class="hint">봉투 하나를 고르세요</span></p>
    <div class="funds">${funding}</div>
    ${opened ? `<p class="funding-open opened-note"><span class="fo-ico" aria-hidden="true">✉️</span><span>이미 연 봉투: <b>${esc(fundingOf(c).name)} · ${money(c.initialCash, false)}</b><br><small>자금 출처와 금액은 이번 판에 고정됩니다.</small></span></p>` : '<p class="hint fund-hint">창업할 때 봉투를 딱 한 번 엽니다. 받은 돈은 순이익에 포함되지 않아요.</p>'}</div>
  `;
  document.getElementById("btn-found").textContent = opened ? "창업 준비 이어가기" : "✉️ 봉투 열고 창업하기";
  // 입력하는 대로 명함 미리 보기 (보여 주기만, 저장은 main.js)
  box.oninput = () => setTimeout(renderFoundPreview, 0);
  box.onchange = () => setTimeout(renderFoundPreview, 0);
  renderFoundPreview();
}

// "👪 부모님 돈" → ["👪", "부모님 돈"]
function fundParts(f) {
  const [icon, label] = splitIcon(f.name);
  return icon === "⚡" ? ["💰", label] : [icon, label];
}

function renderFoundPreview() {
  const c = game.company;
  const el = document.getElementById("found-preview");
  if (!el) return;
  const f = fundingOf(c);
  const [icon] = fundParts(f);
  const cash = Number.isFinite(c.initialCash) ? money(c.initialCash, false) : f.id === "lottery" ? "봉투 속 ???" : money(f.cash, false);
  el.innerHTML = `<p class="biz-head"><span>사업자 등록증</span><span>No.${String((c.name || "").length * 7 + 101).padStart(4, "0")}</span></p>
    <div class="biz-main"><span class="biz-emoji" aria-hidden="true">${esc(c.emoji || "🏢")}</span>
    <div><b class="biz-name">${esc(c.name || "회사 이름")}</b><small>${esc(c.industry || "업종 미정")}</small></div></div>
    <p class="biz-motto">${c.motto ? `"${esc(c.motto)}"` : "사훈을 정해 주세요"}</p>
    <p class="biz-foot"><span>대표 <b>${esc(c.player || "???")}</b></span><span>${esc(icon)} 자본금 ${esc(cash)}</span></p>
    ${c.name && c.motto && c.industry && c.player ? stamp("승인 대기", "biz-stamp") : ""}`;
}

// ===== ChatKHU 단계 화면 =====

let aiKind = "event";
let aiTimer = null;
let aiStarted = 0; // 이번 ChatKHU 요청을 보낸 시각 (순위표에 다녀와도 기다린 시간이 이어지게)

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
  // 실패해도 복사·붙여넣기 안내는 접어 둡니다: 바로 아래 '다시 시도'와 '연습 모드'가 먼저 보이게
  if (state === "busy") { aiStarted = Date.now(); startAIWait(); }
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
    "💡 회사 매출은 실제 고객·광고·계약에서 나와요",
    `💡 실제 행동을 맞히면 판단 보너스 ${money(JUDGMENT_BONUS)}!`,
    `💡 사원은 지시를 ${rankInfo("사원").chars}자까지만 전달해요`,
    "💡 정직도는 입사 후에야 알 수 있어요",
    "💡 충성심이 0이 되면 짐을 싸서 퇴사해요",
    "💡 사장 필살기는 한 판에 딱 한 번!",
    "💡 보고는 올라갈수록 부풀려져요. 단서를 의심하세요",
    `💡 분기마다 ${money(INVESTMENT_COST, false)} 투자 가능! 영업이익이 흑자면 ${money(INVESTMENT_WIN, false)} 회수`,
    "💡 통장이 마이너스면 새 투자와 회식이 막혀요",
    "💡 창업자금은 통장 잔액일 뿐, 순위는 순이익으로 겨뤄요"
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
  const started = aiStarted || Date.now();
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
    ${businessCard(c)}
    ${envelopeOpen(c)}
    <section class="roadmap" aria-label="1년 로드맵">
      <p class="roadmap-title"><b>1년 = 4개 레벨</b> <span>위기 ${EVENT_ORDER.filter(t => t === "위기").length} · 기회 ${EVENT_ORDER.filter(t => t === "기회").length}</span></p>
      <ol class="plan">${EVENT_ORDER.map((t, i) => `<li class="${t === "기회" ? "chance" : "crisis"}" style="--i:${i}"><small>LEVEL ${i + 1}</small><b>${t === "기회" ? "✨ 기회" : "⚠ 위기"}</b><span>${esc(quarterLabel(i))}</span></li>`).join("")}</ol>
      <p class="hint">통장에서 3개월치 급여를 분기마다 정산합니다. 투자 여부를 고르고, 1년 순이익으로 겨룹니다.</p>
    </section>`;
  if (c.funding === "lottery" && !reduceMotion()) setTimeout(() => { if (document.body.dataset.screen === "screen-news") burst(18); }, 900);
}

// 창업자금 봉투 개봉: 봉투 뚜껑이 열리고 수표가 올라옵니다 (금액은 game.js가 이미 정한 값)
function envelopeOpen(c) {
  const f = fundingOf(c);
  const [icon, label] = fundParts(f);
  return `<section class="funding-open envelope-open ${f.id}" aria-label="창업자금 봉투">
      <div class="eo-stage" aria-hidden="true">
        <svg class="eo-back" viewBox="0 0 160 100"><rect x="2" y="2" width="156" height="96" rx="9"/></svg>
        <svg class="eo-flap" viewBox="0 0 160 62"><path d="M2 10 Q2 2 10 2 L150 2 Q158 2 158 10 L84 58 Q80 61 76 58 Z"/><circle class="eo-seal" cx="80" cy="46" r="9"/></svg>
        <span class="eo-cheque"><small>${esc(icon)} ${esc(label)}</small><b>${money(initialCapital(c), false)}</b>${stamp(f.id === "lottery" ? "당첨!" : "입금", "eo-stamp")}</span>
        <svg class="eo-front" viewBox="0 0 160 100"><path d="M2 34 L76 70 Q80 72 84 70 L158 34 L158 89 Q158 98 149 98 L11 98 Q2 98 2 89 Z"/></svg>
      </div>
      <div class="eo-text">
        <p class="tag">✉️ 창업자금 봉투를 열었습니다</p>
        <h3>${esc(f.name)} · ${money(initialCapital(c), false)}</h3>
        <p class="eo-line">“${esc(c.fundingLine)}”</p>
        <p class="hint">${esc(f.note)}</p>
      </div>
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
      <span class="hire-fig" aria-hidden="true">${chibiSvg(x)}</span><b>${esc(x.name)}</b><small>${esc(rank)} · 분기 급여 ${money(x.salary * COST_PER_SALARY, false)}</small>
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
        <span class="salary"><span aria-hidden="true">💰</span> 분기 급여 <b>${money(x.salary * COST_PER_SALARY, false)}</b></span>
        <button class="${hired ? "secondary" : "primary"} small hire-btn" data-action="hire" data-id="${x.id}" ${!x.interviewed.length ? "disabled" : ""}>${hired ? "채용됨 ✓" : "채용"}</button>
      </div>
      ${hired ? stamp("합격!", `hire-stamp${fresh === x.id ? " fresh" : ""}`) : ""}
    </article>`;
  }).join("");

  seenAsked = { company: c, counts: Object.fromEntries(allCandidates(c).map(x => [x.id, x.interviewed.length])) };

  const cellsTotal = Math.max(budget, used);
  const last = index === HIRE_RANKS.length - 1;
  // PR #14 규칙 (검사는 main.js·game.js가 '면접 끝'에서 함): 최소 MIN_STAFF명, 빈자리는 나머지까지
  const minStaff = minStaffRule();
  const maxVacant = Math.max(0, HIRE_RANKS.length - minStaff);
  const hiredNow = staffOf(c).length;
  const short = Math.max(0, minStaff - hiredNow);
  document.getElementById("interview").innerHTML = `
    <p class="hire-rule"><span class="hr-tag">채용 규칙</span><span>최소 <b>${minStaff}명</b> 채용 · 빈자리는 <b>${maxVacant}자리</b>까지</span></p>
    <div class="tabs" role="list">${tabs}</div>
    <div class="budget-wrap">
      <p class="hire-count ${short ? "short" : "ok"}" aria-live="polite"><span aria-hidden="true">👥</span> 채용 <b>${hiredNow}</b> / ${HIRE_RANKS.length}명 <small>· 최소 ${minStaff}명${short ? "" : " ✓"}</small></p>
      <p class="spent"><span><span aria-hidden="true">💰</span> 분기 급여 <b>${money(used * COST_PER_SALARY, false)}</b></span><span>/ 채용 한도 ${money(budget * COST_PER_SALARY, false)}</span><small class="spent-bank">🏦 통장 ${money(cashBalance(c), false)}</small></p>
      <div class="budget ${used / budget >= .9 ? "tight" : ""}" role="img" aria-label="분기 급여 ${money(used * COST_PER_SALARY, false)} / 채용 한도 ${money(budget * COST_PER_SALARY, false)}">${Array.from({ length: cellsTotal }, (_, k) => `<i class="${k < used ? "on" : ""}"></i>`).join("")}</div>
    </div>
    <h3 class="rank-title rk-${rankNo(rank)}"><span class="rank rk-${rankNo(rank)}">${esc(rank)}</span> 면접 <small>지시를 ${info.chars}자까지 전달 ${cells(info.chars / 10, `rk-${rankNo(rank)}`)}</small></h3>
    <div class="candidates ${entering ? "enter" : ""}">${cards}</div>
    <div class="interview-nav">
      <button class="text-btn" data-action="vacant">이 자리는 비워 두기 (최대 ${maxVacant}자리, 지시가 건너뜀)</button>
      <div class="row">
        ${index > 0 ? `<button class="secondary" data-action="prev">← ${esc(HIRE_RANKS[index - 1])}</button>` : ""}
        <button class="primary ${last && short ? "not-ready" : ""}" data-action="${last ? "done" : "next"}" ${last && short ? 'aria-describedby="hire-short"' : ""}>${last ? "면접 끝, 업무 시작" : `${esc(HIRE_RANKS[index + 1])} 면접 →`}</button>
      </div>
      ${last && short ? `<p class="hire-short" id="hire-short">⚠ 직원이 ${short}명 더 있어야 업무를 시작할 수 있어요 (지금 ${hiredNow}명)</p>` : ""}
    </div>`;
  if (document.body.dataset.screen === "screen-interview") {
    officeSync(true);
    officeFocus(index + 1); // 지금 면접 중인 책상에 "면접 중" 표시
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

// ===== 회사 통장 (돈 계산은 game.js, 여기서는 통장처럼 보여 주기만) =====

// 통장 한 권: 잔액(크게) → 순이익·창업자금 → 이번 분기 출금 예정 → 쓸 수 있는 돈
function businessCard(c) {
  const b = c.business;
  if (!b) return "";
  const state = businessState(c);
  const baseline = calculateBusiness(c, emptyAction());
  return `<section class="business-card card" aria-label="우리 회사 수익구조">
    <h3>🏢 ${esc(b.name)}로 돈을 벌어요</h3>
    <p><b>${esc(b.formula)}</b></p><p>고객: ${esc(b.customer)}</p>
    <p class="hint">${esc(b.rationale)}</p>
    <dl class="business-metrics"><div><dt>현재 건당 수입</dt><dd>${Math.round(b.price * state.price * 10000).toLocaleString()}원</dd></div>
      <div><dt>기초 고객 규모</dt><dd>${Math.round(b.quantity * state.customers).toLocaleString()}${b.type === "ads" ? "회 이용" : b.unit}</dd></div>
      <div><dt>현재 인력 처리 한도</dt><dd>${baseline.capacity.toLocaleString()}${b.type === "ads" ? "회 이용" : b.unit}</dd></div>
      <div><dt>분기 고정비</dt><dd>${money(b.fixed, false)}</dd></div></dl>
    <p class="hint">${b.positioning === "value" ? "가격에 민감한 고객: 할인하면 수요가 크게 늘 수 있어요." : b.positioning === "premium" ? "품질을 중시하는 고객: 요금보다 서비스 경험에 더 민감해요." : "가격과 품질을 함께 보는 고객이에요."}
      ${b.type === "ads" ? "광고를 늘리면 노출은 늘지만 이용자가 이탈할 수 있어요." : "요금을 올리면 건당 수입이 늘지만 고객은 줄 수 있어요."}</p>
    <details><summary>운영 범위와 비용 보기</summary><p class="hint">초기 기준 매출은 1억원, 기본 원가는 건당 수입의 25%예요. 매 분기 수요·처리량에 따라 실제 매출과 원가가 달라지고 급여도 빠집니다.
      고객·광고주 지출 한도는 분기 1억 2,500만원. 한 분기 변화는 최대 30%, 누적 요금은 시작의 70~180%, 광고량은 50~180%예요.
      홍보 1%에 30만원, 품질 1%에 40만원, 원가 절감 1%에 30만원, 시설 1%에 40만원이 들며 실행비는 최대 1,000만원입니다. 절감은 품질도 조금 낮춥니다.
      요금·품질·시설·고객 유지 효과는 다음 분기로 이어져요. 홍보는 해당 분기에만 적용돼요.</p></details>
    </section>`;
}

function economicsDetail(round) {
  const e = round.economics;
  if (!e) return "";
  return `<section class="business-explanation"><p><b>사장 지시 해석:</b> ${esc(actionLabel(round.plan.action))}</p>
    <p class="hint">${esc(round.plan.explanation)} ${round.plan.notes.map(esc).join(" · ")}</p>
    <p><b>직원 실제 행동:</b> ${esc(actionLabel(round.execution.action))}</p>
    <p><b>매출 계산:</b> ${esc(e.formula)} = ${money(e.revenue, false)}</p>
    <p class="hint">${esc(e.demandNote)} 요금·품질·광고량 변화와 이번 시장 수요 ${Math.round(e.market * 100)}%를 반영했어요.</p>
    <p><b>행동 추리:</b> ${round.judgmentCorrect ? "정답!" : "아쉬워요."} 판단 보너스 ${money(round.judgmentBonus)}</p></section>`;
}

function bankCard(c, variant) {
  const round = c.rounds[game.round];
  const balance = cashBalance(c);
  const profit = totalProfit(c);
  const planned = round && !round.choice;
  const salary = payroll(c) * COST_PER_SALARY;
  const planRow = (label, amount, cls) => `<li class="${amount ? "" : "zero"} ${cls || ""}"><span>${label}</span><b>${amount ? money(-amount) : money(0, false)}</b></li>`;
  return `<section class="bank-card ${balance < 0 ? "minus" : ""} ${variant || ""}" aria-label="회사 통장">
    <div class="bank-head"><span class="bank-ico" aria-hidden="true">🏦</span><small>회사 통장</small><span class="bank-owner">${esc(c.name)}</span></div>
    <div class="bank-main">
      <span class="bank-label">잔액</span>
      <strong class="bank-balance ${balance < 0 ? "neg" : ""}" data-cash-balance="${balance}">${money(balance, false)}</strong>
    </div>
    <p class="bank-sub"><span>순이익 <b class="${profit < 0 ? "neg" : profit > 0 ? "pos" : ""}">${money(profit, profit !== 0)}</b></span><span>받은 창업자금 ${money(initialCapital(c), false)}</span></p>
    ${planned ? `<ul class="bank-plan" aria-label="이번 분기 말 출금 예정">
      ${planRow("급여 예정", salary)}${planRow("고정비 예정", c.business?.fixed || 0)}${planRow("투자 예정", round.investment || 0, "invest")}${planRow("회식 예정", round.powerCost || 0)}
      <li class="bank-free ${availableCash(c) < 0 ? "neg" : ""}"><span>예정 지출을 남긴 사용 가능 금액</span><b>${money(availableCash(c), false)}</b></li>
    </ul>` : ""}
    ${balance < 0 ? '<p class="bank-alert"><span class="bank-alert-tag">마이너스</span> 잔액이 부족해 통장이 마이너스입니다. 새 투자와 회식은 제한되며 4분기까지 결산은 계속됩니다.</p>' : ""}
  </section>`;
}

function chartMoney(n) {
  const sign = n < 0 ? "−" : "";
  const v = Math.abs(n);
  return sign + (v >= 10000 ? `${Number((v / 10000).toFixed(2))}억` : `${v.toLocaleString()}만`);
}

// 이번 분기 돈이 왜 이렇게 됐는지 한눈에: 손실이면 가장 큰 지출, 이익이면 가장 큰 수입 (계산은 game.js가 이미 끝낸 값)
// key: rev 매출 · cost 인건비 · inv 투자 손익(출금+회수) · power 회식비 · pen 불이익
function moneyReason(round) {
  if (!round || typeof round.profit !== "number") return null;
  const items = [
    { key: "rev", label: "매출", v: round.revenue ?? round.baseRevenue ?? 0 },
    { key: "cost", label: "인건비", v: -(round.cost || 0) },
    { key: "operation", label: "원가·고정비·실행비", v: -(round.operatingCost || 0) },
    { key: "bonus", label: "판단 보너스", v: round.judgmentBonus || 0 },
    { key: "inv", label: "투자 손익", v: (round.investmentReturn || 0) - (round.investmentCost || 0) },
    { key: "power", label: "회식비", v: -(round.powerCost || 0) },
    { key: "pen", label: round.choice === "closed" ? "영업 중단 손실" : "영업 중단 손실", v: -(round.penalty || 0) }
  ];
  const loss = round.profit < 0;
  const pool = items.filter(x => loss ? x.v < 0 : x.v > 0);
  if (!pool.length) return null;
  const top = pool.reduce((best, x) => (Math.abs(x.v) > Math.abs(best.v) ? x : best));
  return { ...top, loss };
}

function reasonLine(reason) {
  return reason ? `<p class="why-line ${reason.loss ? "neg" : "pos"}"><span class="why-tag">핵심</span><span>이번 분기 가장 큰 ${reason.loss ? "지출" : "수입"}</span><b>${esc(reason.label)} ${money(reason.v)}</b></p>` : "";
}

// 분기별 돈의 흐름 (신문 '경제면'): 통장 잔액 꺾은선 + 분기별 수입·지출 막대 + 고른 분기의 통장 명세
// 분기 버튼(data-finance-quarter)을 누르면 main.js가 이 안(data-finance-chart)을 financeMarkup으로 다시 그립니다.
function financeChart(c, selected) {
  return `<section class="card finance-chart" data-finance-chart>${financeMarkup(c, selected)}</section>`;
}

function financeMarkup(c, selected) {
  const rows = financeHistory(c);
  const index = Number.isInteger(selected) && selected >= 0 && selected < rows.length ? selected : rows.length - 1;
  const values = [initialCapital(c), ...rows.map(r => r.closing)];
  const low = Math.min(0, Math.floor(Math.min(...values) / 1000) * 1000);
  const high = Math.max(1000, Math.ceil(Math.max(...values) / 1000) * 1000);
  const x = i => 92 + i * 112;
  const y = v => 22 + (high - v) / (high - low) * 156;
  const ticks = [high, (high + low) / 2, low];
  const maxFlow = Math.max(1, ...rows.flatMap(r => [r.income, r.expense]));
  const row = rows[index];
  const reason = row ? moneyReason(row.round) : null;
  const top = key => reason && reason.key === key ? " top" : "";
  const pts = values.map((v, i) => `${x(i)},${y(v).toFixed(1)}`);
  const base = y(Math.max(low, Math.min(0, high))).toFixed(1);
  return `<div class="fc-head"><h3>📊 분기별 돈의 흐름</h3><span class="fc-paper" aria-hidden="true">경제면</span></div>
    <p class="hint">잔액에는 창업자금·긴급 용돈이 포함됩니다. 순위는 이를 제외한 순이익으로 계산해요.</p>
    <p class="chart-label"><span aria-hidden="true">🏦</span> 통장 잔액 추이</p>
    <svg class="cash-line" viewBox="0 0 600 222" role="img" aria-label="창업부터 분기별 통장 잔액 변화">
      <title>${esc(values.map((v, i) => `${i ? i + "분기" : "창업"}: ${money(v, false)}`).join(", "))}</title>
      ${ticks.map(v => `<line x1="92" y1="${y(v).toFixed(1)}" x2="${x(ROUNDS)}" y2="${y(v).toFixed(1)}" class="chart-grid"/><text class="tick" x="80" y="${(y(v) + 6).toFixed(1)}" text-anchor="end">${chartMoney(v)}</text>`).join("")}
      ${low < 0 ? `<line x1="92" y1="${y(0).toFixed(1)}" x2="${x(ROUNDS)}" y2="${y(0).toFixed(1)}" class="chart-zero"/>` : ""}
      ${values.length > 1 ? `<path class="cash-area" d="M${pts.join(" L")} L${x(values.length - 1)},${base} L${x(0)},${base} Z"/>` : ""}
      <polyline points="${pts.join(" ")}" class="cash-path"/>
      ${values.map((v, i) => `<circle class="${v < 0 ? "neg" : "pos"} ${i === index + 1 ? "sel" : ""}" cx="${x(i)}" cy="${y(v).toFixed(1)}" r="${i === index + 1 ? 10 : 7}" data-chart-closing="${v}"><title>${i ? i + "분기" : "창업"} ${money(v, false)}</title></circle>`).join("")}
      ${Array.from({ length: ROUNDS + 1 }, (_, i) => `<text class="qx ${i === index + 1 ? "sel" : ""} ${i >= values.length ? "later" : ""}" x="${x(i)}" y="214" text-anchor="middle">${i ? i + "분기" : "창업"}</text>`).join("")}
    </svg>
    <p class="chart-label">수입·지출 비교 <span class="flow-legend"><i class="income" aria-hidden="true"></i>수입 <i class="expense" aria-hidden="true"></i>지출</span></p>
    <div class="flow-bars">${Array.from({ length: ROUNDS }, (_, i) => {
      const r = rows[i];
      return `<div class="flow-quarter ${index === i ? "selected" : ""} ${r ? "" : "later"}" style="--i:${i}">
        <div class="bar-pair">${r ? `<div class="flow-bar income" style="height:${(r.income / maxFlow * 100).toFixed(1)}%" title="수입 ${money(r.income, false)}"></div><div class="flow-bar expense" style="height:${(r.expense / maxFlow * 100).toFixed(1)}%" title="지출 ${money(r.expense, false)}"></div>` : '<span class="bar-later" aria-hidden="true">?</span>'}</div>
        ${r ? `<small class="pos">+${chartMoney(r.income)}</small><small class="neg">−${chartMoney(r.expense)}</small>` : '<small>아직 결산 전</small>'}
        <button class="secondary small" data-finance-quarter="${i}" ${!r ? "disabled" : ""} aria-pressed="${index === i}">${i + 1}분기</button></div>`;
    }).join("")}</div>
    ${row ? `<div class="flow-detail" aria-live="polite"><h4><span aria-hidden="true">🧾</span> ${row.quarter}분기 통장 명세</h4>
      ${reasonLine(reason)}
      <table class="ledger passbook"><tbody>
        <tr><td>기초 잔액</td><td>${money(row.opening, false)}</td></tr>
        <tr class="in${top("rev")}"><td>매출 입금</td><td>${money(row.round.revenue)}</td></tr>
        <tr class="out${top("cost")}"><td>3개월치 급여</td><td>${money(-row.round.cost)}</td></tr>
        <tr class="out"><td>원가·고정비·실행비</td><td>${money(-row.round.operatingCost)}</td></tr>
        <tr><td>회사 영업이익</td><td>${money(row.round.operatingProfit)}</td></tr>
        <tr class="in"><td>사장 판단 보너스</td><td>${money(row.round.judgmentBonus)}</td></tr>
        ${row.round.investmentCost ? `<tr class="out${top("inv")}"><td>투자금 출금</td><td>${money(-row.round.investmentCost)}</td></tr><tr class="in${top("inv")}"><td>투자금 회수</td><td>${money(row.round.investmentReturn)}</td></tr>` : ""}
        ${row.round.powerCost ? `<tr class="out${top("power")}"><td>회식비</td><td>${money(-row.round.powerCost)}</td></tr>` : ""}
        ${row.round.penalty ? `<tr class="out bad${top("pen")}"><td>불이익·영업 중단 손실</td><td>${money(-row.round.penalty)}</td></tr>` : ""}
        ${row.round.support ? `<tr class="in"><td>긴급 용돈 (순이익 제외)</td><td>${money(row.round.support)}</td></tr>` : ""}
        <tr class="sum"><td>마감 잔액</td><td class="${row.closing < 0 ? "neg" : ""}" data-detail-closing="${row.closing}">${money(row.closing, false)}</td></tr>
        <tr><td>이번 분기 순이익</td><td class="${row.profit < 0 ? "neg" : "pos"}">${money(row.profit)}</td></tr>
      </tbody></table></div>` : '<p class="hint">첫 분기를 마치면 수입·지출과 통장 명세를 볼 수 있어요.</p>'}`;
}

function powerPanel(stage) {
  const c = game.company;
  const used = c.powerUsed;
  const staff = staffOf(c);
  return `<section class="power-panel ${stage}" aria-label="사장 필살기">
    <h3><span>⚡ 사장 필살기</span> <small>${used ? "남은 횟수 0 / 1" : "한 판에 한 번"}</small></h3>
    ${used ? `<p class="hint">${quarterLabel(used.round)}에 ${esc(CEO_POWERS.find(p => p.id === used.id).name)} 사용</p>` : ""}
    <div class="power-grid">${CEO_POWERS.map(p => {
      const disabled = used || !staff.length || (stage === "before" ? p.id === "visit" : p.id !== "visit")
        || (p.id === "direct" && staff.length < 2) || (p.id === "dinner" && staff.every(x => x.loyalty === LOYALTY_MAX));
      const [icon, label] = splitIcon(p.name);
      const spent = used && used.id === p.id;
      return `<button type="button" class="secondary power-button ${spent ? "used" : ""}" data-power="${p.id}" title="${esc(p.text)}" ${disabled ? "disabled" : ""}>
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
  document.body.classList.add("choosing"); // 고르는 동안은 파고들기/칭찬하기 한 쌍이 화면의 주인공
  box.innerHTML = `<section class="clues" aria-label="보고와 비교할 추리 단서">
    <h3>📎 보고 옆에 놓인 단서</h3>
    <div class="clue-list">${cluesFor(round, { seed: game.company.gameId || `${game.company.player}|${game.company.name}`, quarter: game.round, event: game.company.events?.[game.round] }).map((text, k) => `<p class="clue" style="--i:${k}"><span class="clue-no" aria-hidden="true">증거 ${k + 1}</span>${esc(text)}</p>`).join("")}</div>
    <p class="hint">매출이 늘었다고 지시대로 했다는 뜻은 아니에요. 보고와 단서로 실제 행동을 추리하세요.</p>
    </section>${powerPanel("after")}
    ${round.power === "visit" ? `<section class="visit-result" aria-label="현장 출동 결과">
      <h3>🔎 사장님이 직접 확인한 현장</h3>
      <p>${esc(round.result.action)}</p><p>${esc(round.result.audit)}</p>
      <p><b>${round.execution.followed ? "지시대로 실행" : "지시와 다르게 실행"}</b> · 영업이익 ${money(round.economics.operatingProfit)}</p>
      ${stamp("현장 확인", "visit-stamp")}
      <p class="hint">확인한 사실을 바탕으로 행동을 고르고 칭찬·추궁을 선택하세요.</p></section>` : ""}
    <fieldset class="action-guess"><legend>직원은 실제로 무엇을 했을까요?</legend>
      <p class="hint">맞히면 판단 보너스 ${money(JUDGMENT_BONUS)}. 회사 영업이익은 실행한 행동에서 이미 결정돼요.</p>
      ${round.guessOptions.map((a, i) => `<label><input type="radio" name="action-guess" data-guess value="${i}" ${round.guess === i ? "checked" : ""}> <span>${esc(actionLabel(a))}</span></label>`).join("")}
    </fieldset>`;
  if (round.power === "visit") {
    sfx("stamp");
    const m = office.mates.get(0);
    if (m) { mateFx(m, "🔎", 1600); m.el.classList.add("hop"); setTimeout(() => m.el.classList.remove("hop"), 700); }
  }
}

let seenQuarter = null;
let seenPower = null;
let seenInvest = null;

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

// 휴대폰에서 지시서(#order)가 아래 큰 버튼(지시 내리기)에 가려 있으면, 지시서 아래 끝이 버튼 위에 오도록 패널만 스크롤.
// 포커스는 주지 않음(키보드가 저절로 뜨지 않게). 사장님이 이미 스크롤했거나 쓰는 중이면 건드리지 않음
function showOrderAboveDock() {
  if (!officeIsStrip()) return;
  const panel = document.getElementById("screen-event");
  const order = document.getElementById("order");
  const dock = panel && panel.querySelector(".cta-dock");
  if (!panel || !panel.classList.contains("active") || !order || order.disabled || !dock) return;
  if (document.activeElement === order || panel.scrollTop > 4 || panel.scrollHeight <= panel.clientHeight) return;
  const tr = order.getBoundingClientRect(), dr = dock.getBoundingClientRect(), pr = panel.getBoundingClientRect();
  const need = tr.bottom + 8 - dr.top;
  if (need <= 0) return;
  const comp = order.closest(".composer") || order;
  const by = Math.min(need, Math.max(0, comp.getBoundingClientRect().top - pr.top - 8));
  if (by > 0) panel.scrollBy({ top: by, behavior: reduceMotion() ? "auto" : "smooth" });
}

function renderEvent() {
  const c = game.company;
  const ev = c.events[game.round];
  const round = c.rounds[game.round];
  const activeStaff = staffOf(c);
  const chance = ev.type === "기회";
  const balance = cashBalance(c);
  const profit = totalProfit(c);
  const box = document.getElementById("event-box");
  // 투자를 바꾸거나 필살기를 쓰면 main.js가 renderEvent를 다시 부릅니다. 펼쳐 둔 '지난 분기 돈의 흐름'은 그대로 둡니다.
  const foldOpen = !!box.querySelector(".finance-fold[open]") && seenInvest && seenInvest.company === c && seenInvest.round === game.round;
  document.querySelectorAll("#room").forEach(el => el.removeAttribute("id")); // 지난 분기 단톡방 기록은 그대로, 이름표만 뗌
  document.getElementById("event-heading").innerHTML = `<span class="lv">LEVEL ${game.round + 1}<small> / ${ROUNDS}</small></span><span class="lv-name">${esc(quarterLabel(game.round))}</span>`;
  document.getElementById("profit-now").innerHTML = `<span class="pn-chip bank ${balance < 0 ? "neg" : ""}"><i aria-hidden="true">🏦</i>통장 잔액 <b>${money(balance, false)}</b></span>
    <span class="pn-chip"><i aria-hidden="true">💰</i>순이익 <b class="${profit < 0 ? "neg" : profit > 0 ? "pos" : ""}">${money(profit, profit !== 0)}</b></span>
    ${settledRounds(c).length ? `<span class="pn-spark" title="분기별 누적 순이익">${profitChart(c)}</span>` : ""}`;
  const line = transmissionStaff(c);
  const quit = allCandidates(c).filter(x => x.quit).map(x => `<span class="quit-chip">📦 ${esc(x.rank)} ${esc(x.name)}</span>`);
  const chain = line.map(x => `<li class="rk-${rankNo(x.rank)}" title="${esc(x.rank)} ${esc(x.name)} · 충성심 ${x.loyalty}/10">${avatar(x)}<small>${rankInfo(x.rank).chars}</small></li>`).join("");
  const invested = !!round.investment;
  const cantInvest = availableCash(c) + (round.investment || 0) < INVESTMENT_COST;
  const gain = INVESTMENT_WIN - INVESTMENT_COST;
  const lossBack = INVESTMENT_LOSS - INVESTMENT_COST;
  box.innerHTML = `
    <article class="mission ${chance ? "chance" : "crisis"}">
      <p class="mission-tag"><span class="alert">${chance ? "✨ CHANCE" : "⚠ WARNING"}</span><span>이번 분기 목표</span></p>
      <h3>${esc(ev.title)}</h3>
      <p class="mission-text">${esc(ev.text)}</p>
      <p class="goal-line"><span>🎯 고객과 비용을 관리해 영업이익 만들기</span><span>💸 분기 급여 <b>${money(payroll(c) * COST_PER_SALARY, false)}</b></span></p>
    </article>
    ${businessCard(c)}
    <div class="composer">
      <label class="field order-field"><span class="composer-head">📣 사장님 지시 <span class="counter" data-for="order">${round.order.length} / ${ORDER_MAX}</span></span>
        <textarea id="order" maxlength="${ORDER_MAX}" rows="3" ${!activeStaff.length ? "disabled" : ""} placeholder="예: 요금을 10% 내려 고객을 모아. / 광고량을 20% 줄여 이용자를 늘려.">${esc(round.order)}</textarea>
      </label>
      ${activeStaff.length ? orderMeter(line) : ""}
      ${activeStaff.length ? `<div class="chain-row"><span class="hint">전달 순서</span><ol class="chain-mini">
        <li class="rk-0">${avatar(null)}<small>${ORDER_MAX}</small></li>${chain}</ol></div>` : ""}
    </div>
    <section class="money-desk ${activeStaff.length ? "" : "closed"}" aria-label="이번 분기 투자와 회사 통장">
      ${activeStaff.length ? `<fieldset class="invest-choice">
        <legend><span aria-hidden="true">💸</span> 이번 분기, 돈을 굴릴까요?</legend>
        <div class="invest-grid">
          <label class="invest-option keep ${!invested ? "picked" : ""}">
            <input type="radio" name="investment" data-invest="no" ${!invested ? "checked" : ""}>
            <span class="iv-ico" aria-hidden="true">🛡️</span>
            <span class="iv-text"><b>그대로 운영</b><small>투자금 없이 이번 업무에 집중합니다.</small></span>
            <span class="iv-odds"><em class="even">±0원</em></span>
          </label>
          <label class="invest-option bet ${invested ? "picked" : ""} ${cantInvest ? "locked" : ""}">
            <input type="radio" name="investment" data-invest="yes" ${invested ? "checked" : ""} ${cantInvest ? "disabled" : ""}>
            <span class="iv-ico" aria-hidden="true">📈</span>
            <span class="iv-text"><b>${money(INVESTMENT_COST, false)} 투자</b><small>회사 영업이익이 흑자면 ${money(INVESTMENT_WIN, false)} 회수(${money(gain)}), 적자·본전이면 ${money(INVESTMENT_LOSS, false)} 회수(${money(lossBack)}).</small></span>
            <span class="iv-odds"><em class="pos">흑자 ${money(gain)}</em><em class="neg">적자·본전 ${money(lossBack)}</em></span>
            ${cantInvest ? '<span class="iv-lock">잔액 부족</span>' : ""}
          </label>
        </div>
        <p class="hint">급여·고정비·회식비를 남긴 금액으로 투자합니다. 출금과 회수는 이번 분기 말에 함께 정산해요.</p>
      </fieldset>` : ""}
      ${bankCard(c)}
    </section>
    ${activeStaff.length ? powerPanel("before") : ""}
    ${quit.length ? `<p class="hint quit-list">퇴사: ${quit.join(" ")}</p>` : ""}
    ${!activeStaff.length ? `<p class="choice-result bad">직원이 모두 퇴사해 영업을 중단합니다. 남은 분기마다 매출·인건비는 0원이며, 임대료와 위약금으로 ${money(CLOSED_PENALTY, false)}의 손실이 발생합니다.</p>` : ""}
    ${settledRounds(c).length ? `<details class="finance-fold" ${foldOpen ? "open" : ""}><summary><span aria-hidden="true">📊</span> 지난 분기 돈의 흐름 보기</summary>${financeChart(c)}</details>` : ""}`;
  const order = document.getElementById("order");
  if (order) {
    order.addEventListener("input", () => { paintOrderMeter(order.value.length); talk.slowUntil = Date.now() + 6000; talkTypingShow(""); });
    order.addEventListener("focus", () => { talk.slowUntil = Date.now() + 8000; document.body.classList.add("writing"); });
    order.addEventListener("blur", () => document.body.classList.remove("writing"));
  }
  paintOrderMeter(round.order.length);
  // 투자를 고르면 통장이 들썩 (저장·계산은 main.js와 game.js가 합니다)
  const amount = round.investment || 0;
  if (seenInvest && seenInvest.company === c && seenInvest.round === game.round && seenInvest.amount !== amount) {
    sfx(amount ? "coin" : "tap");
    replay(box.querySelector(".bank-card"), "bump", 600);
    replay(box.querySelector(".invest-option.picked"), "chosen", 600);
    if (amount) { const m = office.mates.get(0); if (m) mateFx(m, "📈", 1400); }
  }
  seenInvest = { company: c, round: game.round, amount };
  const fresh = quarterPop(c, ev);
  if (document.body.dataset.screen === "screen-event" || fresh) {
    talkEnsure();
    officeSync(false);
  }
  if (fresh) {
    // 분기 첫 화면의 주인공은 미션과 지시서: 단톡방 잡담은 몇 초 동안 천천히
    talk.slowUntil = Date.now() + 8000;
    talk.burst = 0;
    talkSystem(`📣 ${quarterLabel(game.round)} 시작 · ${chance ? "✨ 기회" : "⚠ 위기"}: ${ev.title}`);
    setTimeout(() => officeRush(chance ? "✨" : "❗", chance), 80);
    // 짧은 휴대폰 화면: 타이틀 카드가 걷히면 지시서가 큰 버튼 위로 보이게 패널을 살짝 올림
    setTimeout(() => guard(showOrderAboveDock), reduceMotion() ? 950 : 2150);
  }
  // 회식을 쏘면 사무실이 들썩
  const powerKey = round.power ? `${game.round}:${round.power}` : null;
  if (powerKey && seenPower !== powerKey) {
    seenPower = powerKey;
    if (round.power === "dinner") {
      officeHearts(10, ["🍗", "❤", "🎉"]);
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
  bgmScene(on ? "reveal" : "office");
}

// 판정·숫자·퇴사 연출이 이어지는 동안에도 "탭하면 바로 보기"가 보이게 (단톡방 시트가 닫혀 있으면 사무실 위 칩으로)
function revealTail(on) {
  document.body.classList.toggle("reveal-tail", !!on);
  const skip = document.getElementById("talk-skip");
  if (skip) skip.hidden = !on;
}

// 읽을 시간: 글이 길수록 조금 더 (언제든 탭하면 건너뜀)
function readMs(text, base, per, cap) {
  return Math.min(cap, base + Array.from(String(text || "")).length * per);
}

function reportMsg(up, r, k) {
  const isFinal = k === up.length - 1;
  return { person: up[k], who: `${up[k].rank} ${up[k].name}${isFinal ? " → 사장님께" : ""}`, text: r.up[k].say, kind: isFinal ? "final" : "" };
}

// 진실 공개 한 줄. 마지막 직원(가장 짧은 글자 수)은 크게 + "✂ N자" 꼬리표
function truthMsg(staff, r, k) {
  const last = k === staff.length - 1;
  return {
    person: staff[k], who: `${staff[k].rank} ${staff[k].name}`, text: r.down[k].say, kind: r.down[k].lie ? "lie" : "",
    cls: last ? "last" : "", tag: last ? `✂ ${rankInfo(staff[k].rank).chars}자` : ""
  };
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
  guard(() => {
    officeSync(false);
    if (talk.posted !== roundKey()) talkOrder(round.order);
  });
  const room = talkRoom("📈 보고 라인", up.length + 1);
  room.onclick = skipReveal;
  revealUI(true);
  let shown = 0;
  // 연출이 어디서 멈춰도 보고는 모두 보이고, main.js가 기다리는 선택 버튼은 반드시 나옵니다
  try {
    officeBusy();
    officeClearSay();
    await beat(pace(320));
    await officePaper(round.order, chain);
    for (let k = 0; k < up.length; k++) {
      const msg = reportMsg(up, r, k);
      const fl = rankNo(up[k].rank);
      await addBubble(room, msg.who, msg.text, msg.kind, msg.person, () => {
        shown = k + 1;
        officeSay(fl, msg.text, { level: k, up: true, final: msg.kind === "final" });
      }, { hold: readMs(msg.text, 420, 14, 1200) });
    }
  } catch (e) {
    console.warn("보고 연출 오류 (남은 보고를 한꺼번에 보여 줍니다)", e);
    for (let k = shown; k < up.length; k++) room.appendChild(msgNode(reportMsg(up, r, k)));
    talkScroll(true);
  } finally {
    room.classList.remove("playing");
    const fly = office.stage && office.stage.querySelector(".fly");
    if (fly) fly.classList.remove("on");
    revealUI(false);
    document.getElementById("report-wait")?.remove();
  }
  renderDecisionTools();
}

// 파고들기/칭찬하기를 누른 직후 1초 남짓 두구두구.
// 이 겹침 화면을 탭하면 두구두구만 끝납니다 (진실 공개 전체를 건너뛰지 않음). 0.4초 안의 두 번째 탭(더블 탭)은 무시.
async function suspense(choice) {
  const box = document.getElementById("suspense");
  if (!box) return;
  const dig = choice === "dig";
  box.innerHTML = `<div class="suspense-card ${dig ? "dig" : "praise"}">
      <span class="suspense-ico" aria-hidden="true">${dig ? "🔍" : "👏"}</span>
      <p class="suspense-title">${dig ? "꼬치꼬치 캐묻는 중…" : "믿고 칭찬하는 중…"}</p>
      <p class="drum" aria-hidden="true">두구두구두구</p>
      <small>탭하면 바로 공개</small>
    </div>`;
  box.hidden = false;
  revealing = true;
  document.body.classList.add("in-suspense");
  const t0 = performance.now();
  let tapped = () => {};
  const tap = new Promise(resolve => { tapped = resolve; });
  box.onclick = () => { if (performance.now() - t0 > 400) tapped(); };
  // 두 번째 공개부터는 두구두구도 짧게 (0.6초)
  const ms = reduceMotion() ? 500 : quick() ? 600 : SUSPENSE_DELAY;
  guard(() => {
    officeBusy(true);
    if (dig) officeLens(ms); else officeClap();
    sfx("drum", ms);
  });
  await Promise.race([wait(ms), tap]);
  box.hidden = true;
  box.onclick = null;
  document.body.classList.remove("in-suspense");
}

// 실제 지시 라인: 사장 → 직원들. 한 줄씩 읽을 시간을 주고, 거짓말은 흔들리며 도장 쾅
async function truthLine(c, round, r, staff) {
  let room = document.getElementById("room");
  if (!room || !room.closest("#talk")) room = talkRoom("📉 실제 지시 라인", staff.length + 1);
  else room.insertAdjacentHTML("beforeend", roomHead("📉 진실 공개 · 실제 지시 라인", staff.length + 1));
  room.classList.add("truth", "playing");
  room.classList.remove("skipped");
  room.onclick = skipReveal;
  revealUI(true);
  let shown = -1; // -1 = 사장 지시도 아직
  try {
    officeBusy(true);
    officeClearSay();
    officeSpot2(0);
    await addBubble(room, `사장 ${c.player} (나)`, round.order, "ceo", null, () => {
      shown = 0;
      officeSay(0, round.order, {});
    }, { hold: readMs(round.order, 500, 12, 1500) });
    for (let k = 0; k < staff.length; k++) {
      const msg = truthMsg(staff, r, k);
      const fl = rankNo(staff[k].rank);
      const lie = msg.kind === "lie";
      const last = k === staff.length - 1;
      officeSpot2(fl);
      guard(officeUnstamp); // 앞사람 거짓말 도장은 다음 사람이 말할 때 걷힘 (도장은 늘 한 개만)
      await addBubble(room, msg.who, msg.text, msg.kind, msg.person, () => {
        shown = k + 1;
        // 마지막 한 줄(가장 웃긴 줄) 동안은 다른 직원 머리 위 이모지를 숨겨 말풍선·이름표만 또렷하게
        if (last) guard(() => {
          office.el.classList.add("hush");
          office.mates.forEach(m => m.el.classList.toggle("on-air", m.i === fl));
        });
        officeSay(fl, msg.text, { lie, final: last });
        if (lie) officeLie(fl, "🤥 거짓말");
      }, { cls: msg.cls, tag: msg.tag, hold: readMs(msg.text, 650, 28, 2000) + (last ? 700 : 0) });
    }
  } catch (e) {
    console.warn("진실 공개 연출 오류 (남은 줄을 한꺼번에 보여 줍니다)", e);
    if (shown < 0) { room.appendChild(msgNode({ who: `사장 ${c.player} (나)`, text: round.order, kind: "ceo" })); shown = 0; }
    for (let k = shown; k < staff.length; k++) room.appendChild(msgNode(truthMsg(staff, r, k)));
    talkScroll(true);
  }
  guard(() => {
    officeSpot2(null);
    officeUnstamp();
    if (office.el) office.el.classList.remove("hush");
    office.mates.forEach(m => m.el.classList.remove("on-air"));
  });
  room.classList.remove("playing");
}

// 사장님 지시 → 마지막 직원이 들은 말 (캡처해서 자랑하고 싶은 한 장)
function telephoneCard(round, r, staff) {
  const k = staff.length - 1;
  if (k < 0 || !r.down[k]) return "";
  const x = staff[k];
  const say = String(r.down[k].say || "");
  return `<div class="telephone" role="group" aria-label="사장님 지시와 마지막 직원이 들은 말 비교">
      <p class="tel-head"><span aria-hidden="true">📞</span> 사장님 지시 → 마지막 직원이 들은 말</p>
      <div class="tel-row ceo">
        <span class="tel-who">${avatar(null)}<b>사장님 지시</b><small>${Number(Array.from(String(round.order)).length)}자</small></span>
        <p class="tel-text">${esc(round.order)}</p>
      </div>
      <p class="tel-arrow" aria-hidden="true"><span>⬇</span> ${Number(staff.length)}명을 거쳐 ✂ ${Number(rankInfo(x.rank).chars)}자로</p>
      <div class="tel-row last rk-${rankNo(x.rank)} ${r.down[k].lie ? "lie" : ""}">
        <span class="tel-who">${avatar(x)}<b>${esc(x.rank)} ${esc(x.name)}</b><small>${Number(Array.from(say).length)}자</small></span>
        <p class="tel-text">${esc(say)}</p>
        ${r.down[k].lie ? stamp("🤥 거짓말", "tel-stamp") : ""}
      </div>
    </div>`;
}

async function renderTruth() {
  const c = game.company;
  const round = c.rounds[game.round];
  const r = round.result;
  const closed = round.choice === "closed";
  resetSkip();
  revealing = true;
  office.holdQuit = true; // 퇴사자는 진실 공개가 끝나고 직접 걸어 나갈 때까지 자리에 둡니다
  document.body.classList.remove("choosing");
  document.getElementById("decision-tools")?.remove();
  document.getElementById("report-wait")?.remove();
  const resultBox = document.getElementById("result-box");
  const staff = round.chain.map(id => candidateById(c, id)); // 이번 분기에 있던 직원 (퇴사자 포함)
  document.getElementById("result-title").textContent = closed ? "🚪 직원 부재로 영업을 중단했습니다" : round.choice === "dig" ? "🔍 파고들어 보니…" : "👏 칭찬했습니다. 그런데 진실은…";
  document.getElementById("result-lead").textContent = closed ? "직원이 없어 이번 이벤트를 수행하지 못했습니다. 4분기까지 결산은 이어집니다." : "🤥 표시는 일부러 말을 바꾸거나 거짓말한 직원입니다.";
  // 연출(사무실·단톡방·소리·숫자)은 하나하나 감싸서, 어디서 오류가 나도 판정·장부는 그려지고 main.js의 다음 버튼은 나옵니다
  try {
    guard(() => { talkEnsure(); ambientStop(); officeSync(false); });
    if (!closed) await safely(() => suspense(round.choice));

    if (closed) {
      const room = document.getElementById("room");
      if (room) room.hidden = true;
      talkSystem(`🚪 ${quarterLabel(game.round)} · 직원이 아무도 없어 단톡방이 조용합니다`);
    } else {
      await safely(() => truthLine(c, round, r, staff));
    }
    revealUI(false);
    revealing = true; // 판정·숫자·퇴사도 탭하면 바로
    revealTail(true);
    // 마지막 말풍선은 잠깐 더 읽게 두었다가 걷음 (퇴사자가 걸어 나가느라 공개가 길어져도 이름표 위에 남지 않게)
    const sayToken = ++truthSayToken;
    setTimeout(() => { if (sayToken === truthSayToken) guard(officeHideSay); }, pace(2600));

    const upLies = [...staff].reverse().map((x, k) => r.up[k] && r.up[k].lie ? x : null).filter(Boolean);
    const finalLie = !closed && r.up.length && r.up[r.up.length - 1].lie;
    const box = document.createElement("div");
    box.className = "action";
    box.innerHTML = `
      ${!closed ? telephoneCard(round, r, staff) : ""}
      <p class="tag">실제로 한 일</p><p>${esc(r.action)}</p>
      ${!closed ? `<p class="tag">사장님이 받은 보고</p><p class="got-report">"${esc(r.up[r.up.length - 1].say)}"${finalLie ? stamp("반전", "twist-stamp") : ""}</p>` : ""}
      ${upLies.length ? `<p class="tag">보고를 부풀린 직원</p><p>🤥 ${upLies.map(x => esc(x.name)).join(", ")}</p>` : ""}
      ${round.choice === "dig" ? `<p class="tag">🔍 파고들어 알아낸 것</p><p>${esc(r.audit)}</p>` : ""}
      ${!closed ? allHonestNote(r) : ""}`;
    resultBox.appendChild(box);
    guard(() => {
      if (upLies.length) officeLieOneByOne(upLies.map(x => rankNo(x.rank)), "🤥 거짓 보고");
      if (finalLie) sfx("stamp");
      if (!skipping && !reduceMotion()) box.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    await beat(closed ? 0 : pace(500));

    // 장부: 이번 분기 돈의 가장 큰 이유(손실이면 가장 큰 지출, 이익이면 가장 큰 수입)에 형광펜
    const reason = moneyReason(round);
    const cls = (key, base) => {
      const list = [base, reason && reason.key === key ? "top" : ""].filter(Boolean).join(" ");
      return list ? ` class="${list}"` : "";
    };
    const verdict = document.createElement("article");
    verdict.className = `news verdict ${round.success ? "good" : "bad"}`;
    verdict.innerHTML = `
      <p class="paper">경희경제신문 · ${quarterLabel(game.round)} <span>${closed ? "영업 중단 결산" : r.practice ? "연습 모드" : `직원 연기${r.model ? " · " + esc(r.model) : ""}`}</span></p>
      <h3>${esc(r.news)}</h3>
      <div class="verdict-row">
        ${stamp(closed ? "휴업" : round.success ? "승인" : "반려", `verdict-stamp ${round.success ? "ok" : "no"}`)}
        <p class="outcome ${round.success ? "good" : "bad"}">${closed ? "🚪 영업 중단" : round.success ? "✅ 지시대로 실행" : "↪ 지시와 다르게 실행"} <small>${esc(r.reason)}</small></p>
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
      ${economicsDetail(round)}
      ${reasonLine(reason)}
      <table class="ledger">
        <tr${cls("rev")}><td>회사 매출</td><td>${money(round.baseRevenue)}</td></tr>
        <tr${cls("cost")}><td>인건비</td><td>${money(-round.cost)}</td></tr>
        <tr><td>직접 원가</td><td>${money(-(round.economics?.variableCost || 0))}</td></tr>
        <tr><td>고정 운영비</td><td>${money(-(round.economics?.fixedCost || 0))}</td></tr>
        <tr><td>지시 실행비</td><td>${money(-(round.economics?.executionCost || 0))}</td></tr>
        <tr><td><b>회사 영업이익</b></td><td><b>${money(round.operatingProfit)}</b></td></tr>
        <tr><td>사장 판단 보너스</td><td>${money(round.judgmentBonus)}</td></tr>
        ${round.investmentCost ? `<tr${cls("inv")}><td>투자금 출금</td><td>${money(-round.investmentCost)}</td></tr><tr${cls("inv")}><td>투자금 회수</td><td>${money(round.investmentReturn)}</td></tr>` : ""}
        ${round.powerCost ? `<tr${cls("power")}><td>회식 비용</td><td>${money(-round.powerCost)}</td></tr>` : ""}
        ${round.penalty ? `<tr${cls("pen", "bad")}><td>${closed ? "영업 중단 손실 (임대료·위약금)" : "영업 중단 손실"}</td><td>${money(-round.penalty)}</td></tr>` : ""}
        <tr class="sum"><td>이번 분기 순이익</td><td class="${round.profit < 0 ? "neg" : "pos"}"><span class="profit-count">${money(0)}</span></td></tr>
        ${round.support ? `<tr class="support"><td>부모님 긴급 용돈 (순이익 제외)</td><td>${money(round.support)}</td></tr>` : ""}
        <tr class="bank-row"><td><span aria-hidden="true">🏦</span> 통장 잔액</td><td class="${round.closingCash < 0 ? "neg" : ""}">${money(round.closingCash, false)}</td></tr>
      </table>
      ${round.cost ? `<p class="payday ${round.closingCash < 0 ? "minus" : ""}"><span class="payday-ico" aria-hidden="true">💬</span><span><b>직원:</b> ${round.closingCash < 0 ? "사장님, 통장이 마이너스인데… 다음 월급도 지켜 주세요!" : "입금 확인했습니다. 충성!"}</span></p>` : ""}
      ${r.over ? `<p class="note">AI가 글자 수를 ${Number(r.over)}번 넘겨서 잘랐어요</p>` : ""}`;
    resultBox.appendChild(verdict);
    guard(() => {
      sfx("stamp");
      if (!skipping && !reduceMotion()) setTimeout(() => verdict.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
      if (!closed) officeMood(round.success ? "cheer" : "slump");
    });

    const profitEl = verdict.querySelector(".profit-count");
    await safely(async () => {
      await countUp(profitEl, round.profit, pace(900));
      if (round.profit < 0) { replay(profitEl, "drop"); sfx("fail"); }
      else sfx("coin");
      if (round.profit <= BIG_LOSS) shakeScreen();
      if (round.profit >= BIG_WIN) burst(26);
    });
    if (profitEl) profitEl.textContent = money(round.profit);
    guard(renderHud);

    // 판정 다음: 부모님 긴급 용돈(있으면) → 분기별 돈의 흐름 (공개 순서는 main과 같음)
    if (round.support) {
      const note = document.createElement("p");
      note.className = "family-support";
      note.innerHTML = `<span class="fs-phone" aria-hidden="true">📱</span><span class="fs-msg"><b>엄마</b>${esc(`이번이 진짜 마지막이다! 긴급 용돈 ${money(round.support)} 입금.`)}</span>`;
      note.setAttribute("aria-label", `엄마: 이번이 진짜 마지막이다! 긴급 용돈 ${money(round.support)} 입금.`);
      resultBox.appendChild(note);
      sfx("coin");
      await beat(400);
    }
    resultBox.insertAdjacentHTML("beforeend", financeChart(c));

    // 퇴사자는 상자를 들고 동시에 걸어 나갑니다 (아무리 많아도 5초 안쪽, 탭하면 바로)
    const quitters = round.quits.map(label => staff.find(s => `${s.rank} ${s.name}` === label)).filter(Boolean);
    if (quitters.length) {
      await safely(() => Promise.race([
        Promise.all(quitters.map((x, k) => beat(k * 220).then(() => officeQuit(rankNo(x.rank))))),
        beat(5000)
      ]));
    }
  } catch (e) {
    console.warn("진실 공개 오류 (다음 분기로 넘어갈 수 있게 정리합니다)", e);
  } finally {
    revealUI(false);
    revealTail(false);
    revealing = false;
    office.holdQuit = false;
    quickFor = c; // 첫 분기를 끝까지 봤으면 다음 공개부터 빠르게
    document.body.classList.remove("in-suspense");
    const sus = document.getElementById("suspense");
    if (sus) sus.hidden = true;
    guard(officeHideSay); // 공개가 끝나면 무대 말풍선은 반드시 걷음 (퇴사 도장은 그대로)
    guard(() => { officeSync(false); talkEnsure(); officeIdle(); });
    if (!closed) {
      talk.afterLeft = 2;
      ambientStart("after");
    }
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

  const root = document.getElementById("final");
  // 결산 발표가 아직 진행 중인데 같은 회사로 다시 불리면(공유 순위표가 순위를 새로 계산해 board-sync가 다시 부름)
  // 순위 띠만 바꿔 끼우고 발표(두구두구·숫자·별·순위 도장)는 끝까지 이어 갑니다. 순위 띠는 rank-on 전까지 CSS가 숨김
  if (finalShownFor === c && !root.classList.contains("settled") && root.firstElementChild) {
    const old = root.querySelector(".placed-wrap, .placed");
    if (old) {
      const t = document.createElement("div");
      t.innerHTML = banner;
      if (t.firstElementChild) old.replaceWith(t.firstElementChild);
      return;
    }
  }
  finalToken++;
  // #final은 한 판이 끝나도 그대로 남는 요소: 지난 판의 연출 상태(go·stars-on·rank-on)를 지우고 새로 시작
  root.classList.remove("pre", "go", "stars-on", "rank-on", "settled");
  root.innerHTML = `
    <h2 class="sr-only">1년 결산</h2>
    ${banner}
    <div class="front">
      <div class="front-col">
      <article class="news win front-page ${profit < 0 ? "loss" : "gain"}">
        <div class="masthead"><span>1년 결산 특별호</span><b>경희경제신문</b><span>${esc(today())}</span></div>
        <p class="paper">사장님 특별호 · ${esc(c.industry)} <span>${isPractice(c) ? "연습 모드" : "회사 수익 결산"}</span></p>
        <h3 class="front-headline">${esc(ending.headline)}</h3>
        <div class="ending-line">
          <p class="tag">올해의 사장 유형</p>
          ${stamp(ending.title, "ending-stamp")}
        </div>
        <p class="ending-text">${esc(ending.text)}</p>
        <div class="front-grid">
          <div class="front-money">
            <p class="tag">1년 누적 수익 <small>순이익 · 순위 기준</small></p>
            <p class="score big ${profit < 0 ? "neg" : "pos"}"><span class="total-count">${money(0)}</span></p>
            <p class="hint">회사 영업이익 ${money(c.rounds.reduce((n, r) => n + r.operatingProfit, 0))} · 판단 보너스 ${money(c.rounds.reduce((n, r) => n + r.judgmentBonus, 0))}</p>
            <p class="stars" aria-label="별 ${finalStars(profit)}개">${[1, 2, 3].map(k => `<span class="star ${k <= finalStars(profit) ? "on" : ""}" style="--k:${k}">★</span>`).join("")}</p>
            <p class="hint">칭찬 ${c.rounds.filter(r => r.choice === "praise").length}회 · 추궁 ${c.rounds.filter(r => r.choice === "dig").length}회 · 재직 직원 ${staffOf(c).length}명</p>
          </div>
          <div class="front-company">
            ${companyTitle(c)}
          </div>
          ${bankCard(c, "on-paper")}
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
      ${financeChart(c)}
      </div>
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
  finalKind = !staffOf(c).length ? "dark" : profit >= 0 ? "party" : "pack";
  // 같은 회사를 다시 그리는 경우(공유 순위표가 순위를 새로 계산해 board-sync가 다시 부름 등)는 두구두구 없이 바로 결과
  const again = finalShownFor === c;
  finalShownFor = c;
  if (again) finalSettle(root, profit);
  else finalShow(c, profit, placed, finalToken);
}

// 결산 신문의 별 기준 (1년 순이익, 만원). 연출용 꾸밈일 뿐 game.js 규칙·순위와는 무관합니다.
// 팀이 매출·급여 밸런스를 바꾸면 이 숫자만 고치세요: ★ 흑자 · ★★ 3,000만원 이상 · ★★★ 8,000만원 이상
const FINAL_STAR_LINES = [0, 3000, 8000];

function finalStars(profit) {
  return FINAL_STAR_LINES.filter(line => profit >= line).length;
}

let finalKind = null;     // 결산 사무실 에필로그: party | pack | dark
let finalShownFor = null; // 결산 발표 연출을 이미 보여 준 회사

// 결산 화면을 연출 없이 최종 상태로 (건너뛰기·다른 화면으로 갔다 오기·다시 그리기·연출 오류 모두 여기로)
function finalSettle(root, profit) {
  const total = root.querySelector(".total-count");
  if (total) total.textContent = money(profit);
  root.classList.remove("pre");
  root.classList.add("go", "stars-on", "rank-on", "settled");
  const pop = document.getElementById("final-pop");
  if (pop) pop.hidden = true;
  revealing = false;
  guard(() => {
    if (finalKind && document.body.dataset.screen === "screen-final" && document.body.classList.contains("with-office")) officeEpilogue(finalKind);
    renderHud();
  });
}

// '결산 발표' 연출: 두구두구 → 신문이 돌며 들어옴 → 숫자 → 별 → 순위 쾅 (탭하면 건너뜀)
async function finalShow(c, profit, placed, token) {
  const root = document.getElementById("final");
  const live = () => token === finalToken && game.company === c && (document.body.dataset.screen || "screen-final") === "screen-final";
  // 중간에 다른 화면으로 가면(순위표 등) 그 자리에서 최종 상태로: 돌아왔을 때 0만원·순위 없음으로 남지 않게
  const bail = () => { if (token === finalToken) finalSettle(root, profit); };
  resetSkip();
  revealing = true;
  root.classList.add("pre");
  try {
    await beat(0);
    if (!live()) return bail();
    guard(() => { if (document.body.classList.contains("with-office")) { officeSync(false); officeEpilogue(finalKind); } });
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
    if (!live()) return bail();
    root.classList.remove("pre");
    root.classList.add("go");
    sfx("whoosh");
    await beat(650);
    sfx("stamp");
    await countUp(root.querySelector(".total-count"), profit, 1400);
    if (!live()) return bail();
    root.classList.add("stars-on");
    guard(renderHud);
    if (profit >= 0) { sfx("fanfare"); burst(24); } else sfx("fail");
    await beat(500);
    if (!live()) return bail();
    root.classList.add("rank-on");
    if (placed) sfx("stamp");
    if (placed && placed.rank <= 3) setTimeout(() => burst(26), 200);
    revealing = false;
  } catch (e) {
    console.warn("결산 연출 오류 (최종 화면으로 바로 갑니다)", e);
    bail();
  }
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
// opts (선택): hold = 다음 말풍선까지 읽을 시간(ms), cls = 말풍선에 붙일 클래스, tag = 이름 옆 꼬리표
async function addBubble(room, who, text, kind, person, onShow, opts) {
  const o = opts || {};
  const fast = skipping || reduceMotion();
  if (!fast && kind !== "ceo") {
    const typing = document.createElement("div");
    typing.className = "msg typing";
    typing.innerHTML = `${avatar(person)}<div class="msg-body"><div class="who">${esc(who)} <span class="typing-label">입력 중…</span></div>
      <div class="line"><div class="bubble"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></div></div></div>`;
    room.appendChild(typing);
    talkScroll(true);
    if (person) officeTyping(person, true);
    await beat(pace(TYPING_DELAY));
    typing.remove();
  }
  const div = msgNode({ person, who, text, kind, cls: o.cls, tag: o.tag });
  room.appendChild(div);
  talkNew(div);
  if (onShow) onShow();
  if (fast) return;
  sfx(kind === "lie" ? "lie" : "pop");
  if (kind === "lie") replay(room, "thud", 500);
  const hold = pace(o.hold || BUBBLE_DELAY);
  await beat(kind === "lie" ? hold + pace(380) : hold);
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
  document.addEventListener("pointerdown", () => { if (sound.on) { audio(); bgmSync(); } }, { capture: true, passive: true });
  document.addEventListener("keydown", () => { if (sound.on && !sound.ctx) { audio(); bgmSync(); } }, { capture: true });
  document.addEventListener("visibilitychange", bgmSync);
  document.addEventListener("click", e => {
    const b = e.target.closest("button, .fund, .invest-option");
    if (!b || b.disabled || b.id === "btn-sound") return;
    sfx(b.classList.contains("primary") || b.classList.contains("choice-btn") ? "tapBig" : "tap");
  }, true);
  const soundBtn = document.getElementById("btn-sound");
  if (soundBtn) soundBtn.addEventListener("click", () => {
    sound.on = !sound.on;
    try { localStorage.setItem("kcb_sound", sound.on ? "on" : "off"); } catch {}
    if (sound.on) { audio(); sfx("tapBig"); }
    bgmSync();
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
  // 부스 대기 화면(타이틀)이 오래 떠 있어도 명예의 전당이 공유 순위표를 따라가게 (바뀐 게 없으면 다시 그리지 않음)
  setInterval(() => {
    const s = document.getElementById("screen-found");
    if (!document.hidden && s && s.classList.contains("active") && s.classList.contains("intro")) guard(renderTitle);
  }, 15000);
}

setupUI();
