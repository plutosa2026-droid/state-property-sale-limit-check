// 지번 형식 검사. 화면(입력 즉시 안내)과 서버(조회 전 재검사)가 함께 쓴다.
// 기준: PRD.md Must ① 규칙 1
//   "(시·도) + 시·군·구(구가 나뉜 시는 구까지) + 읍·면·동(리) + (산) 본번(-부번)" 형식일 때만 조회한다.
//   시·도는 생략할 수 있다. 생략하면 서버가 모든 시·도에서 찾고, 같은 이름이 여러 시·도에 있으면 화면에서 시·도를 고르게 한다.
//   "산" 표기는 허용하고, 도로명주소와 "충남" 같은 약칭은 받지 않는다.
//   세종특별자치시처럼 시·군·구 단계가 없는 주소는 시·도를 꼭 써야 한다(시·군·구가 없어 다른 지역과 구별되지 않는다).
// 이 파일은 다른 파일을 불러오지 않는다 (화면·서버 어디서나 쓰기 위함).

// ---------- 시·도 ----------

// 정식 명칭만 받는다. 옛 명칭(강원도, 전라북도)은 오래된 주소 자료에 남아 있어 함께 허용한다.
const SIDO_NAMES = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "강원도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라북도",
  "전라남도",
  "전남광주통합특별시",
  "경상북도",
  "경상남도",
  "제주특별자치도",
] as const;

// 약칭으로 흔히 쓰는 이름 (받지 않고 정식 명칭을 안내한다)
const SIDO_ABBREVIATIONS = new Set([
  "서울", "서울시", "부산", "부산시", "대구", "대구시", "인천", "인천시", "광주", "광주시", "대전", "대전시",
  "울산", "울산시", "세종", "세종시", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주", "제주도",
]);

// 시·군·구 단계가 없는 시·도
const SIDO_WITHOUT_SIGUNGU = new Set(["세종특별자치시"]);

// ---------- 결과 모양 ----------

export type ParcelInvalidReason =
  | "EMPTY" // 비어 있음
  | "TOO_LONG" // 너무 김
  | "INVALID_CHARS" // 쓸 수 없는 글자
  | "ABBREVIATED_SIDO" // 시·도 약칭
  | "UNKNOWN_SIDO" // 시·도를 알 수 없음
  | "ROAD_ADDRESS" // 도로명주소
  | "MISSING_REGION" // 시·군·구 또는 읍·면·동이 빠짐
  | "BAD_REGION" // 지역 이름의 모양이나 순서가 맞지 않음
  | "BAD_LOT"; // 본번(-부번)이 맞지 않음

export type ParcelParts = {
  sido?: string; // 생략하면 서버가 모든 시·도에서 찾는다
  sigungu: string[]; // 시·군·구 (0~2개: 세종은 0개, 구가 나뉜 시는 2개)
  eupmyeondong: string;
  ri?: string; // 읍·면 아래의 리
  san: boolean; // 임야("산") 여부
  bonbun: string;
  bubun?: string;
};

export type ParcelCheck =
  | { ok: true; normalized: string; parts: ParcelParts }
  | { ok: false; reason: ParcelInvalidReason; message: string };

const FORMAT_HINT = "예: 충청남도 공주시 우성면 동대리 산 12-3 (시·도는 생략 가능)";

function fail(reason: ParcelInvalidReason, message: string): ParcelCheck {
  return { ok: false, reason, message: `${message} (${FORMAT_HINT})` };
}

// ---------- 검사 ----------

const MAX_LENGTH = 100;
const ALLOWED_CHARS = /^[가-힣0-9\s\-·ㆍ]+$/;

// 법정동 중 이름이 "로"로 끝나는 예외 (도로명으로 오해하지 않도록)
const ROAD_LIKE_DONG = new Set(["세종로"]);

// 이름 한 조각의 종류를 접미사로 가린다.
function kindOf(token: string): "sigungu" | "emd" | "ri" | null {
  if (ROAD_LIKE_DONG.has(token)) return "emd";
  if (/^[가-힣]+(시|군|구)$/.test(token)) return "sigungu";
  if (/^[가-힣]+\d*(동|읍|면)$/.test(token)) return "emd"; // 역삼1동, 우성면
  if (/^[가-힣]+\d+가$/.test(token)) return "emd"; // 종로1가
  if (/^[가-힣]+\d*리$/.test(token)) return "ri";
  return null;
}

function looksLikeRoad(token: string): boolean {
  if (ROAD_LIKE_DONG.has(token)) return false;
  return /(대로|번길|길|로)$/.test(token);
}

