// 안전 규칙 강제: AI와 앞선 규칙이 만든 판정 결과를 마지막에 한 번 더 점검해 규칙에 어긋나면 안전한 쪽("확인 필요")으로 바꾼다.
// 순수 계산만 하므로 화면·서버·시험 어디서나 쓴다. (기준: DESIGN.md 4.3, PRD Must ② 규칙 1~9)
//
// 다루는 규칙
//   1. 판정은 "제한 있음 / 제한 없음 / 확인 필요" 3가지만
//   2. 저촉·접함·표기 없음은 무조건 "확인 필요"
//   3. 근거가 없으면 "제한 있음"·"제한 없음" 불가 → "확인 필요" (근거 id는 정리본에 실제로 있는 것만)
//   4. "제한 없음"은 "처분기준 제4조 해당 사유 없음" 고정 근거가 있을 때만
//   5. 근거 원문 인용은 200자 이내
//   6. 판단 이유는 100자 이내, 근거 원문에 없는 법령·조항·숫자가 들어 있으면 고정 문구로 교체
//   7. 매각 가능 여부를 말하는 문구 금지
//   8. 지역·지구 빠짐없이: 결과 수가 입력과 다르면 빠진 것을 "확인 필요"로 채움
import {
  MAX_QUOTE_LENGTH,
  MAX_REASON_LENGTH,
  NO_RESTRICTION_EVIDENCE,
  VERDICTS,
  type Evidence,
  type Verdict,
  type Zone,
  type ZoneResult,
} from "./types";

// ---------- 고정 문구 ----------

export const SAFE_REASON = {
  checkEvidence: "근거 조항을 확인하세요.",
  missing: "판정 결과가 누락되어 담당자 확인이 필요합니다.",
  needsCheck: "근거를 확인할 수 없어 담당자 확인이 필요합니다.",
} as const;

export type SafetyContext = {
  // 이 지역·지구에 대해 AI에게 보여 준 근거 후보와 최종 근거의 글자 (조항·원문·문서 이름). 판단 이유 점검에 쓴다.
  sourceTexts: string[];
  // 정리본에 실제로 있는 항목 id 모음 ("제한 없음"의 고정 근거 id는 안에서 따로 허용한다)
  knownEvidenceIds: ReadonlySet<string>;
};

export type SafetyFix = string; // 어떤 규칙 때문에 바꿨는지 (시험·로그용)

// ---------- 판단 이유 점검 ----------

// 매각 가능 여부를 말하는 표현 (PRD Must ② 규칙 6: 매각 가능 여부는 판정하지 않는다)
const SALE_DECISION = /매각\s*(이|은|도|을)?\s*(가능|불가|해도|하면|해서는|하여도)|매각할\s*수\s*(있|없)|매각\s*허용|매각을\s*(허가|승인할)|팔\s*수/;

// 법령 이름처럼 보이지만 법령이 아닌 흔한 낱말
const NOT_LAW_WORDS = new Set(["방법", "위법", "합법", "불법", "입법", "사법", "설법", "용법", "기법", "비법", "문법", "율법", "적법", "편법", "변법", "방식법"]);

const compact = (text: string) => text.replace(/\s+/g, "");

// 이유에서 "근거에 있어야 할 표현"(조항 번호, 숫자+단위, 법령 이름)을 뽑는다.
export function claimsOf(reason: string): string[] {
  const claims: string[] = [];
  // 조·항·호 번호: 제4조, 제1항, 제2호, 제57조의2
  for (const m of reason.matchAll(/제\s*\d+\s*(?:조(?:의\s*\d+)?|항|호)/g)) claims.push(compact(m[0]));
  // 숫자 + 단위: 10억원, 2,000㎡, 10년, 50%
  for (const m of reason.matchAll(/\d[\d,.]*\s*(?:억\s*원|만\s*원|원|㎡|m²|%|퍼센트|년|개월|일|세)/g)) claims.push(compact(m[0]));
  // 「」·｢｣로 묶은 법령 이름
  for (const m of reason.matchAll(/[｢「]([^｣」]+)[｣」]/g)) claims.push(compact(m[1]));
  // 이름이 "~법 / ~법률 / ~시행령 / ~시행규칙"으로 끝나는 낱말 (뒤에 "에", "상" 같은 조사가 붙어도 잡는다)
  for (const m of reason.matchAll(/[가-힣]{2,}?(?:법률|시행령|시행규칙|법)/g)) {
    if (!NOT_LAW_WORDS.has(m[0])) claims.push(compact(m[0]));
  }
  return claims;
}

