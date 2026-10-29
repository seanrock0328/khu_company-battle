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
    state.uploading.add(entry.at);
    const token = typeof window.getAuthToken === "function" ? window.getAuthToken() : "";
    api("POST", "/board", { entry, token })
      .then(() => { if (!state.entries.some(e => e.at === entry.at)) state.entries.push(entry); })
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
      state.entries = Array.isArray(data.entries) ? data.entries : [];
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

  refresh();
})();