// 지번 뒷부분(산, 본번, 부번)을 읽는다.
function parseLot(tokens: string[]): { san: boolean; bonbun: string; bubun?: string; used: number } | null {
  let san = false;
  let used = 0;
  let last = tokens[tokens.length - 1];
  if (!last) return null;

  last = last.replace(/번지$/, ""); // "12번지" → "12"
  let numberToken = last;
  used = 1;

  if (/^산\d/.test(last)) {
    san = true;
    numberToken = last.slice(1); // "산12-3" → "12-3"
  } else if (tokens.length >= 2 && tokens[tokens.length - 2] === "산") {
    san = true;
    used = 2;
  }

  const match = numberToken.match(/^(\d{1,4})(?:-(\d{1,4}))?$/);
  if (!match || Number(match[1]) === 0) return null; // 본번 0은 없는 번호
  return { san, bonbun: String(Number(match[1])), bubun: match[2] === undefined ? undefined : String(Number(match[2])), used };
}

export function checkParcel(input: string): ParcelCheck {
  const text = (input ?? "").trim().replace(/\s+/g, " ");
  if (!text) return fail("EMPTY", "지번을 입력해 주세요.");
  if (text.length > MAX_LENGTH) return fail("TOO_LONG", `지번이 너무 깁니다. ${MAX_LENGTH}자 이내로 입력해 주세요.`);
  if (!ALLOWED_CHARS.test(text)) return fail("INVALID_CHARS", "한글, 숫자, 하이픈(-)만 입력할 수 있습니다.");

  const tokens = text.split(" ");

  // 1) 시·도 (생략할 수 있다). 약칭은 받지 않는다.
  const first = tokens[0];
  if (SIDO_ABBREVIATIONS.has(first)) {
    return fail("ABBREVIATED_SIDO", `'${first}'은(는) 약칭입니다. 시·도는 정식 명칭(예: 충청남도)으로 입력하거나, 시·도를 빼고 시·군·구부터 입력해 주세요.`);
  }
  const hasSido = (SIDO_NAMES as readonly string[]).includes(first);
  const sido = hasSido ? first : undefined;
  const regionStart = hasSido ? 1 : 0;

  // 2) 지번 뒷부분 (산, 본번, 부번)
  const lot = parseLot(tokens.slice(regionStart));
  if (!lot) {
    return fail("BAD_LOT", "끝에 본번(또는 본번-부번)을 숫자로 입력해 주세요. 임야는 '산'을 붙입니다.");
  }

  // 3) 지역 이름들 (시·도와 지번 사이)
  const regionTokens = tokens.slice(regionStart, tokens.length - lot.used);

  // 도로명주소는 받지 않는다.
  if (regionTokens.some(looksLikeRoad)) {
    return fail("ROAD_ADDRESS", "도로명주소는 조회할 수 없습니다. 지번(읍·면·동 + 번지) 주소로 입력해 주세요.");
  }
  if (regionTokens.length === 0) {
    return fail("MISSING_REGION", "시·군·구와 읍·면·동을 입력해 주세요.");
  }

  // 순서: 시·군·구(0~2개) → 읍·면·동(1개) → 리(0~1개, 읍·면 아래에서만)
  const sigungu: string[] = [];
  let emd: string | undefined;
  let ri: string | undefined;
  for (const token of regionTokens) {
    const kind = kindOf(token);
    if (kind === "sigungu" && emd === undefined && sigungu.length < 2) sigungu.push(token);
    else if (kind === "emd" && emd === undefined) emd = token;
    else if (kind === "ri" && emd !== undefined && ri === undefined && /(읍|면)$/.test(emd)) ri = token;
    else {
      return fail("BAD_REGION", `'${token}'은(는) 위치가 맞지 않거나 알 수 없는 이름입니다. 시·도 → 시·군·구 → 읍·면·동(→ 리) 순서로 입력해 주세요.`);
    }
  }

  if (!emd) return fail("MISSING_REGION", "읍·면·동을 입력해 주세요.");
  if (sigungu.length === 0 && !(sido && SIDO_WITHOUT_SIGUNGU.has(sido))) {
    return fail("MISSING_REGION", sido ? "시·군·구를 입력해 주세요." : "시·군·구를 입력해 주세요. (세종특별자치시는 시·도를 함께 입력해 주세요.)");
  }
  // 시 다음에 구가 오는 모양만 허용: "천안시 동남구" (구 다음에 시는 올 수 없다)
  if (sigungu.length === 2 && !(sigungu[0].endsWith("시") && sigungu[1].endsWith("구"))) {
    return fail("BAD_REGION", "시·군·구가 두 개일 때는 '시 + 구' 순서(예: 천안시 동남구)로 입력해 주세요.");
  }

  const parts: ParcelParts = { sido, sigungu, eupmyeondong: emd, ri, san: lot.san, bonbun: lot.bonbun, bubun: lot.bubun };
  return { ok: true, normalized: formatParcel(parts), parts };
}

// 공공 API에 보내기 좋은 모양으로 정리한 지번 문자열 (띄어쓰기·번지 표기 통일)
export function formatParcel(parts: ParcelParts): string {
  const lot = `${parts.san ? "산 " : ""}${parts.bonbun}${parts.bubun === undefined ? "" : `-${parts.bubun}`}`;
  return [parts.sido, ...parts.sigungu, parts.eupmyeondong, parts.ri, lot].filter(Boolean).join(" ");
}
