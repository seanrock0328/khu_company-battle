// 담당 A: 화면 그리기
// 계산은 game.js에 맡기고, 여기서는 보여주기만 합니다.

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo(0, 0);
}

// 채용 화면의 회사 칸 하나를 그립니다.
function renderCompany(index) {
  const company = game.companies[index];
  const box = document.querySelector(`.company[data-company="${index}"]`);

  const options = RANKS.filter(r => r.name !== "사장")
    .map(r => `<option value="${r.name}">${r.name} (${r.chars}자, 비용 ${r.cost})</option>`)
    .join("");

  const list = chainOf(company)
    .map(s => `<li>${s.rank} · ${escapeHtml(s.persona)}
      <button class="remove" data-id="${s.id}">해고</button></li>`)
    .join("");

  box.innerHTML = `
    <h3>${company.name}</h3>
    <p class="spent">쓴 예산 ${spent(company)} / ${BUDGET}</p>
    <div class="row">
      <select>${options}</select>
      <input maxlength="${PERSONA_MAX}" placeholder="성격 (예: 밈 장인)">
      <button class="add">채용</button>
    </div>
    <ul>${list || "<li>아직 직원이 없어요</li>"}</ul>
  `;
}

function renderCrisis(crisis) {
  document.getElementById("crisis-card").innerHTML =
    `<h3>${crisis.title}</h3><p>${crisis.text}</p>`;
}

// 사내 메신저: 말풍선을 하나씩 시간차로 띄웁니다.
async function renderMessenger(index, messages) {
  const box = document.getElementById(`messenger-${index}`);
  box.innerHTML = `<h3>${game.companies[index].name} 단톡방</h3>`;
  for (const m of messages) {
    const div = document.createElement("div");
    div.className = "msg" + (m.ceo ? " ceo" : "");
    div.innerHTML = `<div class="who">${escapeHtml(m.who)}</div>
      <div class="bubble">${escapeHtml(m.text)}</div>`;
    box.appendChild(div);
    await wait(600);
  }
}

function renderVerdict(scores) {
  const [a, b] = scores;
  const winner = a === b ? "무승부!" : `${game.companies[a > b ? 0 : 1].name} 승리!`;
  document.getElementById("verdict").innerHTML =
    `<h3>분기 결산</h3><p>A사 ${a}점 · B사 ${b}점</p><p><b>${winner}</b></p>`;
}

function updateCounter(textarea) {
  const span = document.querySelector(`.counter[data-for="${textarea.id}"]`);
  span.textContent = `${textarea.value.length} / ${textarea.maxLength}`;
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 사용자가 쓴 글을 화면에 넣을 때 꼭 거치기 (태그가 실행되는 것 방지)
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
