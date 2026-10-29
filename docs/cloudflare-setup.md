# 팀 중간 서버 만들기 (Cloudflare Workers, 무료, 15분)

**왜 필요한가**: 심사위원과 관람객이 키 없이 바로 ChatKHU로 플레이하게 하려고. 팀 키는 이 서버에만 비밀로 저장되고, 게임 코드와 GitHub에는 들어가지 않습니다.

**누가**: 팀장 한 명만 하면 됩니다.

---

## 0. 키 새로 만들기 (먼저!)

1. ChatKHU → API Gateway에서 **새 키**를 만듭니다. 이름은 `team-server` 정도로.
2. 키가 화면에 나오면 **복사만** 하고, 캡처하거나 단톡방에 올리지 마세요.
3. 예전에 화면에 노출된 키는 API Gateway에서 **해지**하세요.

## 1. Cloudflare 가입

[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)에서 이메일로 무료 가입합니다. 카드 등록은 필요 없습니다.

## 2. Worker 만들기

1. 왼쪽 메뉴에서 **Workers & Pages** (또는 Compute → Workers)
2. **Create** → **Create Worker** (또는 "Start with Hello World")
3. 이름: `khu-company-battle` → **Deploy**
4. 배포가 끝나면 **Edit code** 버튼
5. 편집기에 있는 기존 코드를 **전부 지우고**, 저장소의 [`worker/worker.js`](../worker/worker.js) 내용을 통째로 붙여넣기
   - GitHub에서 `worker/worker.js`를 열고 오른쪽 위 복사 아이콘(Copy raw file)을 누르면 편합니다.
6. 오른쪽 위 **Deploy**

## 3. 키를 비밀값으로 넣기

1. 만든 Worker 화면 → **Settings** → **Variables and Secrets** → **Add**
2. Type: **Secret**
3. Variable name: `CHATKHU_KEY` (대소문자 정확히)
4. Value: 0번에서 복사한 ChatKHU 키
5. **Deploy** (또는 Save)

## 4. 확인

Worker 화면에 나오는 주소(`https://khu-company-battle.○○○.workers.dev`)를 브라우저로 엽니다.

```
{"ok":true,"service":"10자 사원 주식회사 중간 서버","keySet":true}
```

- `keySet: true`면 성공입니다.
- `false`면 3번의 이름 `CHATKHU_KEY`를 확인하세요.

## 5. 게임에 연결

Worker 주소를 Claude(또는 담당 C)에게 알려 주면 `js/ai.js`의 `TEAM_SERVER_URL`에 넣고 올립니다. **주소는 공개돼도 괜찮지만, 키는 절대 보내지 마세요.**

직접 하려면: `js/ai.js`에서
```js
const TEAM_SERVER_URL = "";
```
을
```js
const TEAM_SERVER_URL = "https://khu-company-battle.○○○.workers.dev";
```
로 바꾸고 Commit → Push.

## 6. 연결 후 정리

- 게임 화면 오른쪽 위 버튼이 `🔌 ChatKHU · … · 팀 서버`로 나오면 됩니다.
- 전에 게임에 개인 키를 저장했던 노트북은 🔌 버튼 → **내 키 지우고 팀 서버 쓰기**를 누르세요. 개인 키가 있으면 그게 먼저 쓰입니다.

---

## 서버가 막아 주는 것 (`worker/worker.js`)

| 장치 | 내용 |
|---|---|
| 주소 제한 | 우리 게임 주소(`seanrock0328.github.io`)와 `localhost:8000`에서 온 요청만 받음 |
| 횟수 제한 | 용도별로 따로 셈 (모두 10분 기준): AI는 같은 IP 150번(한 판 최대 7번 → 약 20판), 가입·로그인·손님 시작은 같은 IP 60번, 불러오기·순위 기록은 같은 IP 150번, 관리자 코드는 같은 IP 10번, 이어하기 저장은 한 사람이 2초에 한 번·60번 |
| 모델 제한 | 게임에 있는 5개 모델만, 출력 길이 제한 |
| 요청 검사 | 우리 게임 요청문(첫 줄 머리말)으로 시작하고 8,000자 이하인 것만 통과 (다른 용도로 크레딧을 쓰지 못하게). ChatKHU가 100초 넘게 답이 없으면 끊고 안내 |

**index.html 파일을 직접 열어 테스트할 때**: 기본으로 막혀 있어서 자동 ChatKHU·로그인이 안 되고 붙여넣기·연습 모드만 됩니다. 팀원 테스트 기간에만 Worker → Settings → **Variables and Secrets** → Add → Type **Text**, 이름 `ALLOW_FILE_ORIGIN`, 값 `1` → Deploy. **전시·심사 전에는 이 변수를 지우세요.** (또는 게임 폴더에서 `python -m http.server 8000` 후 `http://localhost:8000`으로 열면 변수 없이도 됩니다)

**전시장에서 AI가 "잠깐 쉬었다 해 주세요"로 막히면**: 모두 같은 와이파이(IP 하나)를 쓰기 때문입니다. `worker.js`의 `CHAT_LIMIT = 150`을 더 올려서 다시 붙여넣고 Deploy 하세요.

