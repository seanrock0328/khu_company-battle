// 담당 D: 버튼과 흐름 연결
// 창업 → (ChatKHU) 창업 뉴스 → 채용 → 위기 → (ChatKHU) 지시 전달·보고 → 진실 공개 → 결산

let aiMode = "founding"; // ChatKHU 화면이 지금 어느 단계용인지

function startGame() {
  resetGame();
  game.companies.forEach(c => (c.cards = drawCards()));
  renderFound(0);
  renderFound(1);
  showScreen("screen-found");
}

// ===== 창업 화면 =====

document.querySelectorAll(".company.found").forEach(box => {
  const i = Number(box.dataset.company);

  box.addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const c = game.companies[i];
    if (btn.dataset.action === "pick") {
      const card = c.cards[Number(btn.dataset.k)];
      c.industry = card.name;
      c.emoji = card.emoji;
      renderFound(i);
    }
    if (btn.dataset.action === "reroll" && !c.rerolled) {
      c.cards = drawCards();
      c.rerolled = true;
      c.industry = "";
      c.emoji = "";
      renderFound(i);
    }
  });

  // 입력할 때마다 저장 (다시 그려도 지워지지 않게)
  box.addEventListener("input", e => {
    const field = e.target.dataset.field;
    if (field === "name" || field === "motto") {
      game.companies[i][field] = e.target.value;
      if (field === "motto") box.querySelector(".counter").textContent = `${e.target.value.length} / ${MOTTO_MAX}`;
    }
  });

  box.addEventListener("change", e => {
    if (e.target.dataset.action === "fund") {
      game.companies[i].funding = e.target.value;
      renderFound(i);
    }
  });
});

document.getElementById("btn-found").addEventListener("click", () => {
  for (const c of game.companies) {
    const error = checkFounding(c);
    if (error) return toast(error);
  }
  aiMode = "founding";
  renderAI(aiMode);
  showScreen("screen-ai");
});

// ===== ChatKHU 화면 =====

document.getElementById("btn-copy").addEventListener("click", async () => {
  const area = document.getElementById("ai-request");
  const btn = document.getElementById("btn-copy");
  try {
    await navigator.clipboard.writeText(area.value);
  } catch {
    area.closest("details").open = true;
    area.select();
    document.execCommand("copy");
  }
  btn.textContent = "복사됨! ChatKHU에 붙여넣으세요";
});

document.getElementById("btn-apply").addEventListener("click", () => {
  const text = document.getElementById("ai-response").value.trim();
  const errorBox = document.getElementById("ai-error");
  if (!text) return (errorBox.textContent = "ChatKHU 답변을 붙여넣어 주세요.");
  try {
    if (aiMode === "founding") applyFounding(text);
    else applyBattle(text);
  } catch (err) {
    errorBox.textContent = err.message;
    return;
  }
  afterAI();
});

document.getElementById("btn-practice").addEventListener("click", () => {
  if (aiMode === "founding") practiceFounding();
  else practiceBattle();
  afterAI();
});

function afterAI() {
  if (aiMode === "founding") {
    renderFoundingNews();
    showScreen("screen-news");
  } else {
    showResult();
  }
}

// ===== 창업 뉴스 → 채용 =====

document.getElementById("btn-to-hire").addEventListener("click", () => {
  renderHire(0);
  renderHire(1);
  showScreen("screen-hire");
});

document.querySelectorAll(".company.hire").forEach(box => {
  const i = Number(box.dataset.company);

  const tryHire = () => {
    const rank = box.querySelector('[data-field="rank"]').value;
    const persona = box.querySelector('[data-field="persona"]').value;
    const error = hire(i, rank, persona);
    if (error) return toast(error);
    renderHire(i);
    box.querySelector('[data-field="rank"]').value = rank; // 고르던 직급 유지
  };

  box.addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "preset") {
      box.querySelector('[data-field="persona"]').value = btn.dataset.p;
    }
    if (btn.dataset.action === "hire") tryHire();
    if (btn.dataset.action === "fire") {
      fire(i, Number(btn.dataset.id));
      renderHire(i);
    }
  });

  box.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.dataset.field === "persona") tryHire();
  });
});

// ===== 위기 =====

document.getElementById("btn-to-crisis").addEventListener("click", () => {
  const empty = game.companies.find(c => c.staff.length === 0);
  if (empty) return toast(`${empty.name}: 직원을 한 명 이상 뽑아 주세요.`);
  renderCrisisBoxes();
  document.querySelectorAll("#crisis-boxes textarea").forEach(t =>
    t.addEventListener("input", () => updateCounter(t, ORDER_MAX)));
  showScreen("screen-crisis");
});

document.getElementById("btn-run").addEventListener("click", () => {
  const orders = [0, 1].map(i => document.getElementById(`order-${i}`).value.trim());
  const missing = orders.findIndex(o => !o);
  if (missing >= 0) return toast(`${game.companies[missing].name} 사장님, 지시를 적어 주세요.`);
  game.companies.forEach((c, i) => (c.order = orders[i]));
  aiMode = "battle";
  renderAI(aiMode);
  showScreen("screen-ai");
});

// ===== 결과 =====

const revealBtn = document.getElementById("btn-reveal");
const restartBtn = document.getElementById("btn-restart");

async function showResult() {
  document.getElementById("result-title").textContent = "사장님께 보고가 올라왔습니다";
  document.getElementById("result-lead").textContent = "직원들이 일을 마치고 보고했습니다. 정말 이렇게 잘 됐을까요?";
  document.getElementById("verdict").innerHTML = "";
  revealBtn.hidden = true;
  restartBtn.hidden = true;
  showScreen("screen-result");
  await renderReports();
  revealBtn.hidden = false;
}

revealBtn.addEventListener("click", async () => {
  revealBtn.hidden = true;
  await renderTruth();
  renderVerdict();
  restartBtn.hidden = false;
  document.getElementById("verdict").scrollIntoView({ behavior: "smooth" });
});

restartBtn.addEventListener("click", startGame);

startGame();
