// 공유 순위표 연결 (담당: Claude)
// 팀 서버에 순위표 저장소(BOARD)가 연결돼 있으면, 컴퓨터·폰·심사위원이 순위표 하나와 대결 업종 하나를 같이 씁니다.
// 서버에 저장소가 없거나 접속이 안 되면 지금처럼 각 기기에만 저장합니다.
//
// game.js와 ui.js의 함수를 감싸서(덮어써서) 동작하므로, 그 파일들은 고치지 않아도 됩니다.
// index.html에서 ui.js 다음, main.js 앞에 불러와야 합니다.

(function () {
  if (!TEAM_SERVER_URL) return;

  const base = TEAM_SERVER_URL.replace(/\/+$/, "");
  const pageStart = Date.now(); // 이 화면을 연 뒤에 생긴 기록만 서버에 올립니다 (예전 테스트 기록 제외)
  const state = { enabled: true, loaded: false, entries: [], season: null, uploading: new Set(), resetAt: 0, removed: [] };
  const RESET_GRACE_MS = 60 * 1000; // worker.js와 같은 값

  // 관리자 코드는 이 탭에서만 기억합니다 (탭을 닫으면 잊음)
  const ADMIN_KEY = "company_battle_admin";
  const adminCode = {
    get() { try { return sessionStorage.getItem(ADMIN_KEY) || ""; } catch { return ""; } },
    set(v) { try { v ? sessionStorage.setItem(ADMIN_KEY, v) : sessionStorage.removeItem(ADMIN_KEY); } catch {} }
  };
  const sigOf = e => `${String(e.player || "").toLowerCase()}|${Math.round(Number(e.at))}`;
  // 관리자가 지웠거나 초기화 전에 끝난 판 (이 기기에 남아 있어도 다시 올리거나 보여 주지 않음)
  const isRemoved = e => state.removed.includes(sigOf(e)) || e.at <= state.resetAt - RESET_GRACE_MS;

  // 원래 함수 (기기에만 저장하는 버전)
  const local = { loadBoard, saveBoard, setSeason, clearSeason, clearBoard, renderBoard };

  async function api(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 501) { state.enabled = false; throw new Error("공유 순위표 없음"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `순위표 서버 오류 (${res.status})`);
    return data;
  }

  // 아직 서버에 없는, 이 기기에서 방금 생긴 기록
  function pendingLocal() {
    const onServer = new Set(state.entries.map(e => e.at));
    return local.loadBoard().filter(e => e.at >= pageStart && !onServer.has(e.at) && !isRemoved(e));
  }

  function upload(entry) {
    if (state.uploading.has(entry.at)) return;
    // 앞사람 기록이 올라가지 못했다가 다음 사람이 로그인한 사이에 재시도되면 다음 사람 이름으로 올라가므로, 지금 로그인한 사람의 기록만 올립니다
    const who = typeof window.getAuthId === "function" ? window.getAuthId() : "";
    if (who && entry.player !== who) return;
    state.uploading.add(entry.at);
    const token = typeof window.getAuthToken === "function" ? window.getAuthToken() : "";
    api("POST", "/board", { entry, token })
      .then(data => {
        // 이미 올라간 판 (이어하기로 결산을 다시 연 경우): 서버에 한 줄만 남기고 이 기기 사본도 지웁니다
        if (data && data.duplicate) return local.saveBoard(local.loadBoard().filter(e => e.at !== entry.at));
        if (!state.entries.some(e => e.at === entry.at)) state.entries.push(entry);
      })
      .catch(err => {
        state.uploading.delete(entry.at);
        if (state.enabled) toast(token ? "순위표를 서버에 저장하지 못했어요. 이 기기에는 남아 있어요." : "로그인해야 공유 순위표에 기록돼요. 이 기기에는 남아 있어요.");
        console.warn(err);
      });
  }

  // 서버 순위표와 대결 업종 새로 받기
  async function refresh() {
    try {
      const data = await api("GET", "/board");
      // 서버가 별도 규칙 버전을 보관하지 않으므로, 보존되는 결산 표제로 새 경제 규칙을 구분합니다.
      state.entries = Array.isArray(data.entries) ? data.entries.filter(e => String(e.news || "").startsWith(CASH_RULE_VERSION)) : [];
      state.resetAt = Number(data.resetAt) || 0;
      state.removed = Array.isArray(data.removed) ? data.removed : [];
      // 관리자가 지운 기록은 이 기기 사본에서도 지웁니다
      const kept = local.loadBoard().filter(e => !isRemoved(e));
      if (kept.length !== local.loadBoard().length) local.saveBoard(kept);
      state.loaded = true;
      if (SHARED_INDUSTRY && data.season && data.season.industry) {
        state.season = data.season;
        local.setSeason(data.season.industry, data.season.emoji);
        applySeasonToNewGame();
      } else if (SHARED_INDUSTRY && getSeason()) {
        // 서버엔 아직 대결 업종이 없고 이 기기엔 있으면, 이 기기 것을 서버에 올림
        const s = getSeason();
        api("POST", "/season", { industry: s.industry, emoji: s.emoji }).then(adoptSeason).catch(() => {});
      }
      pendingLocal().forEach(upload);
    } catch (err) {
      console.warn(err);
    }
  }

  function adoptSeason(data) {
    if (!data || !data.season) return;
    state.season = data.season;
    const before = getSeason();
    local.setSeason(data.season.industry, data.season.emoji);
    if (before && before.industry !== data.season.industry) {
      toast(`다른 사장님이 먼저 정한 대결 업종 "${data.season.industry}"(으)로 맞췄어요.`);
    }
    applySeasonToNewGame();
  }

  // 아직 창업 전이면 대결 업종을 화면에 바로 반영
  function applySeasonToNewGame() {
    const c = game.company;
    const found = document.getElementById("screen-found");
    if (!state.season || !found || !found.classList.contains("active") || c.foundingByAI || c.events.length) return;
    if (c.industry === state.season.industry) return;
    c.industry = state.season.industry;
    c.emoji = state.season.emoji;
    renderFound();
  }

  // ===== 원래 함수 감싸기 =====

  loadBoard = function () {
    if (!state.enabled || !state.loaded) return local.loadBoard();
    return state.entries.concat(pendingLocal());
  };

  saveBoard = function (list) {
    local.saveBoard(list);
    if (!state.enabled) return;
    const onServer = new Set(state.entries.map(e => e.at));
    list.filter(e => e.at >= pageStart && !onServer.has(e.at)).forEach(upload);
  };

  setSeason = function (industry, emoji) {
    local.setSeason(industry, emoji);
    if (state.enabled && SHARED_INDUSTRY) api("POST", "/season", { industry, emoji }).then(adoptSeason).catch(() => {});
  };

  // 공유 순위표 초기화는 관리자 코드가 있어야 합니다 (아무나 지우지 못하게)
  // 공유 순위표면 Promise(성공 true / 취소·실패 false)를 돌려줍니다. main.js는 이때 자기 안내를 띄우지 않습니다.
  clearBoard = function () {
    if (!state.enabled || !state.loaded) return local.clearBoard();
    const code = adminCode.get() || window.prompt("공유 순위표를 모든 기기에서 지웁니다. 관리자 코드를 입력하세요.");
    if (!code) { setTimeout(() => toast("초기화를 취소했어요. 순위표는 그대로예요."), 50); return Promise.resolve(false); }
    return api("POST", "/reset", { code })
      .then(() => {
        adminCode.set(code);
        state.entries = [];
        state.season = null;
        state.resetAt = Date.now();
        local.clearBoard();
        local.renderBoard(null);
        markShared();
        decorateAdmin();
        toast(SHARED_INDUSTRY ? "모든 기기의 순위표와 대결 업종을 초기화했어요." : "모든 기기의 순위표를 초기화했어요.");
        return true;
      })
      .catch(err => { if (/관리자 코드/.test(err.message)) adminCode.set(""); toast(err.message); return false; });
  };

  // 결산 화면의 "N위/M명"은 화면을 연 뒤 다른 사람이 올린 기록까지 넣어 다시 계산합니다
  // (처음 계산은 화면을 열 때 받아 둔 순위표라 오래됐을 수 있음)
  const localRecord = recordResult;
  recordResult = function (c) {
    const already = !!c.placement;
    const placed = localRecord(c);
    if (!placed || already || !state.enabled) return placed;
    refresh().then(() => {
      const sorted = sortedBoard(SHARED_INDUSTRY ? c.industry : null);
      const rank = sorted.findIndex(e => e.at === placed.at) + 1;
      if (!rank || (rank === c.placement.rank && sorted.length === c.placement.total)) return;
      c.placement = { rank, total: sorted.length, at: placed.at };
      const final = document.getElementById("screen-final");
      if (game.company === c && final && final.classList.contains("active")) renderFinal(c.placement);
    });
    return placed;
  };

  renderBoard = function (highlightAt) {
    local.renderBoard(highlightAt);
    markShared();
    decorateAdmin();
    if (!state.enabled) return;
    refresh().then(() => {
      if (document.getElementById("screen-board").classList.contains("active")) {
        local.renderBoard(highlightAt);
        markShared();
        decorateAdmin();
      }
    });
  };

  // ===== 관리자 모드: 기록 하나씩 지우기 =====
  // 관리자 코드를 한 번 넣으면 이 탭에서는 순위 줄마다 🗑 버튼이 생깁니다.
  function decorateAdmin() {
    const panel = document.getElementById("board-admin");
    const stateText = panel && panel.querySelector && panel.querySelector(".admin-state");
    const toggleBtn = panel && panel.querySelector && panel.querySelector("#btn-admin-toggle");
    if (stateText) stateText.textContent = adminCode.get() ? "관리자 모드 켜짐: 줄마다 🗑로 기록을 지울 수 있어요." : "";
    if (toggleBtn) toggleBtn.textContent = adminCode.get() ? "관리자 모드 끄기" : "관리자 모드";
    const codeBox = panel && panel.querySelector && panel.querySelector("#admin-code");
    if (codeBox) codeBox.hidden = !!adminCode.get();
    if (!adminCode.get() || !state.enabled) return;
    const list = sortedBoard();
    document.querySelectorAll("#board ol.board > li").forEach((li, k) => {
      const e = list[k];
      if (!e || li.querySelector(".del-entry")) return;
      const b = document.createElement("button");
      b.className = "text-btn del-entry";
      b.type = "button";
      b.title = "이 기록 지우기";
      b.textContent = "🗑";
      b.style.cssText = "margin-left:10px;font-size:1em;padding:2px 6px;text-decoration:none;vertical-align:middle";
      b.addEventListener("click", ev => { ev.stopPropagation(); removeEntry(e); });
      (li.querySelector(".pts") || li).appendChild(b);
    });
  }

  async function removeEntry(e) {
    if (!window.confirm(`${e.player} 사장님의 기록 (${e.name}, ${money(e.profit)})을 순위표에서 지울까요?`)) return;
    try {
      await api("POST", "/delete", { code: adminCode.get(), player: e.player, at: e.at });
      const sig = sigOf(e);
      if (!state.removed.includes(sig)) state.removed = state.removed.concat(sig);
      state.entries = state.entries.filter(x => sigOf(x) !== sig);
      local.saveBoard(local.loadBoard().filter(x => sigOf(x) !== sig));
      local.renderBoard(null);
      markShared();
      decorateAdmin();
      toast(`${e.player} 사장님의 기록을 지웠어요.`);
    } catch (err) {
      if (/관리자 코드/.test(err.message)) { adminCode.set(""); decorateAdmin(); }
      toast(err.message);
    }
  }

  function markShared() {
    const lead = document.getElementById("board-lead");
    if (!lead || !state.enabled || !state.loaded) return;
    lead.textContent = lead.textContent.replace(/\((이 노트북에 저장)[^)]*\)/, "(모든 기기 공유)");
    const box = document.getElementById("season-box");
    if (box) box.querySelectorAll(".hint").forEach(p => {
      p.textContent = "모든 기기가 같은 대결 업종과 순위표를 씁니다. 이 링크를 보내면 바로 참가할 수 있어요.";
    });
  }

  // ===== 관리자: 이 기기에만 있는 기록을 공유 순위표로 올리기 =====
  // 공유 순위표가 켜지기 전에 이 기기에서 한 판들(지금 규칙 기록만)을 이름 그대로 올립니다.
  const adminRow = document.querySelector("#screen-board .admin");
  if (adminRow) {
    const panel = document.createElement("div");
    panel.id = "board-admin";
    panel.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;margin-top:8px";
    panel.innerHTML = `<input id="admin-code" type="password" autocomplete="off" placeholder="관리자 코드" style="max-width:160px">
      <button id="btn-admin-toggle" class="text-btn" type="button">관리자 모드</button>
      <small class="admin-state hint" style="flex-basis:100%;text-align:center"></small>`;
    if (adminRow.after) adminRow.after(panel);
    const codeInput = panel.querySelector ? panel.querySelector("#admin-code") : null;
    const toggle = async () => {
      if (adminCode.get()) { adminCode.set(""); local.renderBoard(null); markShared(); decorateAdmin(); return toast("관리자 모드를 껐어요."); }
      const code = codeInput ? codeInput.value.trim() : "";
      if (!code) { if (codeInput) codeInput.focus(); return toast("관리자 코드를 입력하세요."); }
      try {
        await api("POST", "/admin", { code });
        adminCode.set(code);
        if (codeInput) codeInput.value = "";
        decorateAdmin();
        toast("관리자 모드를 켰어요. 지울 기록 옆 🗑를 누르세요.");
      } catch (err) {
        toast(/없는 주소/.test(err.message) ? "팀 서버를 최신 버전으로 다시 붙여넣어야 해요." : err.message);
      }
    };
    const toggleBtn = panel.querySelector && panel.querySelector("#btn-admin-toggle");
    if (toggleBtn) toggleBtn.addEventListener("click", toggle);
    if (codeInput) codeInput.addEventListener("keydown", ev => { if (ev.key === "Enter") toggle(); });

    const importBtn = document.createElement("button");
    importBtn.className = "text-btn";
    importBtn.id = "btn-board-import";
    importBtn.textContent = "이 기기 기록을 공유 순위표에 올리기 (관리자)";
    importBtn.style.marginLeft = "12px";
    adminRow.appendChild(importBtn);
    importBtn.addEventListener("click", async () => {
      if (!state.enabled) return toast("공유 순위표가 꺼져 있어요.");
      await refresh();
      const onServer = new Set(state.entries.map(e => e.at));
      const mine = local.loadBoard().filter(e => !onServer.has(e.at) && !isRemoved(e));
      if (!mine.length) return toast("올릴 기록이 없어요. 이 기기 기록은 이미 다 올라가 있어요.");
      const code = adminCode.get() || window.prompt(`이 기기에만 있는 기록 ${mine.length}개를 공유 순위표에 올립니다. 관리자 코드를 입력하세요.`);
      if (!code) return;
      try {
        const res = await api("POST", "/import", { code, entries: mine });
        state.entries = state.entries.concat(mine);
        renderBoard(null);
        toast(`기록 ${res.added}개를 올렸어요.`);
      } catch (err) {
        toast(err.message);
      }
    });
  }

  refresh();
})();
