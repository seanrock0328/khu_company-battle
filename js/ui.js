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
  const season = getSeason();
  const industry = season
    ? `<div class="industry-card">
         <span class="emoji">${esc(c.emoji)}</span>
         <div><small>이번 대결 업종 · 모든 사장님이 같아요</small><b>${esc(c.industry)}</b></div>
       </div>`
    : c.industry
    ? `<div class="industry-card">
         <span class="emoji">${esc(c.emoji)}</span>
         <div><small>ChatKHU가 뽑은 업종</small><b>${esc(c.industry)}</b></div>
       </div>
       <button class="text-btn" data-action="roll" ${c.rolls >= MAX_ROLLS ? "disabled" : ""}>
         ${c.rolls >= MAX_ROLLS ? "다시 뽑기 사용함" : "🎲 다시 뽑기 (1회)"}</button>`
    : `<button class="roll-btn" data-action="roll">🎲 ChatKHU로 업종 뽑기</button>
       <p class="hint">업종은 사장님마다 랜덤이에요. 순위는 업종 상관없이 수익으로 겨룹니다.</p>`;

  const funding = FUNDING.map(f => `
    <label class="fund ${c.funding === f.id ? "picked" : ""}">
      <input type="radio" name="fund" value="${f.id}" ${c.funding === f.id ? "checked" : ""} ${Number.isFinite(c.initialCash) ? "disabled" : ""} data-action="fund">
      <b>${f.name}</b><span>${f.id === "lottery" ? "봉투를 열면 금액 공개" : money(f.cash, false)}</span><small>${f.note}</small>
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
    ${Number.isFinite(c.initialCash) ? `<p class="funding-open">✉️ 이미 연 봉투: ${esc(fundingOf(c).name)} · ${money(c.initialCash, false)}<br><small>자금 출처와 금액은 이번 판에 고정됩니다.</small></p>` : '<p class="hint">창업할 때 봉투를 딱 한 번 엽니다. 받은 돈은 순이익에 포함되지 않아요.</p>'}
  `;
  document.getElementById("btn-found").textContent = Number.isFinite(c.initialCash) ? "창업 준비 이어가기" : "✉️ 봉투 열고 창업하기";
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
    <article class="card funding-open"><p class="tag">✉️ 창업자금 봉투를 열었습니다</p>
      <h3>${esc(fundingOf(c).name)} · ${money(initialCapital(c), false)}</h3>
      <p>“${esc(c.fundingLine)}”</p><p class="hint">${esc(fundingOf(c).note)}</p></article>
    <div class="card teaser">
      <p><b>1년, 4분기</b> 동안 위기 ${EVENT_ORDER.filter(t => t === "위기").length}번과 기회 ${EVENT_ORDER.filter(t => t === "기회").length}번이 찾아옵니다.</p>
      <p class="hint">통장에서 3개월치 급여를 분기마다 정산합니다. 투자 여부를 고르고, 1년 순이익으로 겨룹니다.</p>
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
      <div class="interview-questions" aria-label="${esc(x.name)}에게 할 질문">
        ${INTERVIEW_QUESTIONS.map(q => `<button class="secondary small" data-action="ask" data-id="${x.id}" data-question="${q.id}" aria-pressed="${x.interviewed.includes(q.id)}">${esc(q.label)}${x.interviewed.includes(q.id) ? " ✓" : ""}</button>`).join("")}
      </div>
      ${x.interviewed.length ? x.interviewed.map(id => `<div class="qa">
        <p class="q">Q. ${esc(INTERVIEW_QUESTIONS.find(q => q.id === id).question)}</p>
        <p class="a">${esc(interviewAnswer(x, id))}</p>
      </div>`).join("") : '<p class="hint">질문을 골라 답변을 들어 보세요. 면접 답변이 모두 진실일까요?</p>'}
      <div class="cand-foot">
        <span class="salary">분기 급여 <b>${money(x.salary * COST_PER_SALARY, false)}</b></span>
        <button class="${hired ? "secondary" : "primary"} small" data-action="hire" data-id="${x.id}" ${!x.interviewed.length ? "disabled" : ""}>${hired ? "채용됨 ✓" : "채용"}</button>
      </div>
    </article>`;
  }).join("");

  const last = index === HIRE_RANKS.length - 1;
  document.getElementById("interview").innerHTML = `
    <div class="tabs">${tabs}</div>
    <div class="budget-wrap">
      <div class="budget"><div style="width:${Math.min(100, used / budget * 100)}%"></div></div>
      <p class="spent">분기 급여 ${money(used * COST_PER_SALARY, false)} / 채용 한도 ${money(budget * COST_PER_SALARY, false)} · 통장 ${money(cashBalance(c), false)}</p>
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

function hearts(n) {
  return `<span class="hearts" title="충성심 ${n}/10" aria-label="충성심 ${n}/10">${"♥".repeat(Math.ceil(n / 2))}<span class="empty">${"♥".repeat(5 - Math.ceil(n / 2))}</span> ${n}/10</span>`;
}

function bankCard(c) {
  const round = c.rounds[game.round];
  return `<section class="bank-card" aria-label="회사 통장">
    <div><small>🏦 회사 통장</small><strong class="${cashBalance(c) < 0 ? "neg" : ""}" data-cash-balance="${cashBalance(c)}">${money(cashBalance(c), false)}</strong></div>
    <p>순이익 <b>${money(totalProfit(c))}</b> · 받은 창업자금 ${money(initialCapital(c), false)}</p>
    ${round && !round.choice ? `<p class="hint">급여 예정 ${money(payroll(c) * COST_PER_SALARY, false)} · 투자 예정 ${money(round.investment || 0, false)} · 회식 예정 ${money(round.powerCost || 0, false)}<br>예정 지출을 남긴 사용 가능 금액 <b>${money(availableCash(c), false)}</b></p>` : ""}
    ${cashBalance(c) < 0 ? '<p class="bad">잔액이 부족해 통장이 마이너스입니다. 새 투자와 회식은 제한되며 4분기까지 결산은 계속됩니다.</p>' : ""}
  </section>`;
}

function chartMoney(n) {
  const sign = n < 0 ? "−" : "";
  const v = Math.abs(n);
  return sign + (v >= 10000 ? `${Number((v / 10000).toFixed(2))}억` : `${v.toLocaleString()}만`);
}

function financeChart(c, selected) {
  return `<section class="card finance-chart" data-finance-chart>${financeMarkup(c, selected)}</section>`;
}

function financeMarkup(c, selected) {
  const rows = financeHistory(c);
  const index = Number.isInteger(selected) && selected >= 0 && selected < rows.length ? selected : rows.length - 1;
  const values = [initialCapital(c), ...rows.map(r => r.closing)];
  const low = Math.min(0, Math.floor(Math.min(...values) / 1000) * 1000);
  const high = Math.max(1000, Math.ceil(Math.max(...values) / 1000) * 1000);
  const x = i => 84 + i * 114;
  const y = v => 24 + (high - v) / (high - low) * 150;
  const ticks = [high, (high + low) / 2, low];
  const maxFlow = Math.max(1, ...rows.flatMap(r => [r.income, r.expense]));
  const row = rows[index];
  return `<h3>📊 분기별 돈의 흐름</h3>
    <p class="hint">잔액에는 창업자금·긴급 용돈이 포함됩니다. 순위는 이를 제외한 순이익으로 계산해요.</p>
    <p class="chart-label">통장 잔액 추이</p>
    <svg class="cash-line" viewBox="0 0 600 215" role="img" aria-label="창업부터 분기별 통장 잔액 변화">
      <title>${esc(values.map((v, i) => `${i ? i + "분기" : "창업"}: ${money(v, false)}`).join(", "))}</title>
      ${ticks.map(v => `<line x1="84" y1="${y(v)}" x2="540" y2="${y(v)}" class="chart-grid"/><text x="74" y="${y(v) + 4}" text-anchor="end">${chartMoney(v)}</text>`).join("")}
      ${low < 0 ? `<line x1="84" y1="${y(0)}" x2="540" y2="${y(0)}" class="chart-zero"/>` : ""}
      <polyline points="${values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}" class="cash-path"/>
      ${values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="5" data-chart-closing="${v}"><title>${i ? i + "분기" : "창업"} ${money(v, false)}</title></circle>`).join("")}
      ${Array.from({ length: ROUNDS + 1 }, (_, i) => `<text x="${x(i)}" y="200" text-anchor="middle">${i ? i + "분기" : "창업"}</text>`).join("")}
    </svg>
    <p class="chart-label">수입·지출 비교 <span class="flow-legend"><i class="income"></i>수입 <i class="expense"></i>지출</span></p>
    <div class="flow-bars">${Array.from({ length: ROUNDS }, (_, i) => {
      const r = rows[i];
      return `<div class="flow-quarter ${index === i ? "selected" : ""}">
        <div class="bar-pair">${r ? `<div class="flow-bar income" style="height:${r.income / maxFlow * 100}%" title="수입 ${money(r.income, false)}"></div><div class="flow-bar expense" style="height:${r.expense / maxFlow * 100}%" title="지출 ${money(r.expense, false)}"></div>` : '<span class="hint">예정</span>'}</div>
        ${r ? `<small class="pos">${chartMoney(r.income)}</small><small class="neg">${chartMoney(r.expense)}</small>` : '<small>아직 결산 전</small>'}
        <button class="secondary small" data-finance-quarter="${i}" ${!r ? "disabled" : ""} aria-pressed="${index === i}">${i + 1}분기</button></div>`;
    }).join("")}</div>
    ${row ? `<div class="flow-detail" aria-live="polite"><h4>${row.quarter}분기 통장 명세</h4>
      <table class="ledger"><tbody>
        <tr><td>기초 잔액</td><td>${money(row.opening, false)}</td></tr>
        <tr><td>매출 입금</td><td>${money(row.round.revenue)}</td></tr>
        <tr><td>3개월치 급여</td><td>${money(-row.round.cost)}</td></tr>
        ${row.round.investmentCost ? `<tr><td>투자금 출금</td><td>${money(-row.round.investmentCost)}</td></tr><tr><td>투자금 회수</td><td>${money(row.round.investmentReturn)}</td></tr>` : ""}
        ${row.round.powerCost ? `<tr><td>회식비</td><td>${money(-row.round.powerCost)}</td></tr>` : ""}
        ${row.round.penalty ? `<tr><td>불이익·영업 중단 손실</td><td>${money(-row.round.penalty)}</td></tr>` : ""}
        ${row.round.support ? `<tr><td>긴급 용돈 (순이익 제외)</td><td>${money(row.round.support)}</td></tr>` : ""}
        <tr class="sum"><td>마감 잔액</td><td data-detail-closing="${row.closing}">${money(row.closing, false)}</td></tr>
        <tr><td>이번 분기 순이익</td><td>${money(row.profit)}</td></tr>
      </tbody></table></div>` : '<p class="hint">첫 분기를 마치면 수입·지출과 통장 명세를 볼 수 있어요.</p>'}`;
}

function powerPanel(stage) {
  const c = game.company;
  const used = c.powerUsed;
  const staff = staffOf(c);
  return `<section class="power-panel" aria-label="사장 필살기">
    <h3>⚡ 사장 필살기 <small>${used ? "남은 횟수 0 / 1" : "세 가지 중 한 번만 사용"}</small></h3>
    ${used ? `<p class="hint">${quarterLabel(used.round)}에 ${esc(CEO_POWERS.find(p => p.id === used.id).name)} 사용</p>` : ""}
    <div class="power-grid">${CEO_POWERS.map(p => {
      const disabled = used || !staff.length || (stage === "before" ? p.id === "visit" : p.id !== "visit")
        || (p.id === "direct" && staff.length < 2) || (p.id === "dinner" && staff.every(x => x.loyalty === LOYALTY_MAX));
      return `<button type="button" class="secondary power-button" data-power="${p.id}" ${disabled ? "disabled" : ""}>
        <b>${esc(p.name)}</b><small>${esc(p.when)} · ${esc(p.text)}</small></button>`;
    }).join("")}</div>
  </section>`;
}

function renderDecisionTools() {
  const round = game.company.rounds[game.round];
  const box = document.getElementById("decision-tools");
  box.innerHTML = `<section class="clues" aria-label="보고와 비교할 추리 단서">
    <h3>🗂️ 보고 옆에 놓인 단서</h3>
    ${cluesFor(round).map(text => `<p>${esc(text)}</p>`).join("")}
    <p class="hint">일부 상황만 담긴 단서입니다. 보고와 비교해 보세요. 성공 여부를 확정하는 증거는 아닙니다.</p>
    </section>${powerPanel("after")}
    ${round.power === "visit" ? `<section class="visit-result" aria-label="현장 출동 결과">
      <h3>🔎 사장님이 직접 확인한 현장</h3>
      <p>${esc(round.result.action)}</p><p>${esc(round.result.audit)}</p>
      <p><b>성과 ${round.result.score}점 · ${round.result.score >= SUCCESS_LINE ? "잘 수행함" : "수행 실패"}</b></p>
      <p class="hint">확인한 사실을 바탕으로 칭찬·추궁을 선택하세요.</p></section>` : ""}`;
}

function renderEvent() {
  const c = game.company;
  const ev = c.events[game.round];
  const round = c.rounds[game.round];
  const activeStaff = staffOf(c);
  document.getElementById("event-heading").textContent = `${quarterLabel(game.round)} · ${game.round + 1} / ${ROUNDS}`;
  document.getElementById("profit-now").innerHTML = `통장 잔액 <b>${money(cashBalance(c), false)}</b> · 순이익 ${money(totalProfit(c))}`;
  const chain = transmissionStaff(c).map(x => `<li><span class="rank">${x.rank}</span>${esc(x.name)} ${hearts(x.loyalty)}
    <small>${x.mbti} · ${rankInfo(x.rank).chars}자</small></li>`).join("");
  const quit = allCandidates(c).filter(x => x.quit).map(x => `${x.rank} ${esc(x.name)}`);
  document.getElementById("event-box").innerHTML = `
    <div class="card">
      ${companyTitle(c)}
      ${bankCard(c)}
      <ol class="quarter-track" aria-label="1년 경영 진행도">${EVENT_ORDER.map((type, i) => `<li class="${i < game.round ? "done" : i === game.round ? "current" : ""}" ${i === game.round ? 'aria-current="step"' : ""}>${quarterLabel(i)}<small>${type}${i < game.round ? " ✓" : ""}</small></li>`).join("")}</ol>
      <div class="event ${ev.type === "기회" ? "chance" : "crisis"}">
        <p class="tag">${ev.type === "기회" ? "✨ 기회" : "⚠️ 위기"}</p>
        <h3>${esc(ev.title)}</h3>
        <p>${esc(ev.text)}</p>
      </div>
      ${activeStaff.length ? powerPanel("before") : ""}
      ${activeStaff.length ? `<fieldset class="final-strategy">
        <legend>💸 이번 분기, 돈을 굴릴까요?</legend>
        <label class="strategy-option"><input type="radio" name="investment" data-invest="no" ${!round.investment ? "checked" : ""}><span><b>그대로 운영</b><small>투자금 없이 이번 업무에 집중합니다.</small></span></label>
        <label class="strategy-option"><input type="radio" name="investment" data-invest="yes" ${round.investment ? "checked" : ""} ${availableCash(c) + (round.investment || 0) < INVESTMENT_COST ? "disabled" : ""}><span><b>1,000만원 투자</b><small>성과 60점 이상이면 1,600만원 회수(+600만원), 미달이면 500만원 회수(−500만원).</small></span></label>
        <p class="hint">급여·회식비를 남긴 금액으로 투자합니다. 출금과 회수는 이번 분기 말에 함께 정산해요.</p>
      </fieldset>` : ""}
      <label class="field">사장님 지시
        <span class="counter" data-for="order">${round.order.length} / ${ORDER_MAX}</span>
        <textarea id="order" maxlength="${ORDER_MAX}" rows="4" ${!activeStaff.length ? "disabled" : ""} placeholder="예: 오늘 안에 해결해. 고객에게는 솔직하게 사과하고, 원인은 내일 아침까지 보고해.">${esc(round.order)}</textarea>
      </label>
      <p class="field-label">이 지시를 듣는 순서 <span class="hint">♥ 충성심</span></p>
      <ol class="chain">${chain}</ol>
      ${quit.length ? `<p class="hint">퇴사: ${quit.join(", ")}</p>` : ""}
      ${!activeStaff.length ? `<p class="choice-result bad">직원이 모두 퇴사해 영업을 중단합니다. 남은 분기마다 매출·인건비는 0원이며, 임대료와 위약금으로 ${money(CLOSED_PENALTY, false)}의 손실이 발생합니다.</p>` : `<p class="hint">이번 분기 인건비 ${money(payroll(c) * COST_PER_SALARY, false)} · 성과 ${SUCCESS_LINE}점 이상이면 잘 수행한 것으로 판정합니다.</p>`}
    </div>${settledRounds(c).length ? `<details><summary>📊 지난 분기 돈의 흐름 보기</summary>${financeChart(c)}</details>` : ""}`;
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
    </div><div id="decision-tools"></div>`;
  const room = document.getElementById("room");
  const up = [...c.rounds[game.round].chain].reverse().map(id => candidateById(c, id));
  for (let k = 0; k < up.length; k++) {
    const isFinal = k === up.length - 1;
    await addBubble(room, `${up[k].rank} ${up[k].name}${isFinal ? " → 사장님께" : ""}`, r.up[k].say, isFinal ? "final" : "");
  }
  renderDecisionTools();
}

