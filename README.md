# 10자 사원 주식회사

2026 KHU AI Challenge 출품작. 직급별 글자 수로 직원을 만들어 회사를 운영하는 AI 텍스트 배틀 게임입니다.

**한 명씩 혼자 플레이하고, 이벤트 3번의 점수 합계가 순위표에 쌓입니다.**

**게임 흐름**
1. **창업**: 닉네임 → ChatKHU가 업종을 랜덤으로 뽑음(다시 뽑기 1회) → 무슨 일을 하는 회사인지 직접 적기 → 회사 이름, 사훈, 창업 자금(예산 18/22/28)
2. **ChatKHU**: 창업 뉴스, 이벤트 3개(위기·기회·위기), 면접 후보 18명의 이름·자기소개·면접 답변
3. **면접**: 임원·부장·차장·과장·대리·사원마다 후보 3명 중 1명 (또는 공석). 능력·운·MBTI·애착유형은 보이고 정직도는 숨김. 능력이 좋을수록 연봉이 비쌈
4. **이벤트 x3**: 사장이 100자로 지시 → ChatKHU가 직원들을 연기 (말 바꾸기, 거짓말, 보고 부풀리기) → 보고 → 진실 공개(🤥 표시) → 점수
5. **최종 결산**: 총점, 전체 순위, 거짓말왕, 직원들의 진짜 정직도

**순위표**: 오른쪽 위 🏆 버튼. 게임한 노트북 브라우저에 저장되므로 노트북 한 대로 돌려가며 하세요. 연습 모드가 섞인 판은 순위에 들어가지 않습니다. 시연 전 테스트 기록은 순위표 맨 아래 **순위표 초기화**(두 번 클릭)로 지우세요.

**ChatKHU 연결**: 오른쪽 위 🔌 버튼에서 API 키를 한 번 저장하면 이후 ChatKHU 단계가 자동으로 진행됩니다.

ChatKHU 쓰는 법은 [`prompts/chatkhu.md`](prompts/chatkhu.md)에 있습니다.

**마감: 10/30(금) 17:00** · 우리 목표: 금요일 15시 제출

---

## 역할 분담

같은 파일을 두 사람이 동시에 고치면 충돌이 납니다. **자기 파일만 고치세요.**

| 담당 | 고치는 파일 | 할 일 |
|---|---|---|
| A 화면 | `index.html`, `css/style.css`, `js/ui.js` | 화면 디자인, 단톡방과 신문 연출 |
| B 게임 규칙 | `js/game.js`, `data/presets.js` | 직급, 능력치와 연봉, 예산, 예비 데이터 |
| C AI | `js/ai.js`, `prompts/` | ChatKHU 요청문 다듬기, 모델 비교 실험 |
| D 연결, 제출 | `js/main.js`, `docs/` | 버튼 연결, 배포, 서식 3~5 |

다른 사람 파일을 고쳐야 하면 **단톡방에 먼저 말하고** 고치세요.

---

## 처음 한 번만: 준비

### 1. GitHub 가입

