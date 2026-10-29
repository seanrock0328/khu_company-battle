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
| 주소 제한 | 우리 게임 주소(`seanrock0328.github.io`)와 팀원 로컬 테스트에서 온 요청만 받음 |
| 횟수 제한 | 같은 IP는 10분에 40번까지 (한 판에 5번 부르므로 넉넉함) |
| 모델 제한 | 게임에 있는 5개 모델만, 출력 길이 제한 |
| 요청 검사 | 우리 게임 요청문만 통과 (다른 용도로 크레딧을 쓰지 못하게) |

크레딧 사용량은 ChatKHU API Gateway의 사용량 화면에서 수시로 확인하세요. 이상하게 많이 쓰이면 키를 해지하고 새 키를 3번처럼 다시 넣으면 됩니다.
