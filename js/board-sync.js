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
  const state = { enabled: true, loaded: false, entries: [], season: null, uploading: new Set() };

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
    return local.loadBoard().filter(e => e.at >= pageStart && !onServer.has(e.at));
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
  clearBoard = function () {
    if (!state.enabled || !state.loaded) return local.clearBoard();
    const code = window.prompt("공유 순위표를 모든 기기에서 지웁니다. 관리자 코드를 입력하세요.");
    if (!code) { setTimeout(() => toast("초기화를 취소했어요. 순위표는 그대로예요."), 50); return; }
    api("POST", "/reset", { code })
      .then(() => {
        state.entries = [];
        state.season = null;
        local.clearBoard();
        renderBoard(null);
        toast(SHARED_INDUSTRY ? "모든 기기의 순위표와 대결 업종을 초기화했어요." : "모든 기기의 순위표를 초기화했어요.");
      })
      .catch(err => toast(err.message));
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
    if (!state.enabled) return;
    refresh().then(() => {
      if (document.getElementById("screen-board").classList.contains("active")) {
        local.renderBoard(highlightAt);
        markShared();
      }
    });
  };

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
      const mine = local.loadBoard().filter(e => !onServer.has(e.at));
      if (!mine.length) return toast("올릴 기록이 없어요. 이 기기 기록은 이미 다 올라가 있어요.");
      const code = window.prompt(`이 기기에만 있는 기록 ${mine.length}개를 공유 순위표에 올립니다. 관리자 코드를 입력하세요.`);
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
