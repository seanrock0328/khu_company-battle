// 담당 A: 화면 그리기
// 계산은 game.js, AI는 ai.js에 맡기고 여기서는 보여주기만 합니다.
// 사용자가 쓴 글이나 AI가 쓴 글은 반드시 esc()를 거쳐서 넣기!

const BUBBLE_DELAY = 500; // 말풍선이 하나씩 뜨는 간격 (ms)

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

function renderSettingsButton() {
  const btn = document.getElementById("btn-settings");
  const model = CHATKHU_MODELS.find(m => m.id === getModel());
  btn.textContent = hasAI()
    ? `🔌 ChatKHU · ${model ? model.name.replace(/ \(.*\)/, "") : getModel()} · ${aiSourceLabel()}`
    : "⚠️ ChatKHU 연결";
  btn.classList.toggle("warn", !hasAI());
}

function companyTitle(c) {
  return `<div class="ctitle">
    <span class="emoji">${esc(c.emoji)}</span>
    <div><b>${esc(c.name)}</b><small>${esc(c.industry)} · 사장 ${esc(c.player)}</small></div>
  </div>
  <p class="motto">사훈 "${esc(c.motto)}"</p>`;
}

// ===== 창업 =====

function renderFound() {
  const c = game.company;
  const industry = c.industry
    ? `<div class="industry-card">
         <span class="emoji">${esc(c.emoji)}</span>
         <div><small>ChatKHU가 뽑은 업종</small><b>${esc(c.industry)}</b></div>
       </div>
       <button class="text-btn" data-action="roll" ${c.rolls >= MAX_ROLLS ? "disabled" : ""}>
         ${c.rolls >= MAX_ROLLS ? "다시 뽑기 사용함" : "🎲 다시 뽑기 (1회)"}</button>`
    : `<button class="roll-btn" data-action="roll">🎲 ChatKHU로 업종 뽑기</button>`;

  const funding = FUNDING.map(f => `
    <label class="fund ${c.funding === f.id ? "picked" : ""}">
      <input type="radio" name="fund" value="${f.id}" ${c.funding === f.id ? "checked" : ""} data-action="fund">
      <b>${f.name}</b><span>인건비 예산 ${f.budget}</span><small>${f.note}</small>
    </label>`).join("");

  document.getElementById("found-box").innerHTML = `
    <label class="field">사장님 닉네임 <span class="hint">(순위표에 나와요)</span>
      <input data-field="player" maxlength="${PLAYER_MAX}" value="${esc(c.player)}" placeholder="예: 경희왕">
    </label>
    <p class="field-label">업종</p>
    ${industry}
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

function renderAIScreen(step) {
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
}

// ===== 창업 뉴스 =====

function renderFoundingNews() {
  const c = game.company;
  document.getElementById("founding-news").innerHTML = `
    <article class="news">
      <p class="paper">경희경제신문 <span>${c.foundingByAI ? `ChatKHU 작성${c.foundingModel ? " · " + esc(c.foundingModel) : ""}` : "연습 모드"}</span></p>
      <h3>${esc(c.news)}</h3>
      ${companyTitle(c)}
      <p class="detail">${esc(c.detail)}</p>
    </article>
    <div class="card teaser">
      <p>이번 분기, <b>위기 2번과 기회 1번</b>이 찾아옵니다.</p>
      <p class="hint">버틸 직원을 뽑으러 갑시다. 인건비 예산은 ${budgetOf(c)}입니다.</p>
    </div>`;
}

// ===== 면접 =====

function statBar(label, value, cls) {
  return `<div class="stat ${cls || ""}"><span>${label}</span>
    <div class="bar"><div style="width:${value * 10}%"></div></div><b>${value}</b></div>`;
}

function renderInterview(index) {
  const c = game.company;
  const rank = HIRE_RANKS[index];
  const info = rankInfo(rank);
  const used = payroll(c);
  const budget = budgetOf(c);

  const tabs = HIRE_RANKS.map((r, i) => {
    const hired = c.hires[r] ? candidateById(c, c.hires[r]) : null;
    return `<button class="tab ${i === index ? "current" : ""} ${hired ? "filled" : ""}" data-action="tab" data-i="${i}">
      ${r}<small>${hired ? esc(hired.name) : "공석"}</small></button>`;
  }).join("");

  const cards = c.candidates[rank].map(x => {
    const hired = c.hires[rank] === x.id;
    return `
    <article class="candidate ${hired ? "hired" : ""}">
      <div class="cand-head">
        <b>${esc(x.name)}</b>
        <span class="chip">${x.mbti}</span>
        <span class="chip ${x.secure >= 50 ? "secure" : "avoid"}">${attachmentLabel(x)}</span>
      </div>
      <p class="intro">"${esc(x.intro)}"</p>
      ${statBar("능력", x.skill)}
      ${statBar("운", x.luck, "luck")}
      <div class="stat hidden-stat"><span>정직</span><div class="bar"><div></div></div><b>???</b></div>
      <div class="qa">
        <p class="q">Q. 우리 회사에서 무엇을 하고 싶나요?</p>
        <p class="a">${esc(x.answer)}</p>
      </div>
      <div class="cand-foot">
        <span class="salary">연봉 <b>${x.salary}</b></span>
        <button class="${hired ? "secondary" : "primary"} small" data-action="hire" data-id="${x.id}">${hired ? "채용됨 ✓" : "채용"}</button>
      </div>
    </article>`;
  }).join("");

  const last = index === HIRE_RANKS.length - 1;
  document.getElementById("interview").innerHTML = `
    <div class="tabs">${tabs}</div>
    <div class="budget-wrap">
      <div class="budget"><div style="width:${Math.min(100, used / budget * 100)}%"></div></div>
      <p class="spent">인건비 ${used} / ${budget} · ${fundingOf(c).name}</p>
    </div>
    <h3 class="rank-title">${rank} 면접 <small>지시를 ${info.chars}자까지 전달</small></h3>
    <div class="candidates">${cards}</div>
    <div class="row center">
      <button class="text-btn" data-action="vacant">이 자리는 비워 두기 (지시가 건너뜀)</button>
    </div>
    <div class="row center">
      ${index > 0 ? `<button class="secondary" data-action="prev">← ${HIRE_RANKS[index - 1]}</button>` : ""}
      <button class="primary" data-action="${last ? "done" : "next"}">${last ? "면접 끝, 업무 시작" : `${HIRE_RANKS[index + 1]} 면접 →`}</button>
    </div>`;
}

// ===== 이벤트 =====

function renderEvent() {
  const c = game.company;
  const ev = c.events[game.round];
  document.getElementById("event-heading").textContent = `이벤트 ${game.round + 1} / ${ROUNDS}`;
  const chain = staffOf(c).map(x => `<li><span class="rank">${x.rank}</span>${esc(x.name)} <small>${x.mbti} · ${rankInfo(x.rank).chars}자</small></li>`).join("");
  document.getElementById("event-box").innerHTML = `
    <div class="card">
      ${companyTitle(c)}
      <div class="event ${ev.type === "기회" ? "chance" : "crisis"}">
        <p class="tag">${ev.type === "기회" ? "✨ 기회" : "⚠️ 위기"}</p>
        <h3>${esc(ev.title)}</h3>
        <p>${esc(ev.text)}</p>
      </div>
      <label class="field">사장님 지시
        <span class="counter" data-for="order">0 / ${ORDER_MAX}</span>
        <textarea id="order" maxlength="${ORDER_MAX}" rows="4" placeholder="예: 오늘 안에 해결해. 고객에게는 솔직하게 사과하고, 원인은 내일 아침까지 보고해."></textarea>
      </label>
      <p class="field-label">이 지시를 듣는 순서</p>
      <ol class="chain">${chain}</ol>
      <p class="hint">현재 점수 ${totalScore(c)}점</p>
    </div>`;
}

// ===== 라운드 결과 =====

async function renderReports() {
  const c = game.company;
  const r = c.rounds[game.round].result;
  document.getElementById("result-title").textContent = "사장님께 보고가 올라왔습니다";
  document.getElementById("result-lead").textContent = "직원들이 일을 마치고 보고했습니다. 정말 이렇게 잘 됐을까요?";
  document.getElementById("result-box").innerHTML = `
    <div class="card">
      <div class="messenger" id="room"><p class="room">📈 보고 라인</p></div>
    </div>`;
  const room = document.getElementById("room");
  const up = [...staffOf(c)].reverse();
  for (let k = 0; k < up.length; k++) {
    const isFinal = k === up.length - 1;
    await addBubble(room, `${up[k].rank} ${up[k].name}${isFinal ? " → 사장님께" : ""}`, r.up[k].say, isFinal ? "final" : "");
  }
}

async function renderTruth() {
  const c = game.company;
  const r = c.rounds[game.round].result;
  const staff = staffOf(c);
  document.getElementById("result-title").textContent = "진실 공개";
  document.getElementById("result-lead").textContent = "🤥 표시는 일부러 말을 바꾸거나 거짓말한 직원입니다.";

  const room = document.getElementById("room");
  room.innerHTML = `<p class="room">📉 실제 지시 라인</p>`;
  await addBubble(room, `사장 ${c.player} (나)`, c.rounds[game.round].order, "ceo");
  for (let k = 0; k < staff.length; k++) {
    await addBubble(room, `${staff[k].rank} ${staff[k].name}`, r.down[k].say, r.down[k].lie ? "lie" : "");
  }

  const upLies = [...staff].reverse().map((x, k) => r.up[k].lie ? x : null).filter(Boolean);
  const box = document.createElement("div");
  box.className = "action";
  box.innerHTML = `
    <p class="tag">실제로 한 일</p><p>${esc(r.action)}</p>
    <p class="tag">사장님이 받은 보고</p><p>"${esc(r.up[r.up.length - 1].say)}"</p>
    ${upLies.length ? `<p class="tag">보고를 부풀린 직원</p><p>🤥 ${upLies.map(x => esc(x.name)).join(", ")}</p>` : ""}
    ${allHonestNote(r)}`;
  room.after(box);

  const ev = c.events[game.round];
  const verdict = document.createElement("article");
  verdict.className = "news";
  verdict.innerHTML = `
    <p class="paper">경희경제신문 · ${ev.type} ${game.round + 1} <span>${r.practice ? "연습 모드" : `ChatKHU 판정${r.model ? " · " + esc(r.model) : ""}`}</span></p>
    <h3>${esc(r.news)}</h3>
    <p class="score">${r.score}<small>점</small> <span class="sum">누적 ${totalScore(c)}점</span></p>
    <p class="reason">${esc(r.reason)}</p>
    ${r.over ? `<p class="note">AI가 글자 수를 ${r.over}번 넘겨서 잘랐어요</p>` : ""}`;
  document.getElementById("result-box").appendChild(verdict);
}

function allHonestNote(r) {
  return r.down.some(x => x.lie) || r.up.some(x => x.lie) ? "" : `<p class="tag">이번엔 아무도 거짓말하지 않았습니다 😇</p>`;
}

// ===== 최종 결산 =====

function renderFinal(placed) {
  const c = game.company;
  const twist = fundingTwist(c);
  const staff = staffOf(c);

  // 거짓말왕: 세 라운드 동안 거짓말한 횟수
  const lies = new Map(staff.map(x => [x.id, 0]));
  c.rounds.forEach(round => {
    const r = round.result;
    staff.forEach((x, k) => { if (r.down[k].lie) lies.set(x.id, lies.get(x.id) + 1); });
    [...staff].reverse().forEach((x, k) => { if (r.up[k].lie) lies.set(x.id, lies.get(x.id) + 1); });
  });
  const topLiar = staff.reduce((best, x) => (lies.get(x.id) > (best ? lies.get(best.id) : 0) ? x : best), null);
  const honest = staff.filter(x => lies.get(x.id) === 0);

  const banner = placed
    ? `<p class="placed">${medal(placed.rank)} 전체 <b>${placed.rank}위</b> <span>/ ${placed.total}명</span></p>`
    : `<p class="placed practice">연습 모드가 섞여서 순위에 기록되지 않았어요</p>`;

  const rows = c.rounds.map((round, i) => `
    <li><span class="etype ${c.events[i].type === "기회" ? "chance" : "crisis"}">${c.events[i].type}</span>
      <span class="ename">${esc(c.events[i].title)}<small>${esc(round.result.news)}</small></span>
      <b>${round.result.score}</b></li>`).join("");

  document.getElementById("final").innerHTML = `
    <h2 class="center">최종 결산</h2>
    ${banner}
    <div class="solo">
      <article class="news win">
        <p class="paper">경희경제신문 · 분기 결산</p>
        ${companyTitle(c)}
        <p class="score big">${totalScore(c)}<small>점 / ${ROUNDS * 100}</small></p>
        <ol class="rounds">${rows}</ol>
        ${twist ? `<p class="twist ${twist.kind}">${esc(twist.text)}</p>` : ""}
      </article>
      <div class="card awards">
        ${topLiar ? `<p>🤥 <b>올해의 거짓말왕</b> ${esc(topLiar.rank)} ${esc(topLiar.name)} <small>(${lies.get(topLiar.id)}번, 정직도 ${topLiar.honesty})</small></p>` : ""}
        ${honest.length ? `<p>😇 <b>끝까지 정직했던 직원</b> ${honest.map(x => `${esc(x.name)} <small>(정직도 ${x.honesty})</small>`).join(", ")}</p>` : ""}
        <p class="field-label">직원들의 진짜 정직도</p>
        <ul class="reveal-list">${staff.map(x => `<li><span class="rank">${x.rank}</span>${esc(x.name)} ${statBar("정직", x.honesty, "honest")}</li>`).join("")}</ul>
      </div>
    </div>`;
}

// ===== 순위표 =====

function renderBoard(highlightAt) {
  const list = sortedBoard();
  document.getElementById("board-lead").textContent = list.length
    ? `지금까지 ${list.length}명이 회사를 차렸습니다. 이벤트 3번 점수 합계 순위예요. (이 노트북에 저장)`
    : "아직 기록이 없어요. 첫 번째 사장님이 되어 보세요!";
  document.getElementById("board").innerHTML = list.length ? `
    <ol class="board">
      ${list.map((e, k) => `
        <li class="${k < 3 ? "top" : ""} ${e.at === highlightAt ? "me" : ""}">
          <span class="pos">${medal(k + 1) || k + 1}</span>
          <span class="who">
            <b>${esc(e.player)}</b>
            <small>${esc(e.emoji)} ${esc(e.name)} · ${esc(e.industry)}</small>
            <small class="headline">${esc(e.news)}</small>
          </span>
          <span class="pts">${e.score}<small>점</small></span>
        </li>`).join("")}
    </ol>` : "";
}

function medal(rank) {
  return ["🥇", "🥈", "🥉"][rank - 1] || "";
}

// ===== 설정 =====

function renderSettings() {
  document.getElementById("model-select").innerHTML = CHATKHU_MODELS.map(m =>
    `<option value="${m.id}" ${m.id === getModel() ? "selected" : ""}>${m.name}</option>`).join("");
  document.getElementById("key-input").value = "";
  document.getElementById("key-state").textContent = getApiKey()
    ? "✅ 내 키가 저장되어 있어요. 지금은 팀 서버 대신 내 키로 ChatKHU를 불러요."
    : TEAM_SERVER_URL ? "✅ 팀 서버로 연결돼 있어요. 키를 넣지 않아도 됩니다." : "아직 연결이 없어요. 키를 넣어 주세요.";
  document.getElementById("btn-key-clear").hidden = !getApiKey();
}

// ===== 공통 =====

async function addBubble(room, who, text, kind) {
  const div = document.createElement("div");
  div.className = `msg ${kind}`;
  div.innerHTML = `<div class="who">${esc(who)}${kind === "lie" ? " 🤥" : ""}</div><div class="bubble">${esc(text)}</div>`;
  room.appendChild(div);
  await wait(BUBBLE_DELAY);
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
