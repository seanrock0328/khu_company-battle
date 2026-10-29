// 로그인과 이어하기 (담당: Claude)
// 팀 서버에 저장소(BOARD)가 연결돼 있으면 아이디·비밀번호로 로그인하고, 하던 게임을 어느 기기에서든 이어서 합니다.
// 아이디가 곧 순위표 닉네임이라 이름이 겹치지 않습니다.
// 서버에 저장소가 없으면 이 파일은 아무것도 하지 않고, 게임은 로그인 없이 지금처럼 돌아갑니다.
//
// main.js 다음에 불러옵니다. 기존 함수(startGame, startRound 등)를 감싸서 저장 시점을 잡으므로 다른 파일은 고치지 않습니다.

(function () {
  if (!TEAM_SERVER_URL) return;

  const base = TEAM_SERVER_URL.replace(/\/+$/, "");
  const KEY_TOKEN = "company_battle_token";
  const KEY_ID = "company_battle_id";
  const auth = { enabled: false, id: "", token: "" };

  const keep = {
    get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    remove(k) { try { localStorage.removeItem(k); } catch {} }
  };

  // board-sync.js가 순위 기록을 올릴 때 이 토큰을 씁니다
  window.getAuthToken = () => (auth.enabled ? auth.token : "");

  async function api(path, body) {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `서버 오류 (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ===== 화면 만들기 (index.html, style.css는 건드리지 않고 여기서 붙임) =====

  const style = document.createElement("style");
  style.textContent = `
    .auth-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px; }
    .auth-tabs button { border: 1px solid var(--line); background: var(--bg); border-radius: 10px; padding: 9px; font-weight: 700; }
    .auth-tabs button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
    .resume-card .big { font-size: 20px; font-weight: 900; margin: 4px 0; }
    .resume-card p { margin: 4px 0; }
    .pill.user { background: var(--accent-soft); border-color: #ebc7ce; }
    .locked-note { font-weight: 400; color: var(--muted); font-size: 12px; }
  `;
  document.head.appendChild(style);

  const main = document.querySelector("main");
  main.insertAdjacentHTML("afterbegin", `
    <section id="screen-login" class="screen">
      <h2>사장님 로그인</h2>
      <p class="lead">아이디가 순위표 닉네임이 됩니다. 하던 게임은 어느 기기에서든 이어서 할 수 있어요.</p>
      <div class="solo"><form class="card" id="login-form" autocomplete="on">
        <div class="auth-tabs">
          <button type="button" data-mode="login" class="on">로그인</button>
          <button type="button" data-mode="signup">처음이에요 (가입)</button>
        </div>
        <label class="field">아이디 <span class="hint">2~10자, 한글·영문·숫자·_ · 순위표에 나와요</span>
          <input id="login-id" maxlength="10" autocomplete="username" required>
        </label>
        <label class="field">비밀번호 <span class="hint">4자 이상</span>
          <input id="login-pw" type="password" maxlength="64" autocomplete="current-password" required>
        </label>
        <label class="field" id="login-pw2-wrap" hidden>비밀번호 확인
          <input id="login-pw2" type="password" maxlength="64" autocomplete="new-password">
        </label>
        <p id="login-error" class="error" role="alert"></p>
        <div class="row center"><button type="submit" id="btn-login" class="primary">로그인</button></div>
        <p class="hint">비밀번호는 암호화해서 저장돼요. 학교 계정 비밀번호처럼 다른 곳에서 쓰는 비밀번호는 피해 주세요.</p>
      </form></div>
    </section>
    <section id="screen-resume" class="screen">
      <h2>하던 게임이 있어요</h2>
      <p class="lead">이어서 하거나, 새 회사를 차릴 수 있어요.</p>
      <div class="solo"><div class="card resume-card" id="resume-box"></div></div>
      <div class="row center">
        <button id="btn-resume" class="primary">이어서 하기</button>
        <button id="btn-new-game" class="secondary">새로 시작</button>
      </div>
    </section>
    <section id="screen-auth-wait" class="screen">
      <div class="solo"><div class="card ai-status"><div class="spinner"></div><p>로그인 정보를 확인하는 중…</p></div></div>
    </section>`);

  const topButtons = document.querySelector(".top-buttons");
  const userBtn = document.createElement("button");
  userBtn.className = "pill user";
  userBtn.hidden = true;
  topButtons.prepend(userBtn);

  // ===== 로그인 화면 =====

  let mode = "login";
  const form = document.getElementById("login-form");
  const errBox = document.getElementById("login-error");

  form.querySelectorAll(".auth-tabs button").forEach(b => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    form.querySelectorAll(".auth-tabs button").forEach(x => x.classList.toggle("on", x === b));
    document.getElementById("login-pw2-wrap").hidden = mode !== "signup";
    document.getElementById("login-pw").autocomplete = mode === "signup" ? "new-password" : "current-password";
    document.getElementById("btn-login").textContent = mode === "signup" ? "가입하고 시작" : "로그인";
    errBox.textContent = "";
  }));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const id = document.getElementById("login-id").value.trim();
    const password = document.getElementById("login-pw").value;
    if (mode === "signup" && password !== document.getElementById("login-pw2").value) {
      errBox.textContent = "비밀번호 확인이 달라요.";
      return;
    }
    const btn = document.getElementById("btn-login");
    btn.disabled = true;
    errBox.textContent = "";
    try {
      const data = await api(mode === "signup" ? "/signup" : "/login", { id, password });
      setAuth(data.id, data.token);
      document.getElementById("login-pw").value = "";
      document.getElementById("login-pw2").value = "";
      toast(mode === "signup" ? `환영합니다, ${data.id} 사장님!` : `${data.id} 사장님, 어서 오세요!`);
      await afterLogin();
    } catch (err) {
      errBox.textContent = err.status ? err.message : "서버에 접속하지 못했어요. 인터넷 연결을 확인해 주세요.";
    } finally {
      btn.disabled = false;
    }
  });

  function setAuth(id, token) {
    auth.id = id;
    auth.token = token;
    keep.set(KEY_ID, id);
    keep.set(KEY_TOKEN, token);
    userBtn.textContent = `👤 ${id}`;
    userBtn.hidden = false;
  }

  function clearAuth() {
    auth.id = "";
    auth.token = "";
    keep.remove(KEY_ID);
    keep.remove(KEY_TOKEN);
    userBtn.hidden = true;
  }

  // 로그아웃은 두 번 눌러야 (실수 방지)
  let logoutArmed = false;
  userBtn.addEventListener("click", async () => {
    if (!logoutArmed) {
      logoutArmed = true;
      userBtn.textContent = "로그아웃? 한 번 더 누르기";
      setTimeout(() => { logoutArmed = false; if (auth.id) userBtn.textContent = `👤 ${auth.id}`; }, 3000);
      return;
    }
    logoutArmed = false;
    api("/logout", { token: auth.token }).catch(() => {});
    clearAuth();
    startGame();
    showScreen("screen-login");
    toast("로그아웃했어요. 하던 게임은 저장돼 있어요.");
  });

  // ===== 이어하기 =====

  let pendingSave = null;

  async function afterLogin() {
    let me;
    try {
      me = await api("/me", { token: auth.token });
    } catch (err) {
      if (err.status === 401) { clearAuth(); showScreen("screen-login"); return; }
      toast("저장된 게임을 불러오지 못했어요. 새로 시작합니다.");
      me = { id: auth.id, save: null };
    }
    auth.id = me.id;
    userBtn.textContent = `👤 ${me.id}`;
    pendingSave = me.save && me.save.phase && me.save.company ? me.save : null;
    if (pendingSave) {
      renderResume(pendingSave);
      showScreen("screen-resume");
    } else {
      startGame();
    }
  }

  function renderResume(s) {
    const c = s.company;
    const profit = (c.rounds || []).reduce((sum, r) => sum + (typeof r.profit === "number" ? r.profit : 0), 0);
    const where = { news: "면접 전", event: `${quarterLabel(s.round)} 지시 전`, choice: `${quarterLabel(s.round)} 보고 받음`, settled: `${quarterLabel(s.round)} 결산 끝` }[s.phase] || "";
    document.getElementById("resume-box").innerHTML = `
      ${companyTitle(c)}
      <p class="big">${esc(where)}</p>
      <p>누적 수익 <b class="${profit < 0 ? "neg" : "pos"}">${money(profit)}</b> · 저장 ${new Date(s.savedAt).toLocaleString("ko-KR")}</p>`;
  }

  document.getElementById("btn-resume").addEventListener("click", () => {
    if (pendingSave) resume(pendingSave);
  });

  let newArmed = false;
  document.getElementById("btn-new-game").addEventListener("click", e => {
    if (!newArmed) {
      newArmed = true;
      e.target.textContent = "저장된 게임이 지워져요. 한 번 더 누르기";
      setTimeout(() => { newArmed = false; e.target.textContent = "새로 시작"; }, 3000);
      return;
    }
    newArmed = false;
    e.target.textContent = "새로 시작";
    pendingSave = null;
    api("/save-clear", { token: auth.token }).catch(() => {});
    startGame();
  });

  function resume(s) {
    game.company = s.company;
    game.round = s.round;
    nextCandidateId = Math.max(nextCandidateId, s.nextCandidateId || 1);
    pendingSave = null;
    switch (s.phase) {
      case "news":
        renderFoundingNews();
        showScreen("screen-news");
        break;
      case "event":
        startRound();
        break;
      case "choice":
        showRoundResult();
        break;
      case "settled":
        if (game.round < ROUNDS - 1) {
          game.round++;
          startRound();
        } else {
          const placed = recordResult(game.company);
          lastPlacedAt = placed ? placed.at : null;
          renderFinal(placed);
          showScreen("screen-final");
        }
        break;
      default:
        startGame();
    }
    toast("이어서 시작합니다!");
  }

  // ===== 저장 시점 (기존 함수 감싸기) =====

  function save(phase) {
    if (!auth.enabled || !auth.token) return;
    const snapshot = {
      v: 1, phase, savedAt: Date.now(), round: game.round,
      nextCandidateId, company: game.company
    };
    api("/save", { token: auth.token, save: snapshot }).catch(err => {
      if (err.status === 401) toast("로그인이 풀려서 저장하지 못했어요. 다시 로그인해 주세요.");
      else console.warn("저장 실패", err);
    });
  }

  function wrap(name, fn) {
    const original = window[name];
    if (typeof original !== "function") return;
    window[name] = fn(original);
  }

  // 닉네임은 로그인 아이디로 고정
  wrap("renderFound", original => function () {
    if (auth.enabled && auth.id) game.company.player = auth.id;
    original.apply(this, arguments);
    if (auth.enabled && auth.id) {
      const input = document.querySelector('#found-box [data-field="player"]');
      if (input) {
        input.value = auth.id;
        input.disabled = true;
        const label = input.closest("label");
        if (label && !label.querySelector(".locked-note")) {
          label.insertAdjacentHTML("beforeend", `<span class="locked-note">로그인한 아이디로 기록돼요</span>`);
        }
      }
    }
  });

  wrap("renderFoundingNews", original => function () {
    original.apply(this, arguments);
    save("news");
  });

  wrap("startRound", original => function () {
    original.apply(this, arguments);
    save("event");
  });

  wrap("showRoundResult", original => function () {
    save("choice"); // 결과를 받은 순간 저장: 새로고침해서 결과를 다시 뽑을 수 없게
    return original.apply(this, arguments);
  });

  wrap("settleRound", original => function () {
    const result = original.apply(this, arguments);
    save("settled");
    return result;
  });

  wrap("renderFinal", original => function () {
    original.apply(this, arguments);
    if (auth.enabled && auth.token) api("/save-clear", { token: auth.token }).catch(() => {});
  });

  // ===== 시작: 서버가 로그인을 지원하는지 확인 =====

  (async () => {
    const savedToken = keep.get(KEY_TOKEN);
    if (savedToken) showScreen("screen-auth-wait");
    let info = {};
    try {
      info = await (await fetch(base + "/")).json();
    } catch {
      info = {};
    }
    if (!info.accounts) {
      // 서버에 저장소가 없거나 접속 실패: 로그인 없이 지금처럼
      if (document.getElementById("screen-auth-wait").classList.contains("active")) startGame();
      return;
    }
    auth.enabled = true;
    if (savedToken) {
      setAuth(keep.get(KEY_ID), savedToken);
      await afterLogin();
    } else {
      showScreen("screen-login");
    }
  })();
})();