[github.com](https://github.com)에서 가입하고, 아이디를 단톡방에 올립니다.

### 2. GitHub Desktop 설치

명령어 없이 버튼으로 쓰는 프로그램입니다. [desktop.github.com](https://desktop.github.com)에서 설치하고 GitHub 계정으로 로그인합니다.

### 3. 저장소 만들기 (팀장 한 명만)

1. GitHub 웹사이트 오른쪽 위 **+** → **New repository**
2. 이름: `khu-company-battle`, **Public** 선택 (GitHub Pages 무료 배포를 위해)
3. **Create repository**
4. GitHub Desktop에서 **File → Add local repository**로 이 폴더를 고르고, "create a repository" 안내가 나오면 따라서 만든 뒤 **Publish repository**
5. 웹사이트의 저장소 → **Settings → Collaborators → Add people**로 팀원 3명 초대

### 4. 저장소 받기 (나머지 3명)

1. 메일로 온 초대를 **수락**
2. GitHub Desktop → **File → Clone repository** → `khu-company-battle` 선택 → **Clone**

이제 내 컴퓨터에 폴더가 생겼습니다. 이 폴더에서 작업합니다.

---

## 매번: 작업 순서 (이것만 기억하세요)

```
① 받기 (Pull)  →  ② 작업  →  ③ 기록 (Commit)  →  ④ 올리기 (Push)
```

### ① 받기: 작업 시작 전에 무조건

GitHub Desktop 위쪽 **Fetch origin** → **Pull origin**이 나오면 누르기.
다른 사람이 올린 최신 코드를 받아옵니다.

### ② 작업

VS Code 등으로 **자기 담당 파일만** 고칩니다.
`index.html`을 브라우저로 열어서 잘 되는지 확인합니다.

### ③ 기록 (Commit)

GitHub Desktop 왼쪽에 바뀐 파일이 보입니다.
왼쪽 아래 **Summary**에 무엇을 했는지 한 줄 쓰고 **Commit to main**.

좋은 예: `채용 화면에 예산 막대 추가` · 나쁜 예: `수정`

### ④ 올리기 (Push)

위쪽 **Push origin** 클릭. 이제 팀원들이 받을 수 있습니다.

> **작게 자주 올리세요.** 1~2시간마다 한 번. 하루 모아서 올리면 충돌이 커집니다.

---

## 문제가 생겼을 때

### Push가 안 되고 "Pull 먼저 하라"고 할 때

다른 사람이 먼저 올린 것입니다. **Pull origin**을 누른 뒤 다시 **Push origin**.

### 충돌(conflict)이 났을 때

같은 파일의 같은 부분을 두 사람이 고친 것입니다.

1. 당황하지 말고 단톡방에 알리기
2. 파일을 열면 이런 표시가 있습니다.
   ```
   <<<<<<< HEAD
   내가 쓴 내용
   =======
   팀원이 쓴 내용
   >>>>>>> ...
   ```
3. 둘 중 맞는 것만 남기고 `<<<<<<<`, `=======`, `>>>>>>>` 줄을 모두 지운 뒤 저장
4. GitHub Desktop에서 Commit → Push

### 망한 것 같을 때

**절대 폴더를 지우고 새로 받지 마세요.** 올리지 않은 작업이 사라집니다. 먼저 단톡방에 화면 캡처를 올리세요.

---

## 배포 (담당 D, 오늘 한 번 해 두기)

1. 저장소 웹사이트 → **Settings → Pages**
2. Source: **Deploy from a branch**, Branch: **main**, 폴더 **/(root)** → **Save**
3. 1~2분 뒤 위쪽에 주소가 나옵니다: `https://아이디.github.io/khu-company-battle/`

이 주소가 제출용 URL입니다. Push할 때마다 자동으로 업데이트됩니다(1~2분 걸림).

---

## 절대 하지 말 것

- **API 키, 비밀번호를 코드에 쓰지 않기.** 저장소가 Public이라 전 세계에 공개됩니다.
- 다른 사람 담당 파일을 말없이 고치지 않기
- 폴더 지우고 새로 받기

---

## AI 사용 기록

ChatKHU를 쓸 때마다 `docs/ai-log.md`에 한 줄씩 남겨 주세요. 서식4(AI 활용 과정 설명서)의 재료이고, 예선 배점이 가장 큰 항목(30점)입니다.

## 파일 구조

```
index.html          화면 뼈대
css/style.css       디자인
data/presets.js     창업 자금, MBTI, 연습 모드용 예비 데이터
js/game.js          게임 규칙 (직급, 후보 능력치, 예산, 점수, 순위표)
js/ai.js            ChatKHU 연결, 요청문 3종, 결과 적용, 연습 모드
js/ui.js            화면 그리기
js/main.js          버튼 연결
prompts/chatkhu.md  ChatKHU 사용법과 실험 목록
docs/ai-log.md      AI 사용 기록
```
