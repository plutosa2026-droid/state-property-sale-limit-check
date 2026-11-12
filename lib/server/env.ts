// 서버에서만 쓰는 API 키 확인 기능.
// 이 프로젝트에 필요한 키가 .env에 들어 있는지 "이름과 채움 여부"만 확인한다.
// 키 값은 절대 반환하거나 출력하지 않는다. (PRD 7장 ③, CLAUDE.md 비밀 정보 규칙)
import "server-only";

// 앱이 필요로 하는 키 목록 (DESIGN.md 5.3)
export const REQUIRED_KEYS = [
  { name: "VWORLD_API_KEY", purpose: "토지이용계획 조회 (브이월드)" },
  { name: "OPENAI_API_KEY", purpose: "매각제한 AI 판정 (OpenAI)" },
] as const;

export type RequiredKeyName = (typeof REQUIRED_KEYS)[number]["name"];

export type KeyStatus = {
  name: RequiredKeyName;
  purpose: string;
  filled: boolean; // true = 값이 들어 있음 (값 자체는 알려 주지 않는다)
};

// 키가 비어 있지 않은지만 확인한다.
export function checkRequiredKeys(): KeyStatus[] {
  return REQUIRED_KEYS.map(({ name, purpose }) => ({
    name,
    purpose,
    filled: (process.env[name] ?? "").trim().length > 0,
  }));
}

// 나중에 조회·판정 기능에서 키를 꺼낼 때 쓴다. 없으면 오류를 낸다 (값은 오류 문구에 넣지 않는다).
export function getRequiredKey(name: RequiredKeyName): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`환경변수 ${name} 가 .env에 없습니다.`);
  }
  return value;
}
