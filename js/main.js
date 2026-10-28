// 담당 D: 버튼과 흐름 연결
// 각 파일의 기능을 순서대로 이어 붙이는 곳입니다.

document.getElementById("budget-total").textContent = BUDGET;
renderCompany(0);
renderCompany(1);

// 채용, 해고 버튼 (회사 칸 안의 버튼을 한 번에 처리)
document.querySelectorAll(".company").forEach(box => {
  box.addEventListener("click", e => {
    const index = Number(box.dataset.company);

    if (e.target.classList.contains("add")) {
      const rank = box.querySelector("select").value;
      const persona = box.querySelector("input").value;
      const error = hire(index, rank, persona);
      if (error) return alert(error);
      renderCompany(index);
    }

    if (e.target.classList.contains("remove")) {
      fire(index, Number(e.target.dataset.id));
      renderCompany(index);
    }
  });
});

document.getElementById("btn-to-crisis").addEventListener("click", () => {
  if (game.companies.some(c => c.staff.length === 0)) {
    return alert("두 회사 모두 직원을 한 명 이상 뽑아 주세요.");
  }
  renderCrisis(pickCrisis());
  showScreen("screen-crisis");
});

document.querySelectorAll("textarea").forEach(t => {
  updateCounter(t);
  t.addEventListener("input", () => updateCounter(t));
});

document.getElementById("btn-run").addEventListener("click", async () => {
  const orders = [0, 1].map(i => document.getElementById(`order-${i}`).value.trim());
  if (orders.some(o => o.length === 0)) return alert("두 사장님 모두 지시를 적어 주세요.");

  const btn = document.getElementById("btn-run");
  btn.disabled = true;
  document.getElementById("verdict").innerHTML = "";
  showScreen("screen-result");

  try {
    const chains = await Promise.all([0, 1].map(i =>
      runChain(game.companies[i], orders[i], game.crisis)));
    await Promise.all([0, 1].map(i => renderMessenger(i, chains[i])));
    renderVerdict(chains.map(c => score(c, game.crisis)));
  } catch (err) {
    alert("문제가 생겼어요: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("btn-restart").addEventListener("click", () => {
  resetGame();
  document.querySelectorAll("textarea").forEach(t => { t.value = ""; updateCounter(t); });
  renderCompany(0);
  renderCompany(1);
  showScreen("screen-hire");
});