**요청문 첫 문장은 바꾸지 마세요**: 서버는 `js/ai.js` 요청문이 `worker.js`의 `GAME_HEADER` 문장으로 시작하는지 봅니다. 꼭 바꿔야 하면 두 파일을 같이 고치고 Worker를 다시 배포하세요.

크레딧 사용량은 ChatKHU API Gateway의 사용량 화면에서 수시로 확인하세요. 이상하게 많이 쓰이면 키를 해지하고 새 키를 3번처럼 다시 넣으면 됩니다.

---

# 공유 순위표와 로그인 켜기 (5분, 선택)

켜면 컴퓨터·폰·심사위원이 **순위표 하나와 대결 업종 하나**를 같이 쓰고, **아이디·비밀번호 로그인과 이어하기**가 켜집니다. 켜지 않으면 로그인 없이, 지금처럼 각 기기에만 저장됩니다.

## 1. 저장소(KV) 만들기
1. Cloudflare 왼쪽 메뉴 **Storage & Databases** → **Workers KV** (또는 KV)
2. **Create** (Create a namespace) → 이름 `khu-board` → **Add/Create**

## 2. 서버에 저장소 연결
1. Workers & Pages → `khu-company-battle` → **Settings** → **Bindings** → **Add**
2. **KV namespace** 선택
3. Variable name: `BOARD` (대문자 정확히), KV namespace: `khu-board` → **Deploy** (또는 Save)

## 3. 관리자 코드 넣기 (순위표 초기화용)
1. 같은 Settings → **Variables and Secrets** → **Add**
2. Type **Secret**, 이름 `ADMIN_CODE`, 값은 팀만 아는 암호 → **Deploy**
3. 게임의 순위표 초기화 버튼을 누르면 이 코드를 물어봅니다. 아무나 순위표를 지우지 못하게 하는 장치입니다.

## 4. 새 서버 코드 붙여넣기
`worker/worker.js`(최신)를 **Edit code**에 통째로 붙여넣고 **Deploy**. 맨 마지막 줄 `};`까지 들어갔는지 확인.

## 5. 확인
`https://khu-company-battle.seanrock0328.workers.dev` 를 열어서 `"board":true`, `"accounts":true`, `"guests":true`, `"adminCode":true`, `"version":8`이 보이면 완료. 전시·심사 때는 `"fileTest":false`여야 합니다.

**배포 순서**: GitHub(게임 코드)를 먼저 올리고 Worker는 그다음에 붙여넣으세요. 새 게임 코드는 옛 서버에서도 그대로 동작합니다. 반대로 새 서버에 옛 게임 코드가 붙으면 너무 잦은 이어하기 저장 일부가 거절될 수 있습니다(이 기기 저장은 남음).

## 알아 둘 것
- 손님(게스트)은 닉네임만으로 바로 시작합니다. 순위표에 "닉네임(손님)"으로 올라가고, 가입한 아이디와 같은 이름이나 오늘 다른 손님이 쓴 이름은 못 씁니다. 손님은 이어하기 저장을 하지 않습니다.
- 로그인 정보도 같은 저장소에 들어갑니다. 비밀번호는 PBKDF2로 해시해서 저장하고 원래 비밀번호는 남기지 않습니다. 로그인은 30일 동안 유지됩니다.
- 게임 진행은 이 기기에는 매번 바로, 서버에는 모아서 저장합니다(봉투 개봉·면접 전·보고 받음·결산은 몇 초 안에, 면접·지시 쓰기는 손을 멈추면 20초 뒤, 길어도 1분 안에). 회원 한 판에 서버 저장 약 11~20번 + 순위 기록 1번 + 로그인 1번(가입이면 2번)을 씁니다. 손님 한 판은 약 3번(손님 등록 2번 + 순위 기록 1번)입니다. 무료 저장 한도(하루 1,000번)로 회원만 하면 하루 약 45~75판, 손님 위주면 약 300판입니다. **한도를 넘으면 그날은 가입·손님 시작·저장이 모두 실패**합니다(게임은 "로그인 없이 하기"로 계속할 수 있음). 전시회 날에는 Cloudflare **Workers 유료 플랜(월 5달러, KV 저장 월 100만 번 포함)**으로 바꿔 두는 것이 가장 안전합니다.
- 무료 사용량: 하루 기록 저장 1,000번, 순위표 목록 읽기 1,000번. 순위표 목록은 게임 화면을 열 때와 순위표를 볼 때 읽고, 서버가 10초씩 기억해서 읽기를 아낍니다. 바닥나면 공유 순위표만 못 보고(이 기기 순위표로 대신) 게임은 계속됩니다. 전시회 당일 Cloudflare의 KV 사용량 화면을 한 번씩 확인하세요.
- 순위 기록은 지금 게임 규칙으로 나올 수 있는 수익 범위 안일 때만 받고, 같은 판은 한 번만 기록합니다. 규칙 숫자(js/game.js)를 바꾸면 worker.js의 `MAX_PROFIT`·`MIN_PROFIT`도 같이 바꾸세요.
- 서버를 거치지 않고 직접 기록을 조작해 보내는 것까지 완벽히 막지는 못합니다. 학교 행사용으로는 충분한 수준이고, 이상한 기록이 보이면 관리자 코드로 초기화하세요.
