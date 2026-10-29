// 담당 A: 화면 그리기
// 계산은 game.js, AI는 ai.js에 맡기고 여기서는 보여주기만 합니다.
// 사용자가 쓴 글은 반드시 esc()를 거쳐서 넣기!

const BUBBLE_DELAY = 550; // 말풍선이 하나씩 뜨는 간격 (ms)

function showScreen(id) {
  const screen = document.getElementById(id);
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  screen.classList.add("active");
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

function companyBox(selector, i) {
  return document.querySelector(`${selector}[data-company="${i}"]`);
}

function companyTitle(c) {
  return `<div class="ctitle">
    <span class="emoji">${c.emoji}</span>
    <div><b>${esc(c.name)}</b><small>${esc(c.industry)} · 사장 ${esc(c.player)}</small></div>
  </div>
  <p class="motto">사훈 "${esc(c.motto)}"</p>`;
}

// ===== 창업 =====

function renderFound(i) {
  const c = game.companies[i];
  const box = companyBox(".company.found", i);

  const cards = c.cards.map((card, k) => `
    <button class="industry ${c.industry === card.name ? "picked" : ""}" data-action="pick" data-k="${k}">
      <span class="emoji">${card.emoji}</span>${esc(card.name)}
    </button>`).join("");

  const funding = FUNDING.map(f => `
    <label class="fund ${c.funding === f.id ? "picked" : ""}">
      <input type="radio" name="fund-${i}" value="${f.id}" ${c.funding === f.id ? "checked" : ""} data-action="fund">
      <b>${f.name}</b><span>예산 ${f.budget}</span><small>${f.note}</small>
    </label>`).join("");

  box.innerHTML = `
    <label class="field">사장님 닉네임 <span class="hint">(순위표에 나와요)</span>
      <input data-field="player" maxlength="${PLAYER_MAX}" value="${esc(c.player)}" placeholder="예: 경희왕">
    </label>
    <p class="field-label">업종 카드</p>
    <div class="industries">${cards}</div>
    <button class="text-btn" data-action="reroll" ${c.rerolled ? "disabled" : ""}>
      ${c.rerolled ? "다시 뽑기 사용함" : "🎲 다시 뽑기 (1회)"}
    </button>
    <label class="field">회사 이름
      <input data-field="name" maxlength="${NAME_MAX}" value="${esc(c.name)}" placeholder="예: 붕세권">
    </label>
    <label class="field">사훈 <span class="counter">${c.motto.length} / ${MOTTO_MAX}</span>
      <input data-field="motto" maxlength="${MOTTO_MAX}" value="${esc(c.motto)}" placeholder="예: 빠르게 실패하자">
    </label>
    <p class="field-label">창업 자금</p>
    <div class="funds">${funding}</div>
  `;
}

// ===== ChatKHU 연결 화면 =====

function renderAI(mode) {
  const isFounding = mode === "founding";
  document.getElementById("ai-title").textContent =
    isFounding ? "ChatKHU가 창업 소식을 씁니다" : "ChatKHU가 직원들을 연기합니다";
  document.getElementById("ai-lead").textContent = isFounding
    ? "회사의 창업 뉴스와, 곧 닥칠 위기 카드를 ChatKHU가 만들어 줍니다."
    : "지시가 직원들을 거쳐 내려가고, 보고가 부풀려져 올라오는 과정을 ChatKHU가 연기하고 판정합니다.";
  document.getElementById("ai-request").value = isFounding ? buildFoundingRequest() : buildBattleRequest();
  document.getElementById("ai-response").value = "";
  document.getElementById("ai-error").textContent = "";
  document.getElementById("btn-copy").textContent = "요청문 복사하기";
  document.getElementById("auto-status").textContent = "";
  renderAutoBox();
}

// API 키가 저장돼 있으면 "바로 만들기" 버튼을, 없으면 키 입력칸을 보여줍니다
function renderAutoBox(forceSetup) {
  const hasKey = !!getApiKey();
  const setup = forceSetup || !hasKey;
  document.getElementById("auto-ready").hidden = setup;
  document.getElementById("auto-setup").hidden = !setup;
  document.getElementById("btn-key-clear").hidden = !hasKey;
  const select = document.getElementById("model-select");
  select.innerHTML = CHATKHU_MODELS.map(m =>
    `<option value="${m.id}" ${m.id === getModel() ? "selected" : ""}>${m.name}</option>`).join("");
  const model = CHATKHU_MODELS.find(m => m.id === getModel());
  document.getElementById("auto-model-name").textContent = model ? model.name : getModel();
  document.getElementById("key-input").value = "";
}

function setAutoBusy(busy) {
  const btn = document.getElementById("btn-auto");
  btn.disabled = busy;
  btn.textContent = busy ? "ChatKHU가 쓰는 중…" : "ChatKHU로 바로 만들기";
  document.getElementById("btn-practice").disabled = busy;
  document.getElementById("auto-status").textContent = busy ? "보통 10~40초 걸려요." : "";
}

// ===== 창업 뉴스 =====

function renderFoundingNews() {
  document.getElementById("founding-news").innerHTML = game.companies.map(c => `
    <article class="news">
      <p class="paper">경희경제신문 <span>${c.foundingByAI ? `ChatKHU 작성${c.foundingModel ? " · " + esc(c.foundingModel) : ""}` : "연습 모드"}</span></p>
      <h3>${esc(c.news)}</h3>
      ${companyTitle(c)}
    </article>`).join("");
}

// ===== 채용 =====

function renderHire(i) {
  const c = game.companies[i];
  const box = companyBox(".company.hire", i);
  const budget = budgetOf(c);
  const used = spent(c);

  const options = RANKS.filter(r => r.name !== "사장")
    .map(r => `<option value="${r.name}">${r.name} · ${r.chars}자 · 비용 ${r.cost}</option>`)
    .join("");

  const chips = PERSONA_PRESETS
    .map(p => `<button class="chip" data-action="preset" data-p="${esc(p)}">${esc(p)}</button>`).join("");

  const list = chainOf(c).map(s => `
    <li><span class="rank">${s.rank}</span>${esc(s.persona)}
      <button class="text-btn" data-action="fire" data-id="${s.id}">해고</button></li>`).join("");

  box.innerHTML = `
    ${companyTitle(c)}
    <div class="budget"><div style="width:${Math.min(100, used / budget * 100)}%"></div></div>
    <p class="spent">인건비 ${used} / ${budget} (${fundingOf(c).name})</p>
    <div class="row hire-row">
      <select data-field="rank">${options}</select>
      <input data-field="persona" maxlength="${PERSONA_MAX}" placeholder="성격 10자">
      <button class="primary small" data-action="hire">채용</button>
    </div>
    <div class="chips">${chips}</div>
    <ul class="staff">
      <li class="ceo"><span class="rank">사장</span>${esc(c.player)} (나)</li>
      ${list || '<li class="empty">아직 직원이 없어요</li>'}
    </ul>
  `;
}

// ===== 위기 =====

function renderCrisisBoxes() {
  document.getElementById("crisis-boxes").innerHTML = game.companies.map((c, i) => `
    <div class="company">
      ${companyTitle(c)}
      <div class="crisis">
        <p class="tag">⚠️ 위기 카드</p>
        <h3>${esc(c.crisis.title)}</h3>
        <p>${esc(c.crisis.text)}</p>
      </div>
      <label class="field">사장님 지시
        <span class="counter" data-for="order-${i}">0 / ${ORDER_MAX}</span>
        <textarea id="order-${i}" maxlength="${ORDER_MAX}" rows="4" placeholder="예: 슈크림 메뉴 전면에 내세우고 팥은 원가 협상해. 가격은 유지."></textarea>
      </label>
      <p class="hint">이 지시를 듣는 순서: ${chainOf(c).map(s => `${s.rank}(${rankInfo(s.rank).chars}자)`).join(" → ")}</p>
    </div>`).join("");
}

// ===== 결과 1: 부풀려진 보고 =====

async function renderReports() {
  const boxes = document.getElementById("result-boxes");
  boxes.innerHTML = game.companies.map((c, i) => `
    <div class="company">
      ${companyTitle(c)}
      <div class="messenger" id="msg-${i}"><p class="room">📈 보고 라인</p></div>
    </div>`).join("");

  await Promise.all(game.companies.map(async (c, i) => {
    const room = document.getElementById(`msg-${i}`);
    const upChain = [...chainOf(c)].reverse();
    for (let k = 0; k < upChain.length; k++) {
      const s = upChain[k];
      const isFinal = k === upChain.length - 1;
      await addBubble(room, `${s.rank} (${s.persona})${isFinal ? " → 사장님께" : ""}`, c.result.up[k], isFinal ? "final" : "");
    }
  }));
}

// ===== 결과 2: 진실 공개 =====

async function renderTruth() {
  document.getElementById("result-title").textContent = "진실 공개";
  document.getElementById("result-lead").textContent = "사장님 지시는 사실 이렇게 내려갔습니다.";

  await Promise.all(game.companies.map(async (c, i) => {
    const room = document.getElementById(`msg-${i}`);
    room.innerHTML = `<p class="room">📉 실제 지시 라인</p>`;
    await addBubble(room, `사장 ${c.player} (나)`, c.order, "ceo");
    const chain = chainOf(c);
    for (let k = 0; k < chain.length; k++) {
      await addBubble(room, `${chain[k].rank} (${chain[k].persona})`, c.result.down[k], "");
    }
    const action = document.createElement("div");
    action.className = "action";
    action.innerHTML = `<p class="tag">실제로 한 일</p><p>${esc(c.result.action)}</p>
      <p class="tag">사장님이 받은 보고</p><p>"${esc(c.result.up[c.result.up.length - 1])}"</p>`;
    room.after(action);
  }));
}

// ===== 결과 3: 결산과 순위 =====

function renderVerdict(placed) {
  const c = game.companies[0];
  const r = c.result;
  const twist = fundingTwist(c);

  const banner = placed
    ? `<p class="placed">${medal(placed.rank)} 전체 <b>${placed.rank}위</b> <span>/ ${placed.total}명</span></p>`
    : `<p class="placed practice">연습 모드라 순위에 기록되지 않았어요</p>`;

  document.getElementById("verdict").innerHTML = `
    ${banner}
    <div class="solo">
      <article class="news win">
        <p class="paper">경희경제신문 · 결산 <span>${r.practice ? "연습 모드" : `ChatKHU 판정${r.model ? " · " + esc(r.model) : ""}`}</span></p>
        <h3>${esc(r.news)}</h3>
        <p class="score">${r.score}<small>점</small></p>
        <p class="reason">${esc(r.reason)}</p>
        ${twist ? `<p class="twist ${twist.kind}">${esc(twist.text)}</p>` : ""}
        ${r.over ? `<p class="note">AI가 글자 수를 ${r.over}번 넘겨서 잘랐어요</p>` : ""}
        <p class="cname">${c.emoji} ${esc(c.name)} · 사장 ${esc(c.player)}</p>
      </article>
    </div>`;
}

// ===== 순위표 =====

function renderBoard(highlightAt) {
  const list = sortedBoard();
  document.getElementById("board-lead").textContent = list.length
    ? `지금까지 ${list.length}명이 회사를 차렸습니다. 이 노트북에 저장된 기록이에요.`
    : "아직 기록이 없어요. 첫 번째 사장님이 되어 보세요!";

  document.getElementById("board").innerHTML = list.length ? `
    <ol class="board">
      ${list.map((e, k) => `
        <li class="${k < 3 ? "top" : ""} ${e.at === highlightAt ? "me" : ""}">
          <span class="pos">${medal(k + 1) || k + 1}</span>
          <span class="who">
            <b>${esc(e.player)}</b>
            <small>${e.emoji} ${esc(e.name)} · ${esc(e.industry)}</small>
            <small class="headline">${esc(e.news)}</small>
          </span>
          <span class="pts">${e.score}<small>점</small></span>
        </li>`).join("")}
    </ol>` : "";
}

function medal(rank) {
  return ["🥇", "🥈", "🥉"][rank - 1] || "";
}

// ===== 공통 =====

async function addBubble(room, who, text, kind) {
  const div = document.createElement("div");
  div.className = `msg ${kind}`;
  div.innerHTML = `<div class="who">${esc(who)}</div><div class="bubble">${esc(text)}</div>`;
  room.appendChild(div);
  await wait(BUBBLE_DELAY);
}

function updateCounter(input, max) {
  const span = document.querySelector(`.counter[data-for="${input.id}"]`);
  if (span) span.textContent = `${input.value.length} / ${max}`;
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