async function renderTruth() {
  const c = game.company;
  const round = c.rounds[game.round];
  const r = round.result;
  const closed = round.choice === "closed";
  document.getElementById("decision-tools")?.remove();
  const staff = round.chain.map(id => candidateById(c, id)); // 이번 분기에 있던 직원 (퇴사자 포함)
  document.getElementById("result-title").textContent = closed ? "🚪 직원 부재로 영업을 중단했습니다" : round.choice === "dig" ? "🔍 파고들어 보니…" : "👏 칭찬했습니다. 그런데 진실은…";
  document.getElementById("result-lead").textContent = closed ? "직원이 없어 이번 이벤트를 수행하지 못했습니다. 4분기까지 결산은 이어집니다." : "🤥 표시는 일부러 말을 바꾸거나 거짓말한 직원입니다.";

  const room = document.getElementById("room");
  room.innerHTML = `<p class="room">📉 실제 지시 라인</p>`;
  if (!closed) await addBubble(room, `사장 ${c.player} (나)`, round.order, "ceo");
  else room.hidden = true;
  for (let k = 0; k < staff.length; k++) {
    await addBubble(room, `${staff[k].rank} ${staff[k].name}`, r.down[k].say, r.down[k].lie ? "lie" : "");
  }

  const upLies = [...staff].reverse().map((x, k) => r.up[k].lie ? x : null).filter(Boolean);
  const box = document.createElement("div");
  box.className = "action";
  box.innerHTML = `
    <p class="tag">실제로 한 일</p><p>${esc(r.action)}</p>
    ${!closed ? `<p class="tag">사장님이 받은 보고</p><p>"${esc(r.up[r.up.length - 1].say)}"</p>` : ""}
    ${upLies.length ? `<p class="tag">보고를 부풀린 직원</p><p>🤥 ${upLies.map(x => esc(x.name)).join(", ")}</p>` : ""}
    ${round.choice === "dig" ? `<p class="tag">🔍 파고들어 알아낸 것</p><p>${esc(r.audit)}</p>` : ""}
    ${!closed ? allHonestNote(r) : ""}`;
  room.after(box);

  const ev = c.events[game.round];
  const verdict = document.createElement("article");
  verdict.className = "news";
  verdict.innerHTML = `
    <p class="paper">경희경제신문 · ${quarterLabel(game.round)} <span>${closed ? "영업 중단 결산" : r.practice ? "연습 모드" : `ChatKHU 판정${r.model ? " · " + esc(r.model) : ""}`}</span></p>
    <h3>${esc(r.news)}</h3>
    <p class="outcome ${round.success ? "good" : "bad"}">${round.success ? "✅ 잘 수행함" : "❌ 수행 실패"} <small>성과 ${r.score}점 · ${esc(r.reason)}</small></p>
    <p class="choice-result ${round.penalty ? "bad" : round.choice === "dig" && round.success ? "warn" : "good"}">
      ${closed ? "🚪 영업 중단" : round.choice === "dig" ? "🔍 파고들기" : "👏 칭찬하기"} → ${esc(round.loyaltyNote)}</p>
    ${round.quits.length ? `<p class="choice-result bad">🚪 충성심이 바닥난 ${round.quits.map(esc).join(", ")}이(가) 퇴사했습니다</p>` : ""}
    ${round.power ? `<p class="hint">이번 분기 필살기: ${esc(CEO_POWERS.find(p => p.id === round.power).name)}</p>` : ""}
    <table class="ledger">
      <tr><td>기본 매출 (성과 ${r.score}점)</td><td>${money(round.baseRevenue)}</td></tr>
      <tr><td>인건비</td><td>${money(-round.cost)}</td></tr>
      ${round.investmentCost ? `<tr><td>투자금 출금</td><td>${money(-round.investmentCost)}</td></tr><tr><td>투자금 회수</td><td>${money(round.investmentReturn)}</td></tr>` : ""}
      ${round.powerCost ? `<tr><td>회식 비용</td><td>${money(-round.powerCost)}</td></tr>` : ""}
      ${round.penalty ? `<tr class="bad"><td>${closed ? "영업 중단 손실 (임대료·위약금)" : "칭찬 실패 불이익"}</td><td>${money(-round.penalty)}</td></tr>` : ""}
      <tr class="sum"><td>이번 분기 순이익</td><td class="${round.profit < 0 ? "neg" : "pos"}">${money(round.profit)}</td></tr>
      ${round.support ? `<tr><td>부모님 긴급 용돈 (순이익 제외)</td><td>${money(round.support)}</td></tr>` : ""}
      <tr><td>통장 잔액</td><td>${money(round.closingCash, false)}</td></tr>
    </table>
    ${round.cost ? `<p class="payday">💬 직원: ${round.closingCash < 0 ? "사장님, 통장이 마이너스인데… 다음 월급도 지켜 주세요!" : "입금 확인했습니다. 충성!"}</p>` : ""}
    ${r.over ? `<p class="note">AI가 글자 수를 ${r.over}번 넘겨서 잘랐어요</p>` : ""}`;
  document.getElementById("result-box").appendChild(verdict);
  if (round.support) {
    const note = document.createElement("p");
    note.className = "family-support";
    note.textContent = `엄마: 이번이 진짜 마지막이다! 긴급 용돈 ${money(round.support)} 입금.`;
    document.getElementById("result-box").appendChild(note);
  }
  document.getElementById("result-box").insertAdjacentHTML("beforeend", financeChart(c));
}

