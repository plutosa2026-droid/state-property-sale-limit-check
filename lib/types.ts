// 앱 전체(화면·서버 API·정리본)가 함께 쓰는 데이터 모양.
// 기준: DESIGN.md 4.2 (주고받는 데이터 모양), PRD.md 5장 (AI가 지킬 규칙)
// 화면과 서버가 같은 이름과 모양을 쓰도록 여기 한 곳에서만 정의한다.

// ---------- 판정 ----------

// 판정은 이 3가지만 쓴다 (PRD Must ② 규칙 1)
export const VERDICTS = ["제한 있음", "제한 없음", "확인 필요"] as const;
export type Verdict = (typeof VERDICTS)[number];

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && (VERDICTS as readonly string[]).includes(value);
}

// 판정별 건수 요약 (PRD Must ② 규칙 6). 매각 가능 여부는 만들지 않는다.
export type Summary = Record<Verdict, number>;

// ---------- 지역·지구 (토지이용계획) ----------

// 토지이용계획에서 그 필지와 지역·지구의 관계. 엄격한 순서: 저촉 > 접함 > 포함
export const RELATIONS = ["포함", "접함", "저촉"] as const;
export type Relation = (typeof RELATIONS)[number];

export function isRelation(value: unknown): value is Relation {
  return typeof value === "string" && (RELATIONS as readonly string[]).includes(value);
}

export type Zone = {
  name: string; // 예: "개발제한구역"
  law?: string; // 관련 법률 이름 (공공 API가 주는 경우에만)
  relation: Relation | string; // 비었거나 모르는 값이 올 수 있어 string도 허용 → 판정 단계에서 "확인 필요"
};

// ---------- 오류 ----------

// 오류 종류 4종 (DESIGN.md 6장)
export const ERROR_CODES = ["INPUT_INVALID", "NOT_FOUND", "SERVICE_ERROR", "CHECK_ERROR"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

// 화면에 보여 줄 안내 문구. 키 값이나 외부 서비스의 자세한 오류는 담지 않는다.
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INPUT_INVALID: "입력 오류: 예) 충청남도 공주시 ○○면 ○○리 산 12-3 형식으로 입력해 주세요.",
  NOT_FOUND: "조회 결과 없음: 지번을 다시 확인해 주세요.",
  SERVICE_ERROR: "서비스 연결 오류: 잠시 후 다시 시도해 주세요.",
  CHECK_ERROR: "체크 서비스 연결 오류: 조회 결과는 그대로 두고 다시 시도할 수 있어요.",
};

export type ApiError = {
  ok: false;
  error: ErrorCode;
  message: string;
};

// ---------- 조회 API: POST /api/land-use ----------

export type LandUseRequest = {
  parcel: string; // 사용자가 입력한 지번
};

export type LandUseSuccess = {
  ok: true;
  address: string; // 입력값이 아니라 공공 API가 돌려준 전체 주소 (시·도부터)
  queriedAt: string; // ISO 8601, 예: "2026-11-12T14:03:00+09:00"
  zones: Zone[];
  // 서버가 이 조회 결과(주소·지역·지구)에 서명한 토큰. 판정 API는 이 토큰이 맞는 목록만 받는다 (임의의 목록으로 AI를 호출하지 못하게 함).
  token: string;
  // 지역·지구별 근거 법률(토지이용규제 기본법 별표 기준). 표시용이라 서명 대상이 아니며, 법률을 못 찾은 지역·지구는 빠져 있다.
  laws?: Record<string, string[]>;
};

// 시·도를 생략했는데 같은 이름의 지번이 여러 시·도에 있을 때의 응답. 화면이 시·도를 고르게 한 뒤 다시 조회한다.
export type SidoChoice = {
  sido: string; // 선택하면 이 시·도를 붙여 다시 조회한다
  address: string; // 이 시·도에서 찾은 전체 주소
};

export type LandUseChoices = {
  ok: false;
  error: "CHOOSE_SIDO";
  message: string;
  choices: SidoChoice[];
};

export type LandUseResponse = LandUseSuccess | ApiError | LandUseChoices;

// ---------- 근거 ----------

// 판정 결과에 붙는 근거 한 건. quote는 정리본 원문에서 200자 이내로 자른 것만 쓴다.
export type Evidence = {
  id: string; // 정리본 항목 id, 예: "gijun-4-2"
  source: string; // 문서 이름, 예: "국유재산 처분기준"
  ref: string; // 조항, 예: "제4조제1항제2호"
  quote: string;
};

// "제한 없음"의 근거로 쓰는 고정 표기 (PRD Must ② 규칙 2)
export const NO_RESTRICTION_EVIDENCE: Omit<Evidence, "quote"> = {
  id: "gijun-4-none",
  source: "국유재산 처분기준",
  ref: "제4조",
};
export const NO_RESTRICTION_TEXT = "처분기준 제4조 해당 사유 없음";

// 근거를 찾지 못한 "확인 필요"에 카드에 표시하는 문구 (PRD Must ② 규칙 2)
export const NO_EVIDENCE_TEXT = "근거 없음(원문에서 찾지 못함)";

// 근거 문서 한 건의 기준일 (결과 화면에 문서별로 표시, PRD Must ② 규칙 7)
export type DocumentInfo = {
  name: string;
  baseDate: string; // "YYYY-MM-DD"
  basis: string; // "재정경제부 등록일" 또는 "시행일"
};

// ---------- 판정 API: POST /api/check ----------

export type CheckRequest = {
  address: string;
  zones: Zone[];
  token: string; // 조회 API가 돌려준 token을 그대로 보낸다
};

export type ZoneResult = {
  zone: string;
  relation: Relation | string;
  verdict: Verdict;
  evidence: Evidence[]; // 근거를 못 찾은 "확인 필요"는 빈 배열
  reason: string; // 판단 이유 (100자 이내, 근거 원문에 있는 내용만)
  laws?: string[]; // 이 지역·지구의 근거 법률 (토지이용규제 기본법 별표 기준, 표시용). 못 찾으면 없음
};

export type CheckSuccess = {
  ok: true;
  documents: DocumentInfo[];
  summary: Summary;
  results: ZoneResult[];
  // 판정 서비스(AI) 오류나 시간 초과로 자동 판정하지 못하고 "확인 필요"로 채운 지역·지구 수. 0이면 생략된다.
  // (일부만 실패하면 전체를 오류로 처리하지 않고 그 항목만 확인 필요로 두며, 화면이 다시 시도를 안내한다)
  incomplete?: number;
};

export type CheckResponse = CheckSuccess | ApiError;

// ---------- 근거 정리본: data/rules/*.json ----------

// 정리본 한 항목 (조항 단위)
export type Rule = {
  id: string; // 예: "gijun-4-2", "beop-43", "ryeong-40"
  source: string; // 문서 이름
  ref: string; // 조항
  title: string;
  text: string; // 조항 원문 (항·호는 줄바꿈으로 구분)
  keywords: string[]; // 지역·지구 이름과 맞출 검색 낱말
  baseDate: string;
};

// 정리본 파일 하나 (문서 하나)
export type RuleDocument = {
  document: {
    name: string;
    baseDate: string;
    basis: string;
    file: string;
    articles: number;
    note?: string;
  };
  rules: Rule[];
};

// ---------- 공통 상수 ----------

export const MAX_QUOTE_LENGTH = 200; // 근거 원문 인용 최대 글자 수 (PRD Must ② 규칙 4)
export const MAX_REASON_LENGTH = 100; // 판단 이유 최대 글자 수 (PRD Must ② 규칙 3)
