// 담당 C: AI 부분
// 지금은 "연습 모드"로, AI 없이 규칙대로 지시를 줄여서 넘깁니다.
// ChatKHU로 만든 결과(prompts/ 폴더의 지침 사용)를 넣거나,
// 중간 서버가 준비되면 askAI() 안만 바꾸면 됩니다. 다른 파일은 안 바뀝니다.

const AI_MODE = "practice"; // "practice" 또는 "server"
const AI_SERVER_URL = "";    // 중간 서버 주소 (server 모드일 때). API 키는 절대 여기 쓰지 마세요!

// 직원 한 명이 윗사람 말을 받아서 자기 글자 수로 줄여 아래로 전달합니다.
// 반환값: 그 직원이 아래로 전달하는 말 (문자열)
async function relay(employee, heardText, crisis) {
  const limit = rankInfo(employee.rank).chars;

  if (AI_MODE === "server" && AI_SERVER_URL) {
    return await askAI({ employee, heardText, crisis, limit });
  }
  return practiceRelay(employee, heardText, limit);
}

// 연습 모드: 성격 말머리를 붙이고 글자 수에 맞춰 자릅니다.
function practiceRelay(employee, heardText, limit) {
  const clean = heardText.replace(/^\[[^\]]*\]\s*/, ""); // 윗사람의 [성격] 말머리 떼기
  const words = clean.split(/[\s,.]+/).filter(Boolean);
  // 단어를 몇 개 무작위로 빠뜨려서 말이 바뀌는 느낌을 냅니다.
  const kept = words.filter(() => Math.random() > 0.3);
  const body = (kept.length ? kept : words).join(" ");
  const text = `[${employee.persona}] ${body}`;
  return text.slice(0, limit);
}

// 서버 모드: 중간 서버에 요청 (담당 C가 완성)
async function askAI(payload) {
  const res = await fetch(AI_SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("AI 서버 오류: " + res.status);
  const data = await res.json();
  return String(data.text || "").slice(0, payload.limit);
}

// 회사 하나의 전체 전달 과정을 만듭니다.
// 반환값: [{ who: "사장", text: "..." }, { who: "부장 (실적만 봄)", text: "..." }, ...]
async function runChain(company, ceoOrder, crisis) {
  const messages = [{ who: "사장", text: ceoOrder, ceo: true }];
  let heard = ceoOrder;
  for (const employee of chainOf(company)) {
    heard = await relay(employee, heard, crisis);
    messages.push({ who: `${employee.rank} (${employee.persona})`, text: heard });
  }
  return messages;
}
