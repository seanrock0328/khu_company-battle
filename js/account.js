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
  // 콘셉트 "출근 첫날": 회사 정문에서 임시 출입증(손님)으로 바로 들어가거나, 사원증(계정)을 찍고 출근합니다.
  //  - 이어하기 = 사장님 결재를 기다리는 "결재 서류", 저장된 로그인 확인 = 출입 카드 리더기, 👤 배지 = 미니 사원증.
  //  - 색·글꼴·간격·그림자는 #1 디자인 토큰(var(--ink) 등)을 쓰고, 토큰이 없을 때도 같아 보이게 같은 값을 기본값으로 적었습니다.
  //  - 규칙은 모두 이 세 화면, 👤 배지(.pill.user), 결산 화면의 #btn-logout-next 안에서만 적용됩니다 (게임 화면에 새지 않게).
  //  - 움직임은 CSS만 씁니다 (반복 데모 말고는 0.4초 안). 움직임 줄이기 설정이면 모두 멈춘 모습으로 보여 줍니다.

  // 제목 글꼴(Black Han Sans): 페이지에 아직 없을 때만 Google Fonts에서 불러옵니다
  if (!document.querySelector('link[href*="Black+Han+Sans"]')) {
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Black+Han+Sans&display=swap";
    document.head.appendChild(font);
  }

  const style = document.createElement("style");
  style.textContent = `
    /* ===== 공통 토큰: #1 디자인 값이 있으면 그것을, 없으면 같은 기본값 ===== */
    #screen-login, #screen-resume, #screen-auth-wait {
      --g-ink: var(--ink, #221b2c);
      --g-muted: color-mix(in srgb, var(--muted, #6b6276) 85%, var(--ink, #221b2c)); /* 어느 배경에서도 4.5:1 넘게 살짝 진하게 */
      --g-surface: var(--surface, #ffffff);
      --g-field: var(--surface-2, #fbf7ef);
      --g-sunken: var(--sunken, #efe6d6);
      --g-paper: var(--paper, #fffdf7);
      --g-line: var(--line, #e2d6c2);
      --g-outline: var(--outline, #221b2c);
      --g-shadow: var(--shadow-ink, #221b2c);
      --g-soft: var(--shadow-soft, rgba(34, 27, 44, .14));
      --g-white: var(--on-dark, #ffffff);
      --g-stamp: var(--stamp, #df3328);
      --g-stamp-soft: var(--stamp-soft, #fde3de);
      /* 도장색 글자: 옅은 분홍 위에서는 잉크 쪽으로, 잉크 띠 위에서는 흰색 쪽으로 섞어 4.5:1 넘게 (밝은·어두운 테마 모두) */
      --g-stamp-text: color-mix(in srgb, var(--g-stamp) 78%, var(--g-ink));
      --g-stamp-on-ink: color-mix(in srgb, var(--g-stamp) 60%, var(--g-surface));
      --g-money: var(--money, #0f8f55);
      --g-money-soft: var(--money-soft, #daf2e5);
      --g-loss: var(--loss, #dd3434);
      --g-loss-soft: var(--loss-soft, #fde2df);
      --g-boss: var(--rank-0, #ffd23a);
      --g-boss-ink: var(--rank-ink-0, #2d2200);
      --g-boss-soft: var(--ceo-soft, #fff2b0);
      --g-focus: var(--focus, #2f6bff);
      --g-room: var(--room, #bdd0e2);
      --g-room-head: var(--room-head, #a9c0d6);
      --g-room-ink: var(--room-ink, #30465a);
      --g-display: var(--font-display, "Black Han Sans", "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif);
      --g-spring: var(--spring, cubic-bezier(.34, 1.56, .64, 1));
      --g-ease: var(--ease, cubic-bezier(.2, .8, .2, 1));
      color: var(--g-ink); word-break: keep-all; overflow-wrap: break-word;
    }
    #screen-login :is(h2, h3, p, ul, ol, figure, figcaption),
    #screen-resume :is(h2, p), #screen-auth-wait p { margin: 0; }
    #screen-login :is(ul, ol) { padding: 0; list-style: none; }

    /* 버튼: 두꺼운 잉크 테두리 + 단색 그림자, 누르면 그림자만큼 쏙 */
    :is(#screen-login, #screen-resume) .g-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      min-height: 48px; margin: 0; padding: 0 var(--s5, 24px);
      border: var(--bw, 3px) solid var(--g-outline); border-radius: var(--r, 12px);
      background: var(--g-surface); color: var(--g-ink); opacity: 1;
      font-family: var(--g-display); font-weight: 400; font-size: var(--fs-l, 18px); line-height: 1.15; text-align: center;
      box-shadow: 0 4px 0 var(--g-shadow);
      cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
      transition: transform .14s var(--g-spring), box-shadow .14s var(--g-ease), background-color .14s;
    }
    :is(#screen-login, #screen-resume) .g-btn.g-go { background: var(--g-boss); color: var(--g-boss-ink); }
    /* hover로 뜨는 모양은 마우스가 있는 기기에서만 (휴대폰은 누른 뒤에도 :hover가 남아 떠 있는 채로 보임) */
    @media (hover: hover) {
      :is(#screen-login, #screen-resume) .g-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 0 var(--g-shadow); }
    }
    :is(#screen-login, #screen-resume) .g-btn:active:not(:disabled) { transform: translateY(4px) scale(.98, .96); box-shadow: 0 0 0 var(--g-shadow); }
    :is(#screen-login, #screen-resume) .g-btn:disabled {
      background: var(--disabled, #ddd5c8); color: var(--disabled-ink, #8f8699);
      border-color: var(--disabled, #ddd5c8); box-shadow: none; cursor: not-allowed;
    }
    /* 서버를 기다리는 동안(잠깐 비활성): 회색 대신 줄무늬가 흘러가는 "처리 중" (버튼 색은 그대로) */
    #screen-login :is(#btn-guest, #btn-login):disabled {
      border-color: var(--g-outline); background-color: var(--g-boss); color: var(--g-boss-ink);
      background-image: repeating-linear-gradient(-45deg, transparent 0 8px, rgba(34, 27, 44, .14) 8px 16px);
      background-size: 22.63px 22.63px; transform: translateY(4px); cursor: progress;
      animation: g6Busy .5s linear infinite;
    }
    #screen-login #btn-login:disabled { background-color: var(--g-surface); color: var(--g-ink); }
    #login-form:has([data-mode="signup"].on) #btn-login:disabled {
      background-color: var(--g-ink); color: var(--g-surface);
      background-image: repeating-linear-gradient(-45deg, transparent 0 8px, rgba(255, 255, 255, .16) 8px 16px);
    }
    :is(#screen-login, #screen-resume) :is(.g-btn, .g-link, .auth-tabs button):focus-visible { outline: 3px solid var(--g-focus); outline-offset: 3px; }
    #screen-login .g-link {
      min-height: 44px; margin: 0; padding: 0 4px; border: 0; background: none; color: var(--g-ink);
      font: inherit; font-weight: 900; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; cursor: pointer;
    }

    /* 입력 칸 */
    #screen-login input {
      display: block; width: 100%; min-width: 0; min-height: 48px; margin: 0; padding: 10px var(--s3, 12px);
      border: var(--bw-s, 2px) solid var(--g-line); border-radius: var(--r, 12px); background: var(--g-field); color: var(--g-ink);
      font: inherit; font-size: var(--fs-m, 16px); font-weight: 500; line-height: 1.3;
      transition: border-color .15s, box-shadow .15s, background-color .15s;
    }
    #screen-login input::placeholder { color: var(--g-muted); opacity: 1; font-weight: 400; }
    #screen-login input:focus {
      outline: none; border-color: var(--g-outline); background: var(--g-surface);
      box-shadow: 0 0 0 4px rgba(47, 107, 255, .3);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--g-focus) 32%, transparent);
    }
    #screen-login .g-label-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--s1, 4px) var(--s2, 8px); margin-bottom: var(--s2, 8px); }
    #screen-login .g-label-row label { font-size: var(--fs-s, 14px); font-weight: 900; }

    /* 아이디 규칙: 입력하는 동안 ✓(초록) / ✗(글자 규칙 어김)로 바로 보여 줌. 빈 칸이면 다시 회색 */
    #screen-login .g-rules { display: flex; flex-wrap: wrap; gap: var(--s1, 4px); }
    #screen-login .g-rule {
      display: inline-flex; align-items: center; gap: var(--s1, 4px); height: 24px; padding: 0 var(--s2, 8px) 0 var(--s1, 4px);
      border: 1.5px dashed var(--g-line); border-radius: 999px; background: transparent;
      color: var(--g-ink); font-size: var(--fs-xs, 12px); font-weight: 700; white-space: nowrap;
      transition: background-color .2s, border-color .2s;
    }
    #screen-login .g-rule::before {
      content: ""; display: inline-grid; place-items: center; width: 10px; height: 10px; margin: 0 3px; border-radius: 50%;
      box-shadow: inset 0 0 0 1.5px var(--g-muted); font-size: var(--fs-xs, 12px); font-weight: 900; line-height: 1;
    }
    #screen-login .g-rule:is(.ok, .bad)::before { width: 16px; height: 16px; margin: 0; box-shadow: none; color: var(--g-white); animation: g6Tick .3s var(--g-spring); }
    #screen-login .g-rule.ok { border-style: solid; border-color: var(--g-money); background: var(--g-money-soft); }
    #screen-login .g-rule.ok::before { content: "✓"; background: var(--g-money); }
    #screen-login .g-rule.bad { border-style: solid; border-color: var(--g-loss); background: var(--g-loss-soft); }
    #screen-login .g-rule.bad::before { content: "✗"; background: var(--g-loss); }
    #screen-login .g-field:has(input:placeholder-shown) .g-rule { border-style: dashed; border-color: var(--g-line); background: transparent; }
    #screen-login .g-field:has(input:placeholder-shown) .g-rule::before { content: ""; width: 10px; height: 10px; margin: 0 3px; background: none; box-shadow: inset 0 0 0 1.5px var(--g-muted); animation: none; }

    /* 오류: 출입 게이트가 "삐빅!" 하고 막은 쪽지 (빨간 테두리 + 도장 칩, 흔들림) */
    #screen-login .g-error {
      display: flex; align-items: flex-start; gap: var(--s2, 8px); padding: 10px var(--s3, 12px);
      border: var(--bw-s, 2px) solid var(--g-loss); border-radius: var(--r, 12px);
      background: var(--g-loss-soft); color: var(--g-ink); font-size: var(--fs-s, 14px); font-weight: 700; line-height: 1.45;
      animation: g6Shake .32s ease-in-out;
    }
    #screen-login .g-error::before {
      content: "삐빅!"; content: "삐빅!" / ""; flex: none; margin-top: -1px; padding: 0 6px;
      border: var(--bw-s, 2px) solid var(--g-stamp); border-radius: var(--r-s, 8px); color: var(--g-stamp-text);
      font-family: var(--g-display); font-weight: 400; font-size: var(--fs-s, 14px); line-height: 20px; white-space: nowrap;
      transform: rotate(-6deg); mix-blend-mode: var(--stamp-blend, multiply);
    }
    #screen-login .g-error:empty { display: none; }
    #screen-login .g-note { color: var(--g-muted); font-size: var(--fs-xs, 12px); line-height: 1.5; }

    /* ===== 로그인 화면: 정문 ===== */
    #screen-login { width: min(100%, 980px); margin-inline: auto; container: gate / inline-size; }
    #screen-login .gate {
      display: grid; gap: var(--s3, 12px); max-width: 560px; margin: 0 auto;
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: "hook" "demo" "pass" "or" "card";
    }
    /* 키가 낮은 화면(휴대폰 브라우저 등)의 한 줄 배치: 닉네임 칸이 스크롤 없이 보이게 예시 단톡방을 출입증 아래로 */
    @media (max-height: 760px) { #screen-login .gate { grid-template-areas: "hook" "pass" "demo" "or" "card"; } }
    #screen-login .gate-hook { grid-area: hook; display: grid; gap: var(--s2, 8px); align-content: center; justify-items: start; }
    #screen-login .g-kicker {
      display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px var(--s2, 8px); border-radius: 999px;
      background: var(--g-surface); box-shadow: inset 0 0 0 2px var(--g-line); font-size: var(--fs-xs, 12px); font-weight: 900;
    }
    #screen-login .g-title { font-family: var(--g-display); font-weight: 400; font-size: var(--fs-2xl, 28px); line-height: 1.2; }
    #screen-login .g-title .g-stamp {
      display: inline-block; padding: 0 .18em; border: .09em solid var(--g-stamp); border-radius: .2em;
      color: var(--g-stamp); transform: rotate(-5deg); mix-blend-mode: var(--stamp-blend, multiply);
      animation: g6Stamp .42s .18s var(--g-spring) both;
    }
    #screen-login .g-lead { color: var(--g-muted); font-size: var(--fs-m, 16px); line-height: 1.6; max-width: 30em; }
    #screen-login .g-lead > span { display: inline-block; text-wrap: balance; } /* 문장 단위로 줄바꿈 */
    #screen-login .g-lead b { color: var(--g-ink); background: linear-gradient(transparent 58%, var(--g-boss-soft) 58%); padding: 0 2px; }

    /* 예시: 사내 단톡방에서 지시가 내려가며 짧아짐 (사장 100자 → 부장 50자 → 사원 10자) */
    #screen-login .gate-demo {
      grid-area: demo; overflow: hidden; border-radius: var(--r-l, 18px); background: var(--g-room);
      box-shadow: inset 0 0 0 2px rgba(48, 70, 90, .22), 0 12px 28px -14px var(--g-soft);
    }
    #screen-login .gd-head {
      display: flex; align-items: center; justify-content: space-between; gap: var(--s2, 8px); padding: 6px var(--s4, 16px);
      background: var(--g-room-head); color: var(--g-room-ink); font-size: var(--fs-xs, 12px); font-weight: 700;
    }
    #screen-login .gd-head b { font-family: var(--g-display); font-weight: 400; font-size: var(--fs-s, 14px); color: var(--g-ink); }
    /* "지시 전달 중" 옆 점 세 개: 단톡방에서 누가 입력 중인 것처럼 통통 */
    #screen-login .gd-dots { display: inline-flex; gap: 3px; margin-left: 4px; vertical-align: middle; }
    #screen-login .gd-dots i { width: 4px; height: 4px; border-radius: 50%; background: currentColor; animation: g6Dot 1.2s ease-in-out infinite; }
    #screen-login .gd-dots i:nth-child(2) { animation-delay: .15s; }
    #screen-login .gd-dots i:nth-child(3) { animation-delay: .3s; }
    #screen-login .gd-feed { display: grid; gap: var(--s2, 8px); padding: 10px var(--s3, 12px) var(--s3, 12px); }
    #screen-login .gd-msg { display: flex; align-items: center; gap: 6px; min-width: 0; }
    #screen-login .gd-msg.gd-ceo { flex-direction: row-reverse; }
    #screen-login .gd-ava {
      flex: none; display: grid; place-items: center; width: 36px; height: 30px; border-radius: var(--r-s, 8px);
      background: var(--rk); color: var(--rk-ink); font-size: var(--fs-xs, 12px); font-weight: 900;
      box-shadow: inset 0 0 0 2px var(--g-outline);
    }
    #screen-login .gd-ceo .gd-ava { --rk: var(--rank-0, #ffd23a); --rk-ink: var(--rank-ink-0, #2d2200); }
    #screen-login .gd-mid .gd-ava { --rk: var(--rank-2, #2f6bff); --rk-ink: var(--rank-ink-2, #ffffff); }
    #screen-login .gd-low .gd-ava { --rk: var(--rank-6, #ff5a9c); --rk-ink: var(--rank-ink-6, #2e0a19); }
    #screen-login .gd-bubble {
      min-width: 0; padding: 5px var(--s3, 12px); border-radius: 4px var(--r, 12px) var(--r, 12px) var(--r, 12px);
      background: var(--bubble, #ffffff); color: var(--bubble-ink, #221b2c);
      font-size: var(--fs-s, 14px); font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; box-shadow: 0 1px 0 var(--g-soft);
    }
    #screen-login .gd-ceo .gd-bubble { background: var(--g-boss); color: var(--g-boss-ink); border-radius: var(--r, 12px) 4px var(--r, 12px) var(--r, 12px); }
    #screen-login .gd-low .gd-bubble { background: var(--g-stamp-soft); color: var(--g-ink); box-shadow: inset 0 0 0 2px var(--g-stamp); }
    #screen-login .gd-limit {
      flex: none; padding: 1px 7px; border-radius: 999px; background: var(--g-stamp); color: var(--g-white);
      font-size: var(--fs-xs, 12px); font-weight: 900; line-height: 1.4; white-space: nowrap;
    }
    /* 처음: 사장 → 부장 → 사원 순서로 톡. 그다음 8초마다 다시 전달: 사원·부장 말풍선이 사라지고,
       사장 말풍선이 한 번 더 통 → 부장 → 사원이 다시 톡 (사원은 "?!" 하고 갸웃). 줄 전체가 아니라 안쪽만 커져서 상자 밖으로 잘리지 않음 */
    #screen-login .gd-msg { transform-origin: 0 50%; }
    #screen-login .gd-ceo .gd-bubble { transform-origin: 100% 50%; }
    #screen-login.active .gd-ceo { animation: g6Pop .36s .35s var(--g-ease) both; }
    #screen-login.active .gd-mid { animation: g6Pop .36s .85s var(--g-spring) both, g6AgainMid 8s 1.8s infinite; }
    #screen-login.active .gd-low { animation: g6Pop .4s 1.35s var(--g-spring) both, g6AgainLow 8s 1.8s infinite; }
    #screen-login.active .gd-ceo .gd-bubble { animation: g6Send 8s 1.8s infinite; }
    #screen-login.active .gd-low .gd-bubble { animation: g6Huh 8s 1.8s infinite; }

    /* 임시 출입증 (손님, 가장 먼저 눈에 띄는 길) */
    #screen-login .pass {
      grid-area: pass; position: relative; margin-top: var(--s3, 12px); container: pass / inline-size;
      border: var(--bw, 3px) solid var(--g-outline); border-radius: var(--r-l, 18px); background: var(--g-surface); box-shadow: 0 6px 0 var(--g-shadow);
    }
    #screen-login .pass::before, #screen-login .pass::after { content: ""; position: absolute; left: 50%; z-index: 1; }
    #screen-login .pass::before { top: -16px; width: 58px; height: 26px; margin-left: -29px; border: 3px solid var(--g-outline); border-radius: 9px; background: var(--g-surface); }
    #screen-login .pass::after { top: -8px; width: 30px; height: 8px; margin-left: -15px; border-radius: 4px; background: var(--g-outline); }
    #screen-login .pass-head {
      display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; padding: 18px var(--s4, 16px) var(--s3, 12px);
      border-radius: calc(var(--r-l, 18px) - 3px) calc(var(--r-l, 18px) - 3px) 0 0; border-bottom: var(--bw, 3px) solid var(--g-outline); background: var(--g-boss); color: var(--g-boss-ink);
    }
    #screen-login .pass-title { margin-right: auto; font-family: var(--g-display); font-weight: 400; font-size: var(--fs-2xl, 28px); line-height: 1.1; }
    #screen-login .pass-chip {
      padding: 3px 10px; border-radius: 999px; background: var(--g-surface); color: var(--g-ink);
      box-shadow: inset 0 0 0 2px var(--g-outline); font-size: var(--fs-xs, 12px); font-weight: 900; white-space: nowrap;
    }
    #screen-login .pass-body { display: grid; gap: var(--s3, 12px); padding: var(--s3, 12px) var(--s4, 16px) var(--s4, 16px); }
    #screen-login .pass-row { display: flex; align-items: stretch; gap: var(--s2, 8px); }
    #screen-login .pass-row input { flex: 1; min-height: 54px; font-size: var(--fs-l, 18px); }
    #screen-login #btn-guest { flex: none; min-height: 54px; padding: 0 var(--s4, 16px) 0 18px; font-size: var(--fs-xl, 22px); }
    #screen-login #btn-guest::after { content: "→"; font-family: var(--font-body, "Noto Sans KR", sans-serif); font-weight: 900; font-size: var(--fs-xl, 22px); }
    #screen-login .pass:has(#guest-name:not(:placeholder-shown)) #btn-guest:not(:disabled) { animation: g6Pulse 1.6s ease-in-out 3; }
    /* 좁은 휴대폰: 닉네임 칸을 넓게 (화살표 빼기 → 아주 좁으면 버튼을 아래로) */
    @container pass (max-width: 420px) { #screen-login #btn-guest { padding: 0 14px; } #screen-login #btn-guest::after { display: none; } }
    @container pass (max-width: 320px) { #screen-login .pass-row { flex-direction: column; } }
    #screen-login .pass-notes { display: grid; gap: var(--s1, 4px); color: var(--g-muted); font-size: var(--fs-s, 14px); line-height: 1.45; }
    #screen-login .pass-notes li { display: flex; gap: 6px; }
    #screen-login .pass-notes b { color: var(--g-ink); }
    #screen-login .pass-offline {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0 6px; padding: 6px var(--s3, 12px);
      border-radius: var(--r, 12px); background: var(--g-boss-soft); box-shadow: inset 0 0 0 2px var(--g-outline);
      color: var(--g-ink); font-size: var(--fs-s, 14px); font-weight: 700; animation: g6In .3s var(--g-ease) both;
    }
    #screen-login .pass-offline small { font-size: var(--fs-xs, 12px); font-weight: 500; }

    /* 또는 */
    #screen-login .gate-or { grid-area: or; display: flex; align-items: center; gap: 10px; color: var(--g-muted); font-size: var(--fs-s, 14px); font-weight: 900; }
    #screen-login .gate-or::before, #screen-login .gate-or::after { content: ""; flex: 1; border-top: 2px dashed var(--g-line); }

    /* 사원증 (계정 로그인) / 입사 서류 (가입) */
    #screen-login .idcard { grid-area: card; min-width: 0; container: idc / inline-size; }
    #screen-login .auth-tabs { position: relative; z-index: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 0 0 -2px; padding: 0 12px; }
    #screen-login .auth-tabs button {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
      min-height: 52px; margin: 0; padding: 6px 6px 9px; border: 2px solid var(--g-outline); border-bottom: 0;
      border-radius: var(--r, 12px) var(--r, 12px) 0 0; background: var(--g-sunken); color: var(--g-ink);
      font: inherit; font-size: var(--fs-m, 16px); font-weight: 900; line-height: 1.2; cursor: pointer;
      transform: translateY(5px); transition: transform .18s var(--g-spring), background-color .18s, color .18s;
    }
    #screen-login .auth-tabs button small { font-size: var(--fs-xs, 12px); font-weight: 700; color: inherit; opacity: .85; white-space: nowrap; }
    @media (hover: hover) { #screen-login .auth-tabs button:hover:not(.on) { transform: translateY(2px); } }
    #screen-login .auth-tabs button.on { transform: none; background: var(--g-ink); color: var(--g-surface); cursor: default; }
    #screen-login .auth-tabs button.on small { opacity: .9; }
    @container idc (max-width: 330px) { #screen-login .auth-tabs button { font-size: var(--fs-s, 14px); } #screen-login .auth-tabs button small { display: none; } }
    #screen-login .idc-sheet {
      position: relative; overflow: hidden; border: var(--bw-s, 2px) solid var(--g-outline); border-radius: var(--r-l, 18px);
      background: var(--g-surface); box-shadow: 0 4px 0 var(--g-shadow); animation: g6FlipA .3s var(--g-ease);
    }
    #screen-login .idc-strip {
      display: flex; align-items: center; gap: var(--s2, 8px); min-height: 42px; padding: 6px var(--s4, 16px);
      background: var(--g-ink); color: var(--g-surface); font-family: var(--g-display); font-weight: 400; font-size: var(--fs-m, 16px);
    }
    #screen-login .idc-logo { display: flex; align-items: center; gap: 6px; margin-right: auto; white-space: nowrap; }
    #screen-login .idc-logo i { font-style: normal; padding: 0 5px; border: 2px solid var(--g-stamp); border-radius: 6px; color: var(--g-stamp-on-ink); transform: rotate(-6deg); }
    #screen-login .idc-kind .k-signup { display: none; }
    #screen-login .idc-kind .k-login { animation: g6In .25s var(--g-ease); }
    #screen-login .idc-ranks {
      height: 6px;
      background: linear-gradient(90deg, var(--rank-0, #ffd23a) 0 14.3%, var(--rank-1, #7c4dff) 0 28.6%, var(--rank-2, #2f6bff) 0 42.9%,
        var(--rank-3, #0aa2b5) 0 57.1%, var(--rank-4, #4caf3a) 0 71.4%, var(--rank-5, #ff9014) 0 85.7%, var(--rank-6, #ff5a9c) 0);
    }
    #screen-login .idc-body { display: grid; gap: var(--s3, 12px); padding: var(--s4, 16px) var(--s4, 16px) var(--s3, 12px); }
    #screen-login .idc-photo {
      display: none; align-self: start; grid-template-rows: 1fr auto; justify-items: center; align-items: center;
      width: 64px; height: 82px; padding: 6px 0; border-radius: var(--r, 12px); background: var(--g-sunken);
      box-shadow: inset 0 0 0 2px var(--g-line); font-size: var(--fs-3xl, 36px); line-height: 1;
    }
    #screen-login .idc-photo small { padding: 1px 6px; border-radius: 6px; background: var(--g-boss); color: var(--g-boss-ink); font-size: var(--fs-xs, 12px); font-weight: 900; }
    #screen-login .idc-photo .ph-blank { display: none; font-size: var(--fs-xs, 12px); font-weight: 900; color: var(--g-muted); text-align: center; line-height: 1.3; }
    @container idc (min-width: 340px) {
      #screen-login .idc-body { grid-template-columns: 64px minmax(0, 1fr); column-gap: var(--s4, 16px); }
      #screen-login .idc-photo { display: grid; }
    }
    #screen-login .idc-fields { display: grid; gap: var(--s3, 12px); min-width: 0; }
    #screen-login #login-pw2-wrap { animation: g6Open .26s var(--g-ease) both; }
    /* 로그인 버튼은 게임의 보조 버튼 모양(흰 바탕 + 잉크 테두리): 노란 "바로 시작"이 늘 첫눈에 띄게.
       가입 탭을 고른 뒤에는 그 사람이 할 일이 가입이므로 잉크색 "가입하고 시작"으로 */
    #screen-login #btn-login { width: 100%; min-height: 50px; font-size: var(--fs-l, 18px); }
    #screen-login #btn-login::before { content: "🪪"; font-family: var(--font-body, "Noto Sans KR", sans-serif); font-size: var(--fs-l, 18px); }
    #login-form:has([data-mode="signup"].on) #btn-login { min-height: 54px; background: var(--g-ink); color: var(--g-surface); font-size: var(--fs-xl, 22px); }
    #screen-login .idc-code {
      height: 14px; margin: 0 var(--s4, 16px) var(--s3, 12px); border-radius: 2px; opacity: .55;
      background: repeating-linear-gradient(90deg, var(--g-ink) 0 2px, transparent 2px 4px, var(--g-ink) 4px 5px, transparent 5px 8px, var(--g-ink) 8px 11px, transparent 11px 13px, var(--g-ink) 13px 14px, transparent 14px 17px);
    }
    #screen-login .idc-foot { padding: 0 var(--s4, 16px) var(--s4, 16px); }
    /* 가입 탭: 사원증이 빨간 도장 찍힌 "입사 서류"로 바뀜 */
    #login-form:has([data-mode="signup"].on) .auth-tabs button.on { background: var(--g-stamp-soft); color: var(--g-ink); }
    #login-form:has([data-mode="signup"].on) .idc-sheet { background: var(--g-paper); animation-name: g6FlipB; }
    #login-form:has([data-mode="signup"].on) .idc-strip { background: var(--g-stamp-soft); color: var(--g-ink); }
    #login-form:has([data-mode="signup"].on) .idc-logo i { color: var(--g-stamp-text); }
    #login-form:has([data-mode="signup"].on) .idc-ranks { height: 3px; background: var(--g-stamp); }
    #login-form:has([data-mode="signup"].on) .idc-kind .k-login { display: none; }
    #login-form:has([data-mode="signup"].on) .idc-kind .k-signup {
      display: inline-block; padding: 1px var(--s2, 8px); border: var(--bw, 3px) solid var(--g-stamp); border-radius: var(--r-s, 8px); color: var(--g-stamp-text);
      transform: rotate(-6deg); mix-blend-mode: var(--stamp-blend, multiply); animation: g6Stamp .38s var(--g-spring) both;
    }
    #login-form:has([data-mode="signup"].on) .idc-photo { background: transparent; box-shadow: inset 0 0 0 2px var(--g-line); border: 2px dashed var(--g-muted); }
    #login-form:has([data-mode="signup"].on) .idc-photo .ph-face, #login-form:has([data-mode="signup"].on) .idc-photo small { display: none; }
    #login-form:has([data-mode="signup"].on) .idc-photo .ph-blank { display: block; grid-row: 1 / -1; }
    #login-form:has([data-mode="signup"].on) .idc-code { display: none; }
    #login-form:has([data-mode="signup"].on) #btn-login::before { content: "✍️"; }

    @container gate (min-width: 760px) {
      #screen-login .gate {
        max-width: none; gap: var(--s5, 24px) 0; align-items: start;
        grid-template-columns: minmax(0, 1.08fr) 56px minmax(0, 1fr);
        grid-template-areas: "hook . demo" "pass or card";
      }
      #screen-login .g-title { font-size: var(--fs-3xl, 36px); }
      #screen-login .gate-hook { align-self: center; }
      #screen-login .pass, #screen-login .idcard { margin-top: var(--s3, 12px); }
      #screen-login .gate-or { align-self: stretch; flex-direction: column; padding: 40px 0 8px; }
      #screen-login .gate-or::before, #screen-login .gate-or::after { border-top: 0; border-left: 2px dashed var(--g-line); }
    }

    /* 들어올 때: 위에서 아래로 차례로 툭 (살짝 튕김). 큰 연출은 "사장님" 도장 하나뿐이라 카드는 기울이지 않고 곧게 */
    #screen-login.active .gate-hook { animation: g6In .32s var(--g-ease) both; }
    #screen-login.active .gate-demo { animation: g6In .32s .06s var(--g-ease) both; }
    #screen-login.active .pass { animation: g6Drop .38s .1s var(--g-spring) both; }
    #screen-login.active .idcard { animation: g6Rise .38s .18s var(--g-spring) both; }

    /* ===== 이어하기: 결재 서류 ===== */
    #screen-resume { width: min(100%, 600px); margin-inline: auto; container: doc / inline-size; }
    #screen-resume .doc-wrap { display: grid; gap: var(--s4, 16px); }
    #screen-resume .g-title { font-family: var(--g-display); font-weight: 400; font-size: var(--fs-2xl, 28px); line-height: 1.2; animation: g6In .3s var(--g-ease) both; }
    #screen-resume .g-lead { margin-top: calc(-1 * var(--s2, 8px)); color: var(--g-muted); font-size: var(--fs-m, 16px); line-height: 1.55; animation: g6In .3s .04s var(--g-ease) both; }
    /* 이어할 수 없는 옛 저장(반려): "이어서 하거나…" 안내는 맞지 않으니 숨김 (반려 도장과 반려 사유가 설명) */
    #screen-resume:has(#resume-box .bad) #resume-lead { display: none; }
    #screen-resume .doc {
      position: relative; margin-top: var(--s1, 4px); overflow: hidden; border: var(--bw, 3px) solid var(--g-outline); border-radius: var(--r-l, 18px);
      background: var(--g-paper); box-shadow: 0 6px 0 var(--g-shadow); animation: g6Doc .38s .06s var(--g-spring) both;
    }
    #screen-resume .doc-head { display: flex; align-items: center; gap: var(--s3, 12px); padding: var(--s3, 12px) var(--s4, 16px); border-bottom: 4px double var(--g-outline); }
    #screen-resume .doc-name { display: grid; margin-right: auto; min-width: 0; }
    #screen-resume .doc-name small { color: var(--g-muted); font-size: var(--fs-xs, 12px); font-weight: 900; }
    #screen-resume .doc-name b { font-family: var(--g-display); font-weight: 400; font-size: var(--fs-2xl, 28px); line-height: 1.15; letter-spacing: .12em; }
    #screen-resume .doc-sign { flex: none; display: grid; grid-template-columns: repeat(3, 42px); overflow: hidden; border: 2px solid var(--g-outline); border-radius: 6px; background: var(--g-surface); }
    #screen-resume .doc-sign span { display: grid; grid-template-rows: 20px 34px; border-left: 2px solid var(--g-outline); }
    @container doc (max-width: 360px) {
      #screen-resume .doc-name b { font-size: var(--fs-xl, 22px); letter-spacing: .06em; }
      #screen-resume .doc-sign { grid-template-columns: repeat(3, 36px); }
    }
    #screen-resume .doc-sign span:first-child { border-left: 0; }
    #screen-resume .doc-sign i { border-bottom: 2px solid var(--g-outline); background: var(--g-sunken); font-size: var(--fs-xs, 12px); font-style: normal; font-weight: 900; line-height: 18px; text-align: center; }
    #screen-resume .doc-sign b { display: grid; place-items: center; }
    #screen-resume .doc-sign b:not(:empty) {
      width: 24px; height: 24px; margin: auto; border: 2px solid var(--g-stamp); border-radius: 50%;
      color: var(--g-stamp); font-size: var(--fs-xs, 12px); font-weight: 900; transform: rotate(-12deg); mix-blend-mode: var(--stamp-blend, multiply);
    }
    /* 도장: 결재란 바로 왼쪽, 머리글 밑줄에 걸쳐 쾅 (결재란·회사 이름과 겹치지 않게) */
    #screen-resume .doc-approve { position: relative; flex: none; }
    #screen-resume .doc-stamp {
      position: absolute; right: calc(100% + 10px); bottom: -15px; z-index: 2; display: grid; place-items: center; padding: 1px 8px;
      border: 3px solid var(--g-stamp); border-radius: 8px; color: var(--g-stamp);
      background: rgba(255, 253, 247, .55); background: color-mix(in srgb, var(--g-paper) 60%, transparent);
      font-family: var(--g-display); font-size: var(--fs-l, 18px); line-height: 1.15; white-space: nowrap;
      transform: rotate(-8deg); mix-blend-mode: var(--stamp-blend, multiply); pointer-events: none;
      animation: g6Stamp .42s .3s var(--g-spring) both;
    }
    #screen-resume .doc-stamp::before { content: "결재 대기"; }
    #screen-resume:has(#resume-box .bad) .doc-stamp { padding: 0 var(--s3, 12px); font-size: var(--fs-xl, 22px); }
    #screen-resume:has(#resume-box .bad) .doc-stamp::before { content: "반려"; }
    #screen-resume:not(:has(#resume-box .big)) .doc-stamp { padding: 0 var(--s3, 12px); font-size: var(--fs-xl, 22px); border-color: var(--g-muted); color: var(--g-muted); }
    #screen-resume:not(:has(#resume-box .big)) .doc-stamp::before { content: "보류"; }
    @container doc (max-width: 300px) { #screen-resume .doc-name small { display: none; } #screen-resume .doc-stamp { font-size: var(--fs-s, 14px); padding: 0 6px; } }
    #screen-resume .doc-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s3, 12px); padding: var(--s4, 16px); }
    #resume-box p { margin: 0; }
    #resume-box .ctitle { display: flex; align-items: center; gap: var(--s3, 12px); min-width: 0; }
    #resume-box .ctitle .emoji { flex: none; display: grid; place-items: center; width: 52px; height: 52px; border-radius: var(--r, 12px); background: var(--g-sunken); font-size: var(--fs-2xl, 28px); line-height: 1; }
    #resume-box .ctitle > div { min-width: 0; }
    #resume-box .ctitle b { display: block; font-family: var(--g-display); font-weight: 400; font-size: var(--fs-xl, 22px); line-height: 1.2; overflow-wrap: anywhere; }
    /* 긴 사훈·이름이 띄어쓰기 없이 와도 좁은 화면(320px)에서 서류 밖으로 나가지 않게 아무 데서나 줄바꿈 */
    #resume-box .ctitle small { display: block; color: var(--g-muted); font-size: var(--fs-s, 14px); font-weight: 700; overflow-wrap: anywhere; }
    #resume-box .motto { min-width: 0; color: var(--g-ink); font-size: var(--fs-s, 14px); font-weight: 700; overflow-wrap: anywhere; }
    #resume-box .big {
      display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1, 4px) 10px; padding: 10px var(--s3, 12px); border-radius: var(--r, 12px);
      background: var(--g-boss-soft); font-family: var(--g-display); font-weight: 400; font-size: var(--fs-xl, 22px); line-height: 1.25;
    }
    #resume-box .big::before {
      content: "📍 멈춘 곳"; padding: 2px 9px; border-radius: 999px; background: var(--g-surface); box-shadow: inset 0 0 0 2px var(--g-outline);
      font-family: var(--font-body, "Noto Sans KR", sans-serif); font-size: var(--fs-xs, 12px); font-weight: 900; line-height: 1.5;
    }
    /* 반려 사유: 로그인 화면 오류 쪽지와 같은 모양 (빨간 테두리 + 도장 칩) */
    #resume-box .bad {
      display: flex; align-items: flex-start; gap: var(--s2, 8px); padding: 10px var(--s3, 12px);
      border: var(--bw-s, 2px) solid var(--g-loss); border-radius: var(--r, 12px);
      background: var(--g-loss-soft); color: var(--g-ink); font-size: var(--fs-s, 14px); font-weight: 700; line-height: 1.5;
    }
    #resume-box .bad::before {
      content: "반려 사유"; flex: none; margin-top: 1px; padding: 0 6px;
      border: var(--bw-s, 2px) solid var(--g-stamp); border-radius: var(--r-s, 8px); color: var(--g-stamp-text);
      font-family: var(--g-display); font-weight: 400; font-size: var(--fs-s, 14px); line-height: 18px; white-space: nowrap;
      transform: rotate(-4deg); mix-blend-mode: var(--stamp-blend, multiply);
    }
    #resume-box p:has(> b.pos, > b.neg) {
      display: flex; flex-wrap: wrap; align-items: baseline; column-gap: .45em; padding-top: var(--s3, 12px);
      border-top: 2px dashed var(--g-line); color: var(--g-muted); font-size: var(--fs-s, 14px); font-weight: 700;
    }
    #resume-box p > :is(b.pos, b.neg) { order: -1; flex-basis: 100%; font-family: var(--g-display); font-weight: 400; font-size: var(--fs-3xl, 36px); line-height: 1.15; font-variant-numeric: tabular-nums; }
    #resume-box b.pos { color: var(--g-money); }
    #resume-box b.neg { color: var(--g-loss); }
    #resume-box .hint { color: var(--g-muted); font-size: var(--fs-s, 14px); line-height: 1.5; }
    #resume-box:not(:has(.ctitle)) > p:first-child { font-size: var(--fs-m, 16px); font-weight: 700; line-height: 1.55; }
    #resume-box:not(:has(.ctitle)) > p:first-child::before { content: "📡 "; }
    #screen-resume .doc-actions { display: grid; gap: var(--s3, 12px); animation: g6In .3s .22s var(--g-ease) both; }
    @container doc (min-width: 460px) { #screen-resume .doc-actions { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); } }
    #screen-resume #btn-resume { min-height: 60px; font-size: var(--fs-xl, 22px); }
    #screen-resume #btn-resume:not(:disabled)::after { content: "→"; font-family: var(--font-body, "Noto Sans KR", sans-serif); font-weight: 900; }
    #screen-resume:not(:has(#resume-box .big)) #btn-resume:not(:disabled)::after { content: "↻"; }
    #screen-resume #btn-new-game { min-height: 60px; padding: 6px var(--s4, 16px); font-family: inherit; font-size: var(--fs-m, 16px); font-weight: 700; line-height: 1.35; }
    /* 이어할 수 없는 옛 저장(반려): 할 수 있는 일인 '새로 시작'을 노란 버튼으로 앞에 */
    #screen-resume:has(#resume-box .bad) #btn-new-game { order: -1; background: var(--g-boss); color: var(--g-boss-ink); font-family: var(--g-display); font-weight: 400; font-size: var(--fs-xl, 22px); }
    #screen-resume #btn-new-game.armed, #screen-resume:has(#resume-box .bad) #btn-new-game.armed {
      border-color: var(--g-stamp); background: var(--g-stamp-soft); color: var(--g-ink);
      font-family: inherit; font-size: var(--fs-m, 16px); font-weight: 700; animation: g6Shake .32s ease-in-out;
    }

    /* ===== 저장된 로그인 확인: 출입 카드 리더기 ===== */
    #screen-auth-wait { width: min(100%, 480px); margin-inline: auto; }
    #screen-auth-wait .g-wait { display: grid; justify-items: center; gap: 6px; padding: 48px 16px 24px; text-align: center; animation: g6In .3s var(--g-ease) both; }
    #screen-auth-wait .reader { position: relative; width: 168px; height: 150px; margin-bottom: 12px; }
    #screen-auth-wait .rd-body {
      position: absolute; left: 62px; top: 8px; display: grid; justify-items: center; align-content: center; gap: 10px;
      width: 88px; height: 128px; border: 3px solid var(--g-outline); border-radius: 20px;
      background: var(--g-surface); box-shadow: 0 6px 0 var(--g-shadow);
    }
    #screen-auth-wait .rd-pad {
      display: grid; place-items: center; width: 60px; height: 46px; border-radius: 12px;
      border: 2px dashed var(--g-line); color: var(--g-muted); font-size: var(--fs-l, 18px); line-height: 1;
    }
    #screen-auth-wait .rd-screen {
      display: grid; place-items: center; width: 60px; height: 36px; border-radius: var(--r-s, 8px);
      background: var(--g-outline); color: var(--g-boss); font-weight: 900; font-size: var(--fs-m, 16px); line-height: 1; letter-spacing: 2px;
      animation: g6Screen 2s infinite;
    }
    #screen-auth-wait .rd-screen span { grid-area: 1 / 1; }
    #screen-auth-wait .rd-ok { opacity: 0; font-size: var(--fs-xl, 22px); letter-spacing: 0; animation: g6Ok 2s infinite; }
    #screen-auth-wait .rd-wait { animation: g6Dots 2s infinite; }
    #screen-auth-wait .rd-card {
      position: absolute; left: 0; top: 52px; z-index: 2; width: 74px; height: 48px; overflow: hidden;
      border: 3px solid var(--g-outline); border-radius: 9px; background: var(--g-surface); box-shadow: 0 3px 0 var(--g-shadow);
      transform: rotate(-14deg); animation: g6Tap 2s var(--g-ease) infinite;
    }
    #screen-auth-wait .rd-card::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 11px; background: var(--g-boss); border-bottom: 2px solid var(--g-outline); }
    #screen-auth-wait .rd-card::after {
      content: ""; position: absolute; left: 7px; top: 18px; width: 15px; height: 18px; border-radius: 4px; background: var(--g-sunken);
      box-shadow: 21px 1px 0 -5px var(--g-line), 21px 9px 0 -5px var(--g-line), 33px 1px 0 -5px var(--g-line);
    }
    #screen-auth-wait .rd-beep {
      position: absolute; right: -6px; top: -4px; z-index: 3; padding: 2px 9px; border-radius: 999px;
      background: var(--g-money); color: var(--g-white); font-size: var(--fs-s, 14px); font-weight: 900; opacity: 0; animation: g6Beep 2s infinite;
    }
    #screen-auth-wait .wait-title { font-family: var(--g-display); font-weight: 400; font-size: var(--fs-2xl, 28px); line-height: 1.2; }
    #screen-auth-wait .wait-sub { color: var(--g-muted); font-size: var(--fs-m, 16px); line-height: 1.55; }

    /* ===== 👤 배지: 미니 사원증 (왼쪽 노란 띠 = 사장 직급 색, 목걸이 구멍) ===== */
    button.pill.user {
      position: relative; display: inline-block; vertical-align: middle; flex: none;
      max-width: min(46vw, 260px); min-height: 0; margin: 0; padding: 0 var(--s3, 12px) 0 24px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left;
      border: 2px solid var(--outline, #221b2c); border-radius: var(--r-s, 8px);
      background: linear-gradient(90deg, var(--rank-0, #ffd23a) 0 13px, var(--outline, #221b2c) 13px 15px, var(--surface, #ffffff) 15px);
      color: var(--ink, #221b2c); box-shadow: 0 2px 0 var(--shadow-ink, #221b2c);
      font-family: inherit; font-size: var(--fs-s, 14px); font-weight: 700;
      /* 높이는 옆 .pill과 같게: #1 디자인(토큰 --lift가 있고 .pill이 44px)이면 40+4=44px, 지금 main(.pill 34px)이면 30+4=34px.
         로그인하는 순간 윗줄이 높아져 화면 전체가 덜컥 내려가지 않게 */
      line-height: calc(30px + 2.5 * var(--lift, 0px));
      transform-origin: 50% -30%; transition: transform .16s var(--spring, cubic-bezier(.34, 1.56, .64, 1)), box-shadow .14s;
    }
    button.pill.user::before {
      content: ""; position: absolute; left: 4px; top: 50%; width: 5px; height: 5px; margin-top: -3px; border-radius: 50%;
      background: var(--bg, #f5efe4); box-shadow: inset 0 1px 1px rgba(34, 27, 44, .5);
    }
    @media (hover: hover) { button.pill.user:hover { transform: rotate(-3deg); } }
    button.pill.user:active { transform: translateY(2px); box-shadow: 0 0 0 var(--shadow-ink, #221b2c); }
    button.pill.user:focus-visible { outline: 3px solid var(--focus, #2f6bff); outline-offset: 3px; }
    button.pill.user.armed {
      background: linear-gradient(90deg, var(--stamp, #df3328) 0 13px, var(--outline, #221b2c) 13px 15px, var(--stamp-soft, #fde3de) 15px);
      animation: g6Shake .32s ease-in-out;
    }
    @media (max-width: 520px) {
      /* #1 HUD(한 줄에 여러 칸): 이름을 두 줄로 접어 좁게 */
      .hud button.pill.user { max-width: 132px; height: 44px; padding: 5px var(--s2, 8px) 5px 21px; white-space: normal; word-break: break-all; font-size: var(--fs-xs, 12px); line-height: 15px; }
      /* 지금 main 머리(버튼이 여러 줄로 감김): 배지를 순위표 버튼 옆으로 보내 줄이 하나 더 생기지 않게, 한 줄 + 말줄임 */
      header:not(.hud) button.pill.user { order: 1; max-width: calc(100vw - 150px); font-size: var(--fs-xs, 12px); }
    }

    /* ===== 결산 화면 (로그인 중): 다음 관람객에게 넘기는 버튼을 맨 앞에 크게 ===== */
    #btn-logout-next::before { content: "👋 "; }
    /* #1 디자인처럼 옆 버튼이 큰 버튼(.cta)이면 같은 크기로 */
    #screen-final :has(> .cta) > #btn-logout-next { min-height: 60px; padding: 0 var(--s6, 32px); border-radius: var(--r-l, 18px); font-size: var(--fs-xl, 22px); }
    @media (max-width: 759px) { #screen-final :has(> .cta) > #btn-logout-next { min-height: 56px; font-size: var(--fs-l, 18px); } }
    /* 휴대폰: 다음 사람 버튼은 한 줄 전체, 나머지 버튼은 남은 줄을 나눠 채움 (가운데 들쭉날쭉하지 않게) */
    @media (max-width: 520px) {
      #btn-logout-next { flex: 1 1 100%; }
      #screen-final :has(> #btn-logout-next:not([hidden])) > button:not(#btn-logout-next) { flex: 1 1 auto; }
    }

    /* ===== 창업 화면 (로그인 중): 닉네임 칸 밑 "로그인한 아이디로 기록돼요" 안내 (아래 renderFound가 붙임) ===== */
    #found-box .locked-note { font-weight: 400; color: var(--muted, #6b6276); font-size: var(--fs-xs, 12px); }

    /* ===== 움직임 ===== */
    @keyframes g6In { from { opacity: 0; transform: translateY(10px); } }
    @keyframes g6Drop { from { opacity: 0; transform: translateY(-22px); } }
    @keyframes g6Rise { from { opacity: 0; transform: translateY(22px); } }
    @keyframes g6Doc { from { opacity: 0; transform: translateY(26px) rotate(-2deg) scale(.97); } }
    @keyframes g6Open { from { opacity: 0; transform: translateY(-8px); } }
    @keyframes g6FlipA { from { transform: translateY(-3px) scale(.985); } }
    @keyframes g6FlipB { from { transform: translateY(-3px) scale(.985); } }
    @keyframes g6Stamp { 0% { opacity: 0; transform: rotate(-16deg) scale(2.2); } 60% { opacity: 1; transform: rotate(-8deg) scale(.92); } }
    @keyframes g6Tick { from { transform: scale(.3); } }
    @keyframes g6Shake { 0%, 100% { translate: 0 0; } 20% { translate: -6px 0; } 40% { translate: 5px 0; } 60% { translate: -3px 0; } 80% { translate: 2px 0; } }
    @keyframes g6Pulse { 0%, 100% { box-shadow: 0 4px 0 var(--g-shadow), 0 0 0 0 rgba(255, 210, 58, .7); } 50% { box-shadow: 0 4px 0 var(--g-shadow), 0 0 0 10px rgba(255, 210, 58, 0); } }
    @keyframes g6Busy { to { background-position: 22.63px 0; } }
    @keyframes g6Pop { from { opacity: 0; transform: translateY(8px) scale(.7); } }
    /* 8초 한 바퀴 (0% = 사원이 막 다시 톡 한 순간): 78~84% 사원·부장 사라짐 → 84~90% 사장 말풍선 통 → 89~97% 부장·사원 다시 톡 */
    @keyframes g6AgainLow {
      0%, 78%, 100% { opacity: 1; translate: 0 0; scale: 1; }
      81.5%, 92.5% { opacity: 0; translate: 0 8px; scale: .7; }
      96% { opacity: 1; translate: 0 -2px; scale: 1.04; }
    }
    @keyframes g6AgainMid {
      0%, 80.5%, 100% { opacity: 1; translate: 0 0; scale: 1; }
      84%, 88.5% { opacity: 0; translate: 0 8px; scale: .7; }
      92% { opacity: 1; translate: 0 -2px; scale: 1.04; }
      94.5% { opacity: 1; translate: 0 0; scale: 1; }
    }
    @keyframes g6Send { 0%, 84.5%, 90%, 100% { scale: 1; } 87% { scale: 1.05; } }
    @keyframes g6Huh { 0%, 13%, 100% { rotate: 0deg; } 3% { rotate: -4deg; } 6% { rotate: 3.5deg; } 9% { rotate: -2deg; } }
    @keyframes g6Dot { 0%, 60%, 100% { translate: 0 0; opacity: .45; } 30% { translate: 0 -3px; opacity: 1; } }
    @keyframes g6Tap { 0%, 12%, 88%, 100% { transform: rotate(-14deg); } 38% { transform: translate(66px, -30px) rotate(-3deg); } 44%, 66% { transform: translate(69px, -33px) rotate(0deg); } }
    @keyframes g6Screen { 0%, 42%, 70%, 100% { background: var(--g-outline); } 46%, 66% { background: var(--g-money); } }
    @keyframes g6Ok { 0%, 42%, 70%, 100% { opacity: 0; transform: scale(.5); color: var(--g-white); } 47% { opacity: 1; transform: scale(1.2); color: var(--g-white); } 52%, 66% { opacity: 1; transform: none; color: var(--g-white); } }
    @keyframes g6Dots { 0%, 40%, 72%, 100% { opacity: 1; } 44%, 68% { opacity: 0; } }
    @keyframes g6Beep { 0%, 43% { opacity: 0; transform: scale(.6); } 48% { opacity: 1; transform: scale(1.15); } 53%, 64% { opacity: 1; transform: none; } 70%, 100% { opacity: 0; } }

    @media (prefers-reduced-motion: reduce) {
      :is(#screen-login, #screen-resume, #screen-auth-wait), :is(#screen-login, #screen-resume, #screen-auth-wait) *,
      :is(#screen-login, #screen-resume, #screen-auth-wait) *::before, :is(#screen-login, #screen-resume, #screen-auth-wait) *::after,
      button.pill.user, #btn-logout-next { animation: none !important; transition: none !important; }
      #screen-auth-wait .rd-beep, #screen-auth-wait .rd-ok { display: none; }
    }
  `;
  document.head.appendChild(style);

  const main = document.querySelector("main");
  main.insertAdjacentHTML("afterbegin", `
    <section id="screen-login" class="screen" aria-labelledby="gate-title">
      <div class="gate">
        <div class="gate-hook">
          <p class="g-kicker"><span aria-hidden="true">🏢</span> 출근 첫날 · 정문 앞</p>
          <h2 class="g-title" id="gate-title">오늘부터 <span class="g-stamp">사장님</span>!</h2>
          <p class="g-lead"><span>내 지시가 사원까지 내려가면 <b>딱 10자</b>만 남아요.</span> <span>이 회사, 1년 버틸 수 있을까요?</span></p>
        </div>
        <figure class="gate-demo" aria-label="예시: 사장 지시가 부장, 사원으로 내려가며 짧아져요">
          <figcaption class="gd-head"><b>💬 사내 단톡방</b><span>지시 전달 중<span class="gd-dots" aria-hidden="true"><i></i><i></i><i></i></span></span></figcaption>
          <ol class="gd-feed">
            <li class="gd-msg gd-ceo"><span class="gd-ava">사장</span><span class="gd-bubble">고객 불만 원인 찾아서 내일까지 해결책 보고해요</span><span class="gd-limit">100자</span></li>
            <li class="gd-msg gd-mid"><span class="gd-ava">부장</span><span class="gd-bubble">불만 원인 찾아 보고</span><span class="gd-limit">50자</span></li>
            <li class="gd-msg gd-low"><span class="gd-ava">사원</span><span class="gd-bubble">불 찾아옴?! 🔥</span><span class="gd-limit">10자</span></li>
          </ol>
        </figure>

        <div class="pass" id="guest-box" role="group" aria-labelledby="pass-title">
          <div class="pass-head">
            <h3 class="pass-title" id="pass-title">임시 출입증</h3>
            <span class="pass-chip">가입 없이 바로</span>
          </div>
          <div class="pass-body">
            <div class="g-field">
              <div class="g-label-row">
                <label for="guest-name">닉네임</label>
                <span class="g-rules" id="guest-rules">
                  <span class="g-rule" data-rule="len">2~10자</span><span class="g-rule" data-rule="chars">한글·영문·숫자·_</span>
                </span>
              </div>
              <div class="pass-row">
                <input id="guest-name" maxlength="10" autocomplete="nickname" placeholder="예: 경희왕" enterkeyhint="go" autocapitalize="off" spellcheck="false" aria-describedby="guest-rules">
                <button type="button" id="btn-guest" class="g-btn g-go">바로 시작</button>
              </div>
            </div>
            <p id="guest-error" class="g-error" role="alert"></p>
            <p class="pass-offline" id="offline-box" hidden><span>📡 서버가 답하지 않나요?</span>
              <button type="button" id="btn-offline" class="g-link">로그인 없이 하기</button> <small>(순위는 이 기기에만 남아요)</small></p>
            <ul class="pass-notes">
              <li><span aria-hidden="true">🏆</span><span>순위표에 <b>닉네임(손님)</b>으로 올라가요</span></li>
              <li><span aria-hidden="true">⏸️</span><span>손님은 이어하기가 없어요. 중간에 나가면 처음부터예요.</span></li>
            </ul>
          </div>
        </div>

        <p class="gate-or">또는</p>

        <form class="idcard" id="login-form" autocomplete="on">
          <div class="auth-tabs" role="group" aria-label="계정으로 하기">
            <button type="button" data-mode="login" class="on" aria-pressed="true">로그인<small>사원증 찍고 이어하기</small></button>
            <button type="button" data-mode="signup" aria-pressed="false">처음이에요 (가입)<small>새 사원증 만들기</small></button>
          </div>
          <div class="idc-sheet">
            <div class="idc-strip">
              <span class="idc-logo"><i aria-hidden="true">10자</i>사원 주식회사</span>
              <span class="idc-kind"><span class="k-login">사원증</span><span class="k-signup">입사 서류</span></span>
            </div>
            <div class="idc-ranks" aria-hidden="true"></div>
            <div class="idc-body">
              <div class="idc-photo" aria-hidden="true"><span class="ph-face">👤</span><span class="ph-blank">증명<br>사진</span><small>사장</small></div>
              <div class="idc-fields">
                <div class="g-field">
                  <div class="g-label-row">
                    <label for="login-id">아이디</label>
                    <span class="g-rules" id="id-rules">
                      <span class="g-rule" data-rule="len">2~10자</span><span class="g-rule" data-rule="chars">한글·영문·숫자·_</span>
                    </span>
                  </div>
                  <input id="login-id" maxlength="10" autocomplete="username" required placeholder="순위표에 나올 이름" enterkeyhint="next" autocapitalize="off" spellcheck="false" aria-describedby="id-rules">
                </div>
                <div class="g-field">
                  <div class="g-label-row">
                    <label for="login-pw">비밀번호</label>
                    <span class="g-rules" id="pw-rules"><span class="g-rule" data-rule="pw">4자 이상</span></span>
                  </div>
                  <input id="login-pw" type="password" maxlength="64" autocomplete="current-password" required placeholder="비밀번호 입력" aria-describedby="pw-rules">
                </div>
                <div class="g-field" id="login-pw2-wrap" hidden>
                  <div class="g-label-row">
                    <label for="login-pw2">비밀번호 확인</label>
                    <span class="g-rules" id="pw2-rules"><span class="g-rule" data-rule="same">똑같이 한 번 더</span></span>
                  </div>
                  <input id="login-pw2" type="password" maxlength="64" autocomplete="new-password" placeholder="한 번 더 입력" enterkeyhint="go" aria-describedby="pw2-rules">
                </div>
                <p id="login-error" class="g-error" role="alert"></p>
                <button type="submit" id="btn-login" class="g-btn">로그인</button>
              </div>
            </div>
            <div class="idc-code" aria-hidden="true"></div>
            <p class="g-note idc-foot">🔒 비밀번호는 암호화해서 저장해요. 학교 계정처럼 다른 곳에서 쓰는 비밀번호는 피해 주세요.</p>
          </div>
        </form>
      </div>
    </section>
    <section id="screen-resume" class="screen">
      <div class="doc-wrap">
        <h2 class="g-title" id="resume-title">하던 게임이 있어요</h2>
        <p class="g-lead" id="resume-lead">이어서 하거나, 새 회사를 차릴 수 있어요.</p>
        <article class="doc" aria-labelledby="resume-title">
          <div class="doc-head">
            <p class="doc-name"><small>10자 사원 주식회사</small><b>결재 서류</b></p>
            <div class="doc-approve" aria-hidden="true">
              <span class="doc-stamp"></span>
              <div class="doc-sign">
                <span><i>담당</i><b>김</b></span><span><i>부장</i><b>박</b></span><span><i>사장</i><b></b></span>
              </div>
            </div>
          </div>
          <div class="doc-body" id="resume-box"></div>
        </article>
        <div class="doc-actions">
          <button id="btn-resume" class="g-btn g-go">이어서 하기</button>
          <button id="btn-new-game" class="g-btn">새로 시작</button>
        </div>
      </div>
    </section>
    <section id="screen-auth-wait" class="screen">
      <div class="g-wait" role="status">
        <div class="reader" aria-hidden="true">
          <span class="rd-body"><span class="rd-pad">📶</span><span class="rd-screen"><span class="rd-wait">···</span><span class="rd-ok">✓</span></span></span>
          <span class="rd-card"></span>
          <span class="rd-beep">삑!</span>
        </div>
        <p class="wait-title">출입 확인 중…</p>
        <p class="wait-sub">저장해 둔 사원증(로그인)을 확인하고 있어요</p>
      </div>
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

  // ----- 화면 연출용 작은 코드: 보기만 바꾸고, 제출·로그인·저장 흐름(아래)은 건드리지 않습니다 -----

  // 아이디·닉네임·비밀번호 규칙을 입력하는 동안 바로 보여 주기 (ok = ✓, bad = ✗, 빈 값 = 아직)
  // 한글 입력기는 글자를 조합하는 동안 "경ㅎ"처럼 낱자(ㅎ)를 잠깐 보여 줍니다. 조합 중에는 낱자를 빼고 보고,
  // 조합이 끝난 뒤(compositionend)에만 낱자까지 엄격하게 봅니다 (안 그러면 한 글자 칠 때마다 ✗가 깜빡임)
  const JAMO = /[ㄱ-ㅎㅏ-ㅣ]/g;
  const RULES = {
    len: v => (v.trim().length >= 2 ? "ok" : ""),
    chars: (v, composing) => {
      const s = (composing ? v.replace(JAMO, "") : v).trim();
      return !s ? "" : /^[0-9A-Za-z가-힣_]+$/.test(s) ? "ok" : "bad";
    },
    pw: v => (v.length >= 4 ? "ok" : ""),
    same: v => (v && v === (document.getElementById("login-pw")?.value || "") ? "ok" : "")
  };
  function liveRules(inputId, rulesId) {
    const input = document.getElementById(inputId);
    const box = document.getElementById(rulesId);
    if (typeof input?.addEventListener !== "function" || typeof box?.querySelectorAll !== "function") return () => {};
    let composing = false;
    const check = () => box.querySelectorAll("[data-rule]").forEach(r => {
      const result = RULES[r.dataset.rule] ? RULES[r.dataset.rule](String(input.value || ""), composing) : "";
      r.classList.toggle("ok", result === "ok");
      r.classList.toggle("bad", result === "bad");
    });
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => {
      composing = false;
      setTimeout(check, 0); // 바로 다음 글자 조합이 시작됐으면 그 조합 기준으로 (composing이 다시 true)
    });
    input.addEventListener("input", e => {
      if (e?.isComposing) composing = true;
      check();
    });
    input.addEventListener("blur", () => { composing = false; check(); });
    return check;
  }
  liveRules("guest-name", "guest-rules");
  liveRules("login-id", "id-rules");
  const checkPw2 = liveRules("login-pw2", "pw2-rules");
  const checkPw = liveRules("login-pw", "pw-rules");
  document.getElementById("login-pw")?.addEventListener?.("input", () => { checkPw(); checkPw2(); });

  // 로그인·가입 탭: 눌린 탭을 화면 읽기 프로그램에도 알려 줌
  const authTabs = document.getElementById("login-form")?.querySelectorAll?.(".auth-tabs button") || [];
  authTabs.forEach(b => b.addEventListener("click", () => authTabs.forEach(x => x.setAttribute("aria-pressed", String(x === b)))));

  // 휴대폰 키보드가 올라온 뒤, 입력 칸과 "바로 시작"/"로그인" 버튼이 같이 보이게 한 번만 살짝 스크롤
  function keepButtonInView(field, btn) {
    const view = window.visualViewport;
    if (!view || typeof btn?.getBoundingClientRect !== "function") return;
    const f = field.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const hidden = b.bottom + 12 - (view.offsetTop + view.height); // 버튼이 화면 아래로 가려진 만큼
    const room = f.top - 8 - view.offsetTop;                       // 입력 칸을 위로 올릴 수 있는 만큼
    const by = Math.min(hidden, room);
    const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (by > 0) window.scrollBy({ top: by, behavior: calm ? "auto" : "smooth" });
  }
  document.getElementById("screen-login")?.addEventListener?.("focusin", e => {
    const field = e.target;
    if (!field || field.tagName !== "INPUT") return;
    const btn = document.getElementById(field.id === "guest-name" ? "btn-guest" : "btn-login");
    setTimeout(() => { if (document.activeElement === field) keepButtonInView(field, btn); }, 350);
  });

  // 👤 배지와 '새로 시작': 글자가 "한 번 더 누르기"로 바뀌면 빨간 경고 모양 (글자는 아래 코드가 바꿉니다)
  // 배지는 좁은 화면에서 이름이 잘릴 수 있어 전체 글자를 title로도 넣어 둡니다.
  if (typeof MutationObserver === "function") {
    [userBtn, document.getElementById("btn-new-game")].forEach(el => {
      if (!el) return;
      new MutationObserver(() => {
        el.classList.toggle("armed", el.textContent.includes("한 번 더 누르기"));
        if (el === userBtn) el.title = el.textContent;
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  // 서버가 답하지 않아 "로그인 없이 하기"가 처음 나타나면, 화면 아래에 가려져 있을 수 있으니 보이는 곳까지 살짝 스크롤
  const offlineBox = document.getElementById("offline-box");
  if (typeof MutationObserver === "function" && typeof offlineBox?.scrollIntoView === "function") {
    new MutationObserver(() => {
      if (offlineBox.hidden) return;
      const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      offlineBox.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    }).observe(offlineBox, { attributes: true, attributeFilter: ["hidden"] });
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
