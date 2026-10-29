// 담당 D: 버튼과 흐름 연결
// 창업 → (ChatKHU 업종) → (ChatKHU 창업·후보) → 면접 → [이벤트 → (ChatKHU) → 보고 → 진실 공개] x3 → 최종 결산·순위

let lastPlacedAt = null;   // 방금 플레이한 기록 (순위표에서 강조)
let interviewIndex = 0;    // 지금 면접 중인 직급 번호

function startGame() {
  resetGame();
  interviewIndex = 0;
  renderFound();
  showScreen("screen-found");
}

// ===== ChatKHU 단계 공통 처리 =====
// 키가 있으면 바로 자동으로 부르고, 실패하면 다시 시도 / 붙여넣기 / 연습 모드를 고를 수 있습니다.

let aiStep = null;   // { name, onDone }
let aiToken = 0;     // 오래된 응답이 늦게 도착해도 무시하기 위한 번호

function runAI(name, onDone) {
  aiStep = { name, onDone };
  renderAIScreen(AI_STEPS[name]);
  showScreen("screen-ai");
  if (getApiKey()) autoRunAI();
}

async function autoRunAI() {
  const step = AI_STEPS[aiStep.name];
  const token = ++aiToken;
  setAIState("busy");
  try {
    const answer = await callChatKHU(document.getElementById("ai-request").value);
    if (token !== aiToken) return;
    document.getElementById("ai-response").value = answer; // 형식이 틀렸을 때 확인용
    step.apply(answer, getModel());
  } catch (err) {
    if (token !== aiToken) return;
    setAIState("error", err.message);
    return;
  }
  aiStep.onDone();
}

document.getElementById("btn-ai-retry").addEventListener("click", autoRunAI);
document.getElementById("btn-ai-connect").addEventListener("click", openSettings);

document.getElementById("btn-copy").addEventListener("click", async () => {
  const area = document.getElementById("ai-request");
  try {
    await navigator.clipboard.writeText(area.value);
  } catch {
    area.closest("details").open = true;
    area.select();
    document.execCommand("copy");
  }
  document.getElementById("btn-copy").textContent = "복사됨! ChatKHU에 붙여넣으세요";
});

document.getElementById("btn-apply").addEventListener("click", () => {
  const text = document.getElementById("ai-response").value.trim();
  if (!text) return setAIState("error", "ChatKHU 답변을 붙여넣어 주세요.");
  aiToken++;
  try {
    AI_STEPS[aiStep.name].apply(text, "");
  } catch (err) {
    return setAIState("error", err.message);
  }
  aiStep.onDone();
});

document.getElementById("btn-practice").addEventListener("click", () => {
  aiToken++;
  AI_STEPS[aiStep.name].practice();
  aiStep.onDone();
});

// ===== 창업 =====

const foundBox = document.getElementById("found-box");

foundBox.addEventListener("click", e => {
  const btn = e.target.closest("[data-action]");
  if (!btn || btn.dataset.action !== "roll") return;
  const c = game.company;
  if (c.rolls >= MAX_ROLLS) return;
  runAI("industry", () => {
    c.rolls++;
    renderFound();
    showScreen("screen-found");
  });
});

foundBox.addEventListener("input", e => {
  const field = e.target.dataset.field;
  if (!field) return;
  game.company[field] = e.target.value;
  const counter = foundBox.querySelector(`.counter[data-for="${field}"]`);
  if (counter) counter.textContent = `${e.target.value.length} / ${field === "detail" ? DETAIL_MAX : MOTTO_MAX}`;
});

foundBox.addEventListener("change", e => {
  if (e.target.dataset.action === "fund") {
    game.company.funding = e.target.value;
    renderFound();
  }
});

document.getElementById("btn-found").addEventListener("click", () => {
  const error = checkFounding(game.company);
  if (error) return toast(error);
  makeCandidates(game.company);
  runAI("founding", () => {
    renderFoundingNews();
    showScreen("screen-news");
  });
});

// ===== 면접 =====

document.getElementById("btn-to-interview").addEventListener("click", () => {
  interviewIndex = 0;
  renderInterview(interviewIndex);
  showScreen("screen-interview");
});