// 이유가 안전한지: 근거 글자에 없는 조항·숫자·법령 이름이 있거나 매각 가능 여부를 말하면 안전하지 않다.
export function isReasonSafe(reason: string, sourceTexts: string[]): boolean {
  if (SALE_DECISION.test(reason)) return false;
  const pool = compact(sourceTexts.join(" "));
  return claimsOf(reason).every((claim) => pool.includes(claim));
}

function trimTo(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// ---------- 한 지역·지구 결과 점검 ----------

export function enforceZoneResult(input: ZoneResult, ctx: SafetyContext): { result: ZoneResult; fixes: SafetyFix[] } {
  const fixes: SafetyFix[] = [];
  let verdict: Verdict = input.verdict;
  let reason = input.reason ?? "";

  // 규칙 1: 판정값 3종
  if (!(VERDICTS as readonly string[]).includes(verdict)) {
    verdict = "확인 필요";
    fixes.push("판정값이 3종이 아님 → 확인 필요");
  }

  // 근거 정리: 정리본에 없는 id는 버리고, 중복을 없애고, 인용을 200자로 맞춘다 (규칙 3·5)
  const seen = new Set<string>();
  const evidence: Evidence[] = [];
  for (const item of input.evidence ?? []) {
    const known = ctx.knownEvidenceIds.has(item.id) || item.id === NO_RESTRICTION_EVIDENCE.id;
    if (!known) {
      fixes.push(`정리본에 없는 근거 id 제거: ${item.id}`);
      continue;
    }
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    evidence.push({ ...item, quote: trimTo(item.quote ?? "", MAX_QUOTE_LENGTH) });
  }

  // 규칙 2: 저촉·접함·표기 없음은 무조건 확인 필요
  if (input.relation !== "포함" && verdict !== "확인 필요") {
    verdict = "확인 필요";
    fixes.push(`${input.relation || "표기 없음"}인데 ${input.verdict} → 확인 필요`);
  }

  // 규칙 3: 근거 없이 "제한 있음"·"제한 없음" 불가
  if (verdict !== "확인 필요" && evidence.length === 0) {
    fixes.push(`근거 없이 ${verdict} → 확인 필요`);
    verdict = "확인 필요";
    reason = SAFE_REASON.needsCheck;
  }

  // 규칙 4: "제한 없음"은 고정 근거("처분기준 제4조 해당 사유 없음")가 있을 때만
  if (verdict === "제한 없음" && !evidence.some((item) => item.id === NO_RESTRICTION_EVIDENCE.id)) {
    fixes.push("제한 없음의 고정 근거가 없음 → 확인 필요");
    verdict = "확인 필요";
    reason = SAFE_REASON.needsCheck;
  }

  // 규칙 6·7: 판단 이유 점검 (근거 글자 = 후보 원문 + 최종 근거의 조항·인용)
  const sourceTexts = [...ctx.sourceTexts, ...evidence.flatMap((item) => [item.source, item.ref, item.quote])];
  reason = trimTo(reason, MAX_REASON_LENGTH);
  if (!reason) {
    fixes.push("판단 이유가 비어 있음 → 고정 문구");
    reason = SAFE_REASON.checkEvidence;
  } else if (!isReasonSafe(reason, sourceTexts)) {
    fixes.push("판단 이유에 근거에 없는 조항·숫자·법령 또는 매각 가부 표현 → 고정 문구");
    reason = SAFE_REASON.checkEvidence;
  }

  return { result: { zone: input.zone, relation: input.relation, verdict, evidence, reason }, fixes };
}

// ---------- 지역·지구 빠짐없이 (규칙 8) ----------

// 입력한 지역·지구 목록과 결과가 순서·개수까지 같도록 맞춘다. 빠졌거나 어긋난 칸은 "확인 필요"로 채운다.
export function ensureAllZones(zones: Zone[], results: (ZoneResult | undefined)[]): { results: ZoneResult[]; filled: number } {
  let filled = 0;
  const fixed = zones.map((zone, index) => {
    const found = results[index];
    if (found && found.zone === zone.name) return found;
    filled += 1;
    return { zone: zone.name, relation: zone.relation, verdict: "확인 필요", evidence: [], reason: SAFE_REASON.missing } satisfies ZoneResult;
  });
  return { results: fixed, filled };
}
