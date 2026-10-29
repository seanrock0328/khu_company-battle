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
  const KEY_GUEST = "company_battle_guest";
  // canSave: 저장된 게임을 서버에서 제대로 불러온 뒤에만 true (못 불러왔는데 새 판을 저장하면 하던 게임을 덮어씀)
  const auth = { enabled: false, id: "", token: "", guest: false, canSave: false };
  const ACCOUNT_TIMEOUT_MS = 10 * 1000; // 로그인·불러오기·저장: 10초 넘게 답이 없으면 끊기
  const START_TIMEOUT_MS = 8 * 1000;    // 처음 서버 확인: 8초 넘게 답이 없으면 로그인 없이 시작

  const keep = {
    get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    remove(k) { try { localStorage.removeItem(k); } catch {} }
  };

  // board-sync.js가 순위 기록을 올릴 때 이 토큰을 씁니다
  window.getAuthToken = () => (auth.enabled ? auth.token : "");
  window.getAuthId = () => (auth.enabled ? auth.id : ""); // 앞사람 기록이 다음 사람 이름으로 올라가지 않게 (board-sync.js)

  async function api(path, body) {
    const res = await fetchWithTimeout(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }, ACCOUNT_TIMEOUT_MS);
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
    .guest-box { background: var(--accent-soft); border-radius: 12px; padding: 14px; margin-bottom: 14px; }
    .guest-box .row input { flex: 1; min-width: 0; width: auto; margin-top: 0; }
    .auth-or { text-align: center; color: var(--muted); font-size: 13px; margin: 0 0 10px; }
  `;
  document.head.appendChild(style);

  const main = document.querySelector("main");
  main.insertAdjacentHTML("afterbegin", `
    <section id="screen-login" class="screen">
      <h2>사장님 로그인</h2>
      <p class="lead">아이디가 순위표 닉네임이 됩니다. 하던 게임은 어느 기기에서든 이어서 할 수 있어요.</p>
      <div class="solo"><form class="card" id="login-form" autocomplete="on">
        <div class="guest-box" id="guest-box">
          <p class="field-label" style="margin-top:0">👋 가입 없이 바로 하기</p>
          <div class="row">
            <input id="guest-name" maxlength="10" autocomplete="nickname" placeholder="닉네임 (2~10자)">
            <button type="button" id="btn-guest" class="primary small">바로 시작</button>
          </div>
          <p class="hint">순위표에 "닉네임(손님)"으로 올라가요. 손님은 다른 기기에서 이어하기가 안 돼요.</p>
          <p id="guest-error" class="error" role="alert"></p>
          <p class="hint" id="offline-box" hidden>서버가 답하지 않을 때는
            <button type="button" id="btn-offline" class="text-btn">로그인 없이 하기</button> (순위는 이 기기에만 남아요)</p>
        </div>
        <p class="auth-or">또는 계정으로 (이어하기 가능)</p>
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
      <h2 id="resume-title">하던 게임이 있어요</h2>
      <p class="lead" id="resume-lead">이어서 하거나, 새 회사를 차릴 수 있어요.</p>
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

  // 결산 화면: 로그인한 채로 "다음 사람 차례"를 누르면 다음 사람 기록이 앞사람 아이디로 올라갑니다.
  // 그래서 로그인 중에는 "로그아웃하고 다음 사람"(기본)과 "같은 아이디로 한 판 더"를 나눠서 보여 줍니다.
  // (화면 개편으로 btn-restart가 없어져도 로그인·이어하기는 그대로 돌아가게, 없으면 이 부분만 건너뜁니다)
  const restartBtn = document.getElementById("btn-restart");
  const restartLabel = restartBtn ? restartBtn.textContent : "";
  const nextPersonBtn = document.createElement("button");
  nextPersonBtn.id = "btn-logout-next";
  nextPersonBtn.className = "primary";
  nextPersonBtn.textContent = "로그아웃하고 다음 사람";
  nextPersonBtn.hidden = true;
  if (restartBtn) restartBtn.before(nextPersonBtn);
  nextPersonBtn.addEventListener("click", () => logout("다음 사장님 차례예요. 로그인하거나 손님으로 바로 시작해 주세요."));

  function updateFinalButtons() {
    if (!restartBtn) return;
    const loggedIn = auth.enabled && !!auth.id;
    restartBtn.textContent = !loggedIn ? restartLabel : auth.guest ? "같은 닉네임으로 한 판 더" : "같은 아이디로 한 판 더";
    restartBtn.classList.toggle("primary", !loggedIn);
    restartBtn.classList.toggle("secondary", loggedIn);
    nextPersonBtn.hidden = !loggedIn;
  }

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

  // 오류 문구. 서버 쪽 문제(응답 없음·접속 실패·횟수 제한·서버 오류)면 "로그인 없이 하기"도 보여 줍니다
  function showAuthError(box, err) {
    box.textContent = err.status ? err.message
      : err.timeout ? `${err.message} 잠시 뒤 다시 하거나 '로그인 없이 하기'를 눌러 주세요.`
      : "서버에 접속하지 못했어요. 인터넷 연결을 확인해 주세요.";
    if (!err.status || err.status === 429 || err.status >= 500) document.getElementById("offline-box").hidden = false;
  }

  // 서버가 안 될 때의 탈출구: 이번에는 로그인·이어하기 없이 (새로고침하면 다시 연결)
  document.getElementById("btn-offline").addEventListener("click", () => {
    clearAuth();
    auth.enabled = false;
    startGame();
    toast("로그인 없이 시작해요. 순위는 이 기기에만 남아요.");
  });

  // 손님으로 바로 시작
  const guestErr = document.getElementById("guest-error");
  async function startAsGuest() {
    const name = document.getElementById("guest-name").value.trim();
    const btn = document.getElementById("btn-guest");
    btn.disabled = true;
    guestErr.textContent = "";
    try {
      const data = await api("/guest", { name });
      setAuth(data.id, data.token, true);
      toast(`${data.id} 손님, 환영합니다!`);
      startGame();
    } catch (err) {
      showAuthError(guestErr, err);
    } finally {
      btn.disabled = false;
    }
  }
  document.getElementById("btn-guest").addEventListener("click", startAsGuest);
  document.getElementById("guest-name").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); startAsGuest(); }
  });

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
      setAuth(data.id, data.token, false);
      document.getElementById("login-pw").value = "";
      document.getElementById("login-pw2").value = "";
      toast(mode === "signup" ? `환영합니다, ${data.id} 사장님!` : `${data.id} 사장님, 어서 오세요!`);
      await afterLogin();
    } catch (err) {
      showAuthError(errBox, err);
    } finally {
      btn.disabled = false;
    }
  });

  function userLabel() {
    return auth.guest ? `👤 ${auth.id}(손님)` : `👤 ${auth.id}`;
  }

  function setAuth(id, token, guest) {
    auth.id = id;
    auth.token = token;
    auth.guest = !!guest;
    auth.canSave = false; // /me로 저장된 게임을 확인한 뒤에 켭니다 (afterLogin)
    keep.set(KEY_ID, id);
    keep.set(KEY_TOKEN, token);
    if (auth.guest) keep.set(KEY_GUEST, "1"); else keep.remove(KEY_GUEST);
    userBtn.textContent = userLabel();
    userBtn.hidden = false;
  }

  function clearAuth() {
    auth.id = "";
    auth.token = "";
    auth.guest = false;
    auth.canSave = false;
    keep.remove(KEY_ID);
    keep.remove(KEY_TOKEN);
    keep.remove(KEY_GUEST);
    userBtn.hidden = true;
  }

  // 로그인 화면 보여 주기. 기다리던 ChatKHU 답이 늦게 와도 무시하게 main.js의 aiToken을 올립니다
  // (안 그러면 늦은 답이 새 빈 회사에 적용되고, 로그인 화면을 건너뛰어 다음 화면으로 넘어갑니다)
  function showLogin() {
    aiToken++;
    showScreen("screen-login");
  }

  function logout(message) {
    const wasGuest = auth.guest;
    const token = auth.token;
    afterSaves(() => api("/logout", { token }).catch(() => {})); // 기다리던 저장을 먼저 보낸 뒤 로그아웃 (먼저 끊으면 그 저장이 버려짐)
    clearAuth();
    startGame();
    showLogin();
    // 다음 사람에게 앞사람 이름이 그대로 보이지 않게
    document.getElementById("guest-name").value = "";
    document.getElementById("login-id").value = "";
    toast(message || (wasGuest ? "손님 플레이를 마쳤어요." : "로그아웃했어요. 하던 게임은 저장돼 있어요."));
  }

  // 로그아웃은 두 번 눌러야 (실수 방지)
  let logoutArmed = false;
  userBtn.addEventListener("click", async () => {
    if (!logoutArmed) {
      logoutArmed = true;
      userBtn.textContent = "로그아웃? 한 번 더 누르기";
      setTimeout(() => { logoutArmed = false; if (auth.id) userBtn.textContent = userLabel(); }, 3000);
      return;
    }
    logoutArmed = false;
    logout();
  });

  // ===== 이어하기 =====

  let pendingSave = null;
  let saveUnknown = false; // 서버가 바쁘거나(429) 인터넷이 끊겨 저장된 게임이 있는지 모르는 상태
  let lastSavedAt = 0;
  const checkpointKey = () => `company_battle_checkpoint_${auth.id.toLowerCase()}`;

  async function afterLogin() {
    let me;
    try {
      me = await api("/me", { token: auth.token });
      auth.canSave = !me.guest;
    } catch (err) {
      if (err.status === 401) { clearAuth(); showLogin(); return; }
      if (!auth.guest) {
        // 여기서 새 게임을 시작하면 첫 저장이 하던 게임을 덮어씁니다 (canSave는 false 그대로).
        // 로그인은 그대로 두고, 다시 시도할지 새로 시작할지 사장님이 고르게 합니다.
        renderResumeError(err);
        showScreen("screen-resume");
        toast("저장된 게임을 불러오지 못했어요. 잠시 후 '다시 시도'를 눌러 주세요.");
        return;
      }
      me = { id: auth.id, guest: true, save: null }; // 손님은 이어하기 저장이 없으니 그대로 시작
    }
    saveUnknown = false;
    auth.id = me.id;
    if (me.guest) auth.guest = true;
    userBtn.textContent = userLabel();
    let localSave = null;
    if (auth.canSave) try { localSave = JSON.parse(keep.get(checkpointKey()) || "null"); } catch {}
    const latest = localSave && localSave.savedAt > (me.save?.savedAt || 0) ? localSave : me.save;
    pendingSave = latest && latest.phase && latest.company ? latest : null;
    if (pendingSave) {
      renderResume(pendingSave);
      showScreen("screen-resume");
    } else {
      startGame();
    }
  }

  function setResumeText(title, lead, button) {
    document.getElementById("resume-title").textContent = title;
    document.getElementById("resume-lead").textContent = lead;
    document.getElementById("btn-resume").textContent = button;
  }

  function renderResumeError(err) {
    pendingSave = null;
    saveUnknown = true;
    setResumeText("저장된 게임을 확인하지 못했어요", "서버가 잠깐 바쁘거나 인터넷이 끊겼어요. 하던 게임이 있다면 서버에 그대로 있어요.", "다시 시도");
    document.getElementById("btn-resume").disabled = false;
    document.getElementById("resume-box").innerHTML = `
      <p>${esc(err.status ? err.message : err.timeout ? err.message : "서버에 접속하지 못했어요. 인터넷 연결을 확인해 주세요.")}</p>
      <p class="hint">'새로 시작'을 누르면 저장된 게임이 있어도 지워져요.</p>`;
  }

  function renderResume(s) {
    setResumeText("하던 게임이 있어요", "이어서 하거나, 새 회사를 차릴 수 있어요.", "이어서 하기");
    const c = s.company;
    const profit = (c.rounds || []).reduce((sum, r) => sum + (typeof r.profit === "number" ? r.profit : 0), 0);
    const compatible = c.financeVersion === CASH_RULE_VERSION;
    document.getElementById("btn-resume").disabled = !compatible;
    const where = { funding: "창업자금 봉투 개봉 완료", interview: "면접 중", news: "면접 전", event: `${quarterLabel(s.round)} 지시 전`, choice: `${quarterLabel(s.round)} 보고 받음`, settled: `${quarterLabel(s.round)} 결산 끝` }[s.phase] || "";
    document.getElementById("resume-box").innerHTML = `
      ${companyTitle(c)}
      <p class="big">${esc(where)}</p>
      ${!compatible ? '<p class="bad">이전 경제 규칙으로 저장된 게임입니다. 새 회사로 시작해 주세요.</p>' : ""}
      <p>누적 수익 <b class="${profit < 0 ? "neg" : "pos"}">${money(profit)}</b> · 저장 ${new Date(s.savedAt).toLocaleString("ko-KR")}</p>`;
  }

  document.getElementById("btn-resume").addEventListener("click", async () => {
    if (pendingSave) return resume(pendingSave);
    if (!saveUnknown) return;
    const btn = document.getElementById("btn-resume"); // 다시 시도
    btn.disabled = true;
    try { await afterLogin(); } finally { if (saveUnknown) btn.disabled = false; }
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
    // 저장을 확인 못 한 상태에서도 사장님이 두 번 눌러 고른 것이므로, 서버 저장을 지우고 이번 판부터 다시 저장합니다
    if (saveUnknown) { saveUnknown = false; auth.canSave = !auth.guest; }
    clearSave();
    startGame();
  });

  function resume(s) {
    if (s.company.financeVersion !== CASH_RULE_VERSION) return;
    game.company = s.company;
    game.round = s.round;
    nextCandidateId = Math.max(nextCandidateId, s.nextCandidateId || 1);
    interviewIndex = s.interviewIndex || 0;
    pendingSave = null;
    switch (s.phase) {
      case "funding":
        renderFound();
        showScreen("screen-found");
        break;
      case "interview":
        renderInterview(interviewIndex);
        showScreen("screen-interview");
        break;
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

  // 이 기기 저장(checkpoint)은 매번 바로 하고, 서버 저장은 무료 한도(하루 1,000번)를 아끼려고 모아서 보냅니다.
  //  - 다시 뽑기·다시 고르기를 막아야 하는 순간(봉투 개봉, 면접 전, 보고 받음, 결산)은 3초 간격만 지켜 바로 보냅니다.
  //  - 면접 중·지시 쓰는 중처럼 자주 바뀌는 저장은 20초 동안 더 바뀌지 않으면 보냅니다 (계속 바뀌어도 60초에 한 번은 보냄).
  //  - 늘 가장 마지막 모습 하나만 보내고, 지우기(/save-clear)는 보내던 저장이 끝난 뒤에 보냅니다.
  const SAVE_GAP_MS = 3000;        // 서버는 같은 사람의 저장을 2초 안에 또 받지 않습니다
  const SAVE_QUIET_MS = 20 * 1000;
  const SAVE_MAX_WAIT_MS = 60 * 1000;
  const URGENT_PHASES = ["funding", "news", "choice", "settled"];
  const outbox = { next: null, busy: false, lastAt: 0, timer: null, after: [] };

  function dueAt(job) {
    const gap = outbox.lastAt + SAVE_GAP_MS;
    return job.urgent ? gap : Math.max(gap, Math.min(job.touchedAt + SAVE_QUIET_MS, job.firstAt + SAVE_MAX_WAIT_MS));
  }

  function flushSaves() {
    clearTimeout(outbox.timer);
    if (outbox.busy) return;
    if (!outbox.next) {
      outbox.after.splice(0).forEach(fn => fn()); // 다 보냈으면 기다리던 일(로그아웃 등)
      return;
    }
    const wait = dueAt(outbox.next) - Date.now();
    if (wait > 0) {
      outbox.timer = setTimeout(flushSaves, wait);
      return;
    }
    const job = outbox.next;
    outbox.next = null;
    outbox.busy = true;
    outbox.lastAt = Date.now();
    api(job.path, job.body)
      .catch(err => {
        if (err.status === 429 && !job.retried && !outbox.next) { job.retried = true; job.urgent = true; outbox.next = job; } // 너무 잦았으면 한 번만 다시
        else if (err.status === 401 && job.body.token === auth.token) toast("로그인이 풀려서 저장하지 못했어요. 다시 로그인해 주세요.");
        else console.warn("저장 실패", err);
      })
      .finally(() => { outbox.busy = false; flushSaves(); });
  }

  function queueSave(path, body, urgent) {
    const now = Date.now();
    const prev = outbox.next;
    outbox.next = { path, body, urgent: urgent || !!(prev && prev.urgent), firstAt: prev ? prev.firstAt : now, touchedAt: now };
    flushSaves();
  }

  // 기다리던 저장을 조용히 기다리지 말고 바로 보낸 뒤 fn을 부릅니다
  function afterSaves(fn) {
    if (outbox.next) outbox.next.urgent = true;
    outbox.after.push(fn);
    flushSaves();
  }

  function save(phase) {
    if (!auth.enabled || !auth.token || auth.guest || !auth.canSave) return; // 손님은 이어하기 저장 안 함
    const snapshot = {
      v: 2, phase, savedAt: Math.max(Date.now(), lastSavedAt + 1), round: game.round,
      nextCandidateId, interviewIndex, company: JSON.parse(JSON.stringify(game.company)) // 늦게 보내도 지금 모습 그대로 가게 복사
    };
    lastSavedAt = snapshot.savedAt;
    keep.set(checkpointKey(), JSON.stringify(snapshot));
    queueSave("/save", { token: auth.token, save: snapshot }, URGENT_PHASES.includes(phase));
  }

  // 저장된 게임 지우기: 기다리던 저장은 버리고, 보내던 저장이 끝난 뒤에 지웁니다 (지운 뒤에 옛 저장이 다시 써지지 않게)
  function clearSave() {
    if (!auth.enabled || !auth.token || auth.guest || !auth.canSave) return;
    keep.remove(checkpointKey());
    queueSave("/save-clear", { token: auth.token }, true);
  }

  document.addEventListener("company-state-change", e => save(e.detail.phase));

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
    // 1분기 시작은 면접(채용) 결과를 남기려고 저장합니다. 2분기부터는 바로 전 분기 결산('settled') 저장으로
    // 똑같이 이어할 수 있어서 저장하지 않습니다 (지시를 쓰기 시작하면 main.js가 따로 저장)
    if (game.round === 0) save("event");
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
    updateFinalButtons();
    clearSave();
  });

  // ===== 시작: 서버가 로그인을 지원하는지 확인 =====

  (async () => {
    const savedToken = keep.get(KEY_TOKEN);
    if (savedToken) showScreen("screen-auth-wait");
    let info = {};
    let failed = false;
    try {
      info = await (await fetchWithTimeout(base + "/", {}, START_TIMEOUT_MS)).json();
    } catch {
      info = {};
      failed = true;
    }
    if (!info.accounts) {
      // 서버에 저장소가 없거나 접속 실패(8초 안에 답 없음 포함): 로그인 없이 지금처럼
      if (document.getElementById("screen-auth-wait").classList.contains("active")) {
        startGame();
        if (failed) toast("팀 서버가 답하지 않아 로그인 없이 시작해요. 새로고침하면 다시 연결해요.");
      }
      return;
    }
    auth.enabled = true;
    if (savedToken) {
      setAuth(keep.get(KEY_ID), savedToken, keep.get(KEY_GUEST) === "1");
      await afterLogin();
    } else {
      showLogin();
    }
  })();
})();
