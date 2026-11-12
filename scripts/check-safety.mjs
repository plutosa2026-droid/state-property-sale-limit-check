// 안전 규칙 강제(lib/safety.ts)를 규칙별 사례로 확인하는 스크립트.
// 사용법: node scripts/check-safety.mjs
import { ensureAllZones, enforceZoneResult, isReasonSafe, claimsOf, SAFE_REASON } from "../lib/safety.ts";

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` → ${detail}` : ""}`);
};

const known = new Set(["gijun-4-2", "gijun-4-6", "gijun-4-3", "beop-57", "gijun-11"]);
const ctx = {
  knownEvidenceIds: known,
  sourceTexts: [
    "국유재산 처분기준 제4조제1항제2호 ｢국토의 계획 및 이용에 관한 법률｣등 다른 법률에 따라 그 처분이 제한되는 경우",
    "국유재산 처분기준 제4조제1항제6호 상수원관리지역(상수원보호구역과 수변구역) 국유지로서 필요한 경우",
    "국유재산법 제57조 개발 ... 도시개발법, 택지개발촉진법",
  ],
};
const ev = (id, ref = "제4조제1항제2호", quote = "다른 법률에 따라 그 처분이 제한되는 경우") => ({ id, source: "국유재산 처분기준", ref, quote });
const noneEv = { id: "gijun-4-none", source: "국유재산 처분기준", ref: "제4조", quote: "처분기준 제4조 해당 사유 없음" };
const base = (over) => ({ zone: "개발제한구역", relation: "포함", verdict: "확인 필요", evidence: [ev("gijun-4-2")], reason: "다른 법률에 따른 처분 제한 여부를 확인해야 합니다.", ...over });
const run = (over, c = ctx) => enforceZoneResult(base(over), c);

// 규칙 1: 판정값 3종
check("규칙1: 모르는 판정값 → 확인 필요", run({ verdict: "매각 가능" }).result.verdict === "확인 필요");
check("규칙1: 3종은 그대로", ["제한 있음", "확인 필요"].every((v) => run({ verdict: v }).result.verdict === v));

// 규칙 2: 저촉·접함·표기 없음은 확인 필요
for (const relation of ["저촉", "접함", "", "모르는값"]) {
  check(`규칙2: ${relation || "표기 없음"} + 제한 있음 → 확인 필요`, run({ relation, verdict: "제한 있음" }).result.verdict === "확인 필요");
  check(`규칙2: ${relation || "표기 없음"} + 제한 없음 → 확인 필요`, run({ relation, verdict: "제한 없음", evidence: [noneEv] }).result.verdict === "확인 필요");
}

// 규칙 3: 근거
check("규칙3: 근거 없이 제한 있음 → 확인 필요", run({ verdict: "제한 있음", evidence: [] }).result.verdict === "확인 필요");
check("규칙3: 근거 없이 제한 없음 → 확인 필요", run({ verdict: "제한 없음", evidence: [] }).result.verdict === "확인 필요");
const fakeId = run({ verdict: "제한 있음", evidence: [ev("gijun-9-99")] });
check("규칙3: 정리본에 없는 근거 id → 제거되고 제한 있음 불가", fakeId.result.evidence.length === 0 && fakeId.result.verdict === "확인 필요");
const mixed = run({ verdict: "제한 있음", evidence: [ev("gijun-4-2"), ev("gijun-9-99"), ev("gijun-4-2")] });
check("규칙3: 있는 id만 남고 중복 제거 → 제한 있음 유지", mixed.result.verdict === "제한 있음" && mixed.result.evidence.length === 1);
check("규칙3: 확인 필요는 근거가 없어도 허용", run({ verdict: "확인 필요", evidence: [] }).result.verdict === "확인 필요");

// 규칙 4: 제한 없음의 고정 근거
check("규칙4: 고정 근거가 있는 제한 없음 유지", run({ verdict: "제한 없음", evidence: [noneEv], reason: "처분기준 제4조의 매각제한 사유에 해당하지 않는 지역·지구입니다." }).result.verdict === "제한 없음");
check("규칙4: 고정 근거 없이 다른 근거만 있는 제한 없음 → 확인 필요", run({ verdict: "제한 없음", evidence: [ev("gijun-4-2")] }).result.verdict === "확인 필요");

// 규칙 5: 인용 200자
const longQuote = run({ evidence: [ev("gijun-4-2", "제4조제1항제2호", "가".repeat(500))] }).result.evidence[0].quote;
check("규칙5: 인용 200자 이내", longQuote.length <= 200 && longQuote.endsWith("…"), String(longQuote.length));

// 규칙 6: 판단 이유
const longReason = run({ reason: "처분 제한 여부를 확인해야 합니다. ".repeat(20) }).result.reason;
check("규칙6: 이유 100자 이내", longReason.length <= 100, String(longReason.length));
check("규칙6: 빈 이유 → 고정 문구", run({ reason: "   " }).result.reason === SAFE_REASON.checkEvidence);
check("규칙6: 근거에 없는 조항 번호(제99조) → 고정 문구", run({ reason: "제99조에 따라 제한됩니다." }).result.reason === SAFE_REASON.checkEvidence);
check("규칙6: 근거에 있는 조항 번호(제4조제1항제2호)는 허용", run({ reason: "제4조제1항제2호에 해당할 수 있어 확인이 필요합니다." }).result.reason !== SAFE_REASON.checkEvidence);
check("규칙6: 근거에 없는 숫자+단위(30억원) → 고정 문구", run({ reason: "30억원을 초과하여 제한됩니다." }).result.reason === SAFE_REASON.checkEvidence);
check("규칙6: 근거에 없는 법령 이름(도시계획법) → 고정 문구", run({ reason: "도시계획법에 따라 제한됩니다." }).result.reason === SAFE_REASON.checkEvidence);
check("규칙6: 근거에 있는 법령 이름(도시개발법)은 허용", isReasonSafe("도시개발법에 따른 개발이 필요한지 확인이 필요합니다.", ctx.sourceTexts));
check("규칙6: 「」로 묶은 근거 밖 법령 → 고정 문구", run({ reason: "「산지관리법」에 따라 제한됩니다." }).result.reason === SAFE_REASON.checkEvidence);
check("규칙6: '방법' 같은 일반 낱말은 법령으로 보지 않음", isReasonSafe("확인 방법은 담당자가 정합니다.", ctx.sourceTexts));
check("규칙6: 조항·숫자·법령이 없는 평범한 이유는 허용", isReasonSafe("원문만으로는 단정할 수 없어 담당자 확인이 필요합니다.", ctx.sourceTexts));

// 규칙 7: 매각 가능 여부 금지
for (const text of ["매각이 가능합니다.", "매각 불가 대상입니다.", "매각할 수 있는 재산입니다.", "매각해도 됩니다.", "매각할 수 없습니다."]) {
  check(`규칙7: "${text}" → 고정 문구`, run({ reason: text }).result.reason === SAFE_REASON.checkEvidence);
}
check("규칙7: '매각제한 사유' 같은 정상 표현은 허용", isReasonSafe("처분기준 제4조의 매각제한 사유에 해당하는지 확인이 필요합니다.", ["처분기준 제4조 매각제한"]));

// 규칙 8: 지역·지구 빠짐없이
const zones = [{ name: "A", relation: "포함" }, { name: "B", relation: "저촉" }, { name: "C", relation: "접함" }];
const okResult = (z) => ({ zone: z.name, relation: z.relation, verdict: "확인 필요", evidence: [], reason: "x" });
const full = ensureAllZones(zones, zones.map(okResult));
check("규칙8: 모두 있으면 그대로", full.filled === 0 && full.results.length === 3);
const gap = ensureAllZones(zones, [okResult(zones[0]), undefined, okResult(zones[2])]);
check("규칙8: 빠진 칸은 확인 필요로 채움", gap.filled === 1 && gap.results[1].verdict === "확인 필요" && gap.results[1].reason === SAFE_REASON.missing);
const shifted = ensureAllZones(zones, [okResult(zones[1]), okResult(zones[1]), okResult(zones[2])]);
check("규칙8: 이름이 어긋난 칸도 채움", shifted.filled === 1 && shifted.results[0].zone === "A" && shifted.results[0].reason === SAFE_REASON.missing);
const short = ensureAllZones(zones, [okResult(zones[0])]);
check("규칙8: 결과가 모자라면 입력 개수만큼 채움", short.results.length === 3 && short.filled === 2);

// 보조: 표현 뽑기
check("claimsOf: 조항·숫자·법령을 뽑음", ["제4조", "제1항", "10억원", "도시개발법"].every((c) => claimsOf("제4조제1항에 따라 10억원, 도시개발법").includes(c)), JSON.stringify(claimsOf("제4조제1항에 따라 10억원, 도시개발법")));

// 고쳐진 내용이 기록되는지
check("고친 이유가 기록됨", run({ relation: "저촉", verdict: "제한 있음" }).fixes.length > 0 && run({}).fixes.length === 0);

console.log(failed === 0 ? "\n통과" : `\n실패: ${failed}개`);
process.exitCode = failed === 0 ? 0 : 1;
