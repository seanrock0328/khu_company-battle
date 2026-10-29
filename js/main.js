// 담당 D: 버튼과 흐름 연결
// 창업 → (ChatKHU) 창업 뉴스 → 채용 → 위기 → (ChatKHU) 지시 전달·보고 → 진실 공개 → 결산·순위

let aiMode = "founding"; // ChatKHU 화면이 지금 어느 단계용인지
let lastPlacedAt = null; // 방금 플레이한 기록 (순위표에서 강조)

function startGame() {
  resetGame();
  game.companies.forEach(c => (c.cards = drawCards()));
  game.companies.forEach((c, i) => renderFound(i));
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
    if (field === "player" || field === "name" || field === "motto") {
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

// 자동 연결: 요청문을 ChatKHU API로 바로 보내고 결과를 적용
document.getElementById("btn-auto").addEventListener("click", async () => {
  const errorBox = document.getElementById("ai-error");
  errorBox.textContent = "";
  setAutoBusy(true);
  try {
    const answer = await callChatKHU(document.getElementById("ai-request").value);
    // 결과를 붙여넣기 칸에도 남겨 둡니다 (형식이 틀렸을 때 확인용)
    document.getElementById("ai-response").value = answer;
    if (aiMode === "founding") applyFounding(answer, getModel());
    else applyBattle(answer, getModel());
  } catch (err) {
    errorBox.textContent = err.message;
    setAutoBusy(false);
    return;
  }
  setAutoBusy(false);
  afterAI();
});

document.getElementById("btn-key-save").addEventListener("click", () => {
  const key = document.getElementById("key-input").value.trim();
  if (!key && !getApiKey()) return toast("API 키를 붙여넣어 주세요.");
  saveApiSettings(key, document.getElementById("model-select").value);
  renderAutoBox();
  toast("저장했어요. 이제 'ChatKHU로 바로 만들기'를 누르세요.");
});

document.getElementById("btn-key-edit").addEventListener("click", () => renderAutoBox(true));

document.getElementById("btn-key-clear").addEventListener("click", () => {
  clearApiKey();
  renderAutoBox();
  toast("이 브라우저에서 API 키를 지웠어요.");
});

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
    if (aiMode === "founding") applyFounding(text, "");
    else applyBattle(text, "");
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
  game.companies.forEach((c, i) => renderHire(i));
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
  if (empty) return toast("직원을 한 명 이상 뽑아 주세요.");
  renderCrisisBoxes();
  document.querySelectorAll("#crisis-boxes textarea").forEach(t =>
    t.addEventListener("input", () => updateCounter(t, ORDER_MAX)));
  showScreen("screen-crisis");
});

document.getElementById("btn-run").addEventListener("click", () => {
  const orders = game.companies.map((c, i) => document.getElementById(`order-${i}`).value.trim());
  if (orders.some(o => !o)) return toast("사장님, 지시를 적어 주세요.");
  game.companies.forEach((c, i) => (c.order = orders[i]));
  aiMode = "battle";
  renderAI(aiMode);
  showScreen("screen-ai");
});

// ===== 결과 =====

const revealBtn = document.getElementById("btn-reveal");
const restartBtn = document.getElementById("btn-restart");
const resultBoardBtn = document.getElementById("btn-result-board");

async function showResult() {
  document.getElementById("result-title").textContent = "사장님께 보고가 올라왔습니다";
  document.getElementById("result-lead").textContent = "직원들이 일을 마치고 보고했습니다. 정말 이렇게 잘 됐을까요?";
  document.getElementById("verdict").innerHTML = "";
  revealBtn.hidden = true;
  restartBtn.hidden = true;
  resultBoardBtn.hidden = true;
  showScreen("screen-result");
  await renderReports();
  revealBtn.hidden = false;
}

revealBtn.addEventListener("click", async () => {
  revealBtn.hidden = true;
  await renderTruth();
  const placed = recordResult(game.companies[0]); // 연습 모드면 null
  lastPlacedAt = placed ? placed.at : null;
  renderVerdict(placed);
  restartBtn.hidden = false;
  resultBoardBtn.hidden = false;
  document.getElementById("verdict").scrollIntoView({ behavior: "smooth" });
});

restartBtn.addEventListener("click", startGame);

// ===== 순위표 =====

let screenBeforeBoard = "screen-found";

function openBoard() {
  const current = document.querySelector(".screen.active");
  if (current && current.id !== "screen-board") screenBeforeBoard = current.id;
  renderBoard(lastPlacedAt);
  showScreen("screen-board");
}

document.getElementById("btn-board").addEventListener("click", openBoard);
resultBoardBtn.addEventListener("click", openBoard);

document.getElementById("btn-board-back").addEventListener("click", () => {
  // 결과 화면에서 왔으면 다음 사람 차례로, 아니면 하던 화면으로
  if (screenBeforeBoard === "screen-result" && !restartBtn.hidden) startGame();
  else showScreen(screenBeforeBoard);
});

// 초기화는 실수 방지를 위해 두 번 눌러야 합니다
const clearBtn = document.getElementById("btn-board-clear");
let clearArmed = false;
clearBtn.addEventListener("click", () => {
  if (!clearArmed) {
    clearArmed = true;
    clearBtn.textContent = "정말 지울까요? 한 번 더 누르면 전부 삭제돼요";
    setTimeout(() => { clearArmed = false; clearBtn.textContent = "순위표 초기화"; }, 4000);
    return;
  }
  clearBoard();
  lastPlacedAt = null;
  clearArmed = false;
  clearBtn.textContent = "순위표 초기화";
  renderBoard(null);
  toast("순위표를 비웠어요.");
});

startGame();