function allHonestNote(r) {
  return r.down.some(x => x.lie) || r.up.some(x => x.lie) ? "" : `<p class="tag">이번엔 아무도 거짓말하지 않았습니다 😇</p>`;
}

// ===== 최종 결산 =====

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
    ? `<p class="placed">${medal(placed.rank)} ${SHARED_INDUSTRY ? "같은 업종" : "전체"} <b>${placed.rank}위</b> <span>/ ${placed.total}명</span></p>`
    : `<p class="placed practice">연습 모드가 섞여서 순위에 기록되지 않았어요</p>`;

  const rows = c.rounds.map((round, i) => `
    <li><span class="etype ${c.events[i].type === "기회" ? "chance" : "crisis"}">${quarterLabel(i)}</span>
      <span class="ename">${esc(c.events[i].title)} ${round.choice === "closed" ? "🚪" : round.choice === "dig" ? "🔍" : "👏"}${round.success ? "✅" : "❌"}<small>${esc(round.result.news)}</small></span>
      <b class="${round.profit < 0 ? "neg" : "pos"}">${money(round.profit)}</b></li>`).join("");

  document.getElementById("final").innerHTML = `
    <h2 class="center">1년 결산</h2>
    ${banner}
    <div class="solo">
      <article class="news win">
        <p class="paper">경희경제신문 · 1년 결산</p>
        ${companyTitle(c)}
        ${bankCard(c)}
        <p class="tag" style="margin-top:12px">1년 누적 수익</p>
        <p class="score big ${profit < 0 ? "neg" : "pos"}">${money(profit)}</p>
        <ol class="rounds">${rows}</ol>
        ${twist ? `<p class="twist ${twist.kind}">${esc(twist.text)}</p>` : ""}
      </article>
      ${financeChart(c)}
      <article class="news ending-card">
        <p class="paper">경희경제신문 · 사장님 특별호</p>
        <p class="tag">올해의 사장 유형</p><h3 class="ending-title">${esc(ending.title)}</h3>
        <p>${esc(ending.headline)}</p><p>${esc(ending.text)}</p>
        <p class="hint">칭찬 ${c.rounds.filter(r => r.choice === "praise").length}회 · 추궁 ${c.rounds.filter(r => r.choice === "dig").length}회 · 재직 직원 ${staffOf(c).length}명</p>
        <button class="secondary" data-action="copy-ending">📋 내 결산 복사하기</button>
        <details class="ending-share"><summary>공유할 결산 문구 보기</summary>
          <textarea id="ending-share" rows="5" readonly aria-label="공유할 결산 문구">${esc(endingShareText(c))}</textarea></details>
      </article>
      <div class="card awards">
        ${topLiar ? `<p>🤥 <b>1년간의 거짓말왕</b> ${esc(topLiar.rank)} ${esc(topLiar.name)} <small>(${lies.get(topLiar.id)}번, 정직도 ${topLiar.honesty})</small></p>` : ""}
        ${honest.length ? `<p>😇 <b>끝까지 정직했던 직원</b> ${honest.map(x => `${esc(x.name)} <small>(정직도 ${x.honesty})</small>`).join(", ")}</p>` : ""}
        <p class="field-label">직원들의 진짜 정직도와 마지막 충성심</p>
        <ul class="reveal-list">${everyone.map(x => `<li><span class="rank">${x.rank}</span>${esc(x.name)}${x.quit ? " 🚪" : ""}
          ${statBar("정직", x.honesty, "honest")} ${hearts(x.loyalty)}</li>`).join("")}</ul>
      </div>
    </div>`;
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
          <span class="pts ${e.profit < 0 ? "neg" : ""}">${money(e.profit)}</span>
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