document.getElementById("interview").addEventListener("click", e => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const c = game.company;
  const rank = HIRE_RANKS[interviewIndex];
  const go = i => {
    interviewIndex = i;
    renderInterview(i);
    document.getElementById("interview").scrollIntoView({ behavior: "smooth" });
  };

  switch (btn.dataset.action) {
    case "tab": return go(Number(btn.dataset.i));
    case "hire": {
      const error = hireCandidate(c, rank, Number(btn.dataset.id));
      if (error) return toast(error);
      // 뽑으면 다음 직급으로 넘어갑니다
      return interviewIndex < HIRE_RANKS.length - 1 ? go(interviewIndex + 1) : renderInterview(interviewIndex);
    }
    case "vacant":
      hireCandidate(c, rank, null);
      return interviewIndex < HIRE_RANKS.length - 1 ? go(interviewIndex + 1) : renderInterview(interviewIndex);
    case "prev": return go(interviewIndex - 1);
    case "next": return go(interviewIndex + 1);
    case "done":
      if (staffOf(c).length === 0) return toast("직원을 한 명 이상 뽑아 주세요.");
      game.round = 0;
      c.rounds = [];
      return startRound();
  }
});

// ===== 이벤트 라운드 =====

function startRound() {
  game.company.rounds[game.round] = { order: "", result: null };
  renderEvent();
  const area = document.getElementById("order");
  area.addEventListener("input", () => {
    document.querySelector('.counter[data-for="order"]').textContent = `${area.value.length} / ${ORDER_MAX}`;
  });
  showScreen("screen-event");
}

document.getElementById("btn-run").addEventListener("click", () => {
  const order = document.getElementById("order").value.trim();
  if (!order) return toast("사장님, 지시를 적어 주세요.");
  game.company.rounds[game.round].order = order;
  runAI("event", showRoundResult);
});

const revealBtn = document.getElementById("btn-reveal");
const nextBtn = document.getElementById("btn-next");

async function showRoundResult() {
  revealBtn.hidden = true;
  nextBtn.hidden = true;
  showScreen("screen-result");
  await renderReports();
  revealBtn.hidden = false;
}

revealBtn.addEventListener("click", async () => {
  revealBtn.hidden = true;
  await renderTruth();
  nextBtn.textContent = game.round < ROUNDS - 1 ? `이벤트 ${game.round + 2} 받기 →` : "최종 결산 보기";
  nextBtn.hidden = false;
});

nextBtn.addEventListener("click", () => {
  if (game.round < ROUNDS - 1) {
    game.round++;
    return startRound();
  }
  const placed = recordResult(game.company); // 연습 모드가 섞였으면 null
  lastPlacedAt = placed ? placed.at : null;
  renderFinal(placed);
  showScreen("screen-final");
});

document.getElementById("btn-restart").addEventListener("click", startGame);

// ===== 순위표 =====

let screenBeforeBoard = "screen-found";

function openBoard() {
  const current = document.querySelector(".screen.active");
  if (current && current.id !== "screen-board" && current.id !== "screen-settings") screenBeforeBoard = current.id;
  renderBoard(lastPlacedAt);
  showScreen("screen-board");
}

document.getElementById("btn-board").addEventListener("click", openBoard);
document.getElementById("btn-final-board").addEventListener("click", openBoard);

document.getElementById("btn-board-back").addEventListener("click", () => {
  if (screenBeforeBoard === "screen-final") startGame();
  else showScreen(screenBeforeBoard);
});

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

// ===== ChatKHU 연결 설정 =====

let screenBeforeSettings = "screen-found";

function openSettings() {
  const current = document.querySelector(".screen.active");
  if (current && current.id !== "screen-settings") screenBeforeSettings = current.id;
  renderSettings();
  showScreen("screen-settings");
}

document.getElementById("btn-settings").addEventListener("click", openSettings);

document.getElementById("btn-key-save").addEventListener("click", () => {
  const key = document.getElementById("key-input").value.trim();
  if (!key && !getApiKey()) return toast("API 키를 붙여넣어 주세요.");
  saveApiSettings(key, document.getElementById("model-select").value);
  renderSettingsButton();
  toast("저장했어요.");
  showScreen(screenBeforeSettings);
  // ChatKHU 단계에서 왔으면 바로 이어서 실행
  if (screenBeforeSettings === "screen-ai" && aiStep) {
    renderAIScreen(AI_STEPS[aiStep.name]);
    autoRunAI();
  }
});

document.getElementById("btn-key-clear").addEventListener("click", () => {
  clearApiKey();
  renderSettings();
  renderSettingsButton();
  toast("이 브라우저에서 API 키를 지웠어요.");
});

renderSettingsButton();
startGame();
