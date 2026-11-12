// 근거 후보 찾기(lib/ruleMatch.ts)를 실제 정리본과 지역·지구 이름으로 확인하는 스크립트.
// 사용법: node scripts/check-rules.mjs
import { readFileSync } from "node:fs";
import { RESTRICTION_IDS, ZONE_TOPICS, findCandidates } from "../lib/ruleMatch.ts";

const rules = [
  ...["gijun", "beop", "sihaengryeong", "sihaenggyuchik", "yogang"].flatMap((name) => JSON.parse(readFileSync(`data/rules/${name}.json`, "utf8")).rules),
  ...JSON.parse(readFileSync("data/rules/laws.json", "utf8")).documents.flatMap((d) => d.rules), // 법제처 API 개별 법률
];
const ids = new Set(rules.map((r) => r.id));

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` → ${detail}` : ""}`);
};
const restrictionIds = (zone) => findCandidates(zone, rules).restriction.map((c) => c.rule.id);

// 1) 분류표와 정리본이 서로 맞는지 (분류표가 없는 id를 가리키면 근거가 사라진다)
check("제4조 제1항 사유 10개가 정리본에 모두 있음", RESTRICTION_IDS.every((id) => ids.has(id)));
check("분류표가 가리키는 정리본 항목이 모두 실제로 있음", ZONE_TOPICS.every((t) => t.ruleIds.every((id) => ids.has(id))), JSON.stringify(ZONE_TOPICS.flatMap((t) => t.ruleIds.filter((id) => !ids.has(id)))));

// 2) 제4조 사유 후보가 나와야 하는 지역·지구 → [이름, 기대 id]
const shouldHit = [
  ["개발제한구역", "gijun-4-2"],
  ["상수원보호구역", "gijun-4-6"],
  ["수변구역", "gijun-4-6"],
  ["군사시설보호구역", "gijun-4-2"],
  ["문화재보호구역", "gijun-4-2"],
  ["도시자연공원구역", "gijun-4-2"],
  ["보전산지", "gijun-4-2"],
  ["하천구역", "gijun-4-2"],
  ["소로3류(폭 8m 미만)", "gijun-4-2"],
  ["중로1류(폭 20m~25m)", "gijun-4-2"],
  ["보행자전용도로", "gijun-4-2"],
  ["광장", "gijun-4-2"],
  ["도시개발구역", "gijun-4-3"],
  ["택지개발지구", "gijun-4-3"],
  ["시도지정문화유산구역", "gijun-4-2"],
  ["역사문화환경보존지역", "gijun-4-2"],
  ["초등학교", "gijun-4-2"],
  ["대학", "gijun-4-2"],
  ["야생생물특별보호구역", "gijun-4-2"],
  ["공익용산지", "gijun-4-2"],
  ["소하천구역", "gijun-4-2"],
  ["고속국도법상의접도구역", "gijun-4-2"],
];
for (const [zone, id] of shouldHit) check(`후보 있음: ${zone} → ${id}`, restrictionIds(zone).includes(id), JSON.stringify(restrictionIds(zone)));

// 3) 제4조 사유 후보가 없어야 하는 지역·지구 (→ "제한 없음"이 될 수 있는 것들)
const shouldNotHit = [
  "준주거지역", "중심상업지역", "제1종일반주거지역", "제2종일반주거지역", "일반공업지역", "자연녹지지역",
  "생산관리지역", "지구단위계획구역", "가축사육제한구역", "자연환경보전지역", "농림지역", "도시지역",
  // 실제 조회에서 잘못 걸렸던 이름들 (글자 맞춤 실수 방지)
  "하수처리구역", "배수구역", "녹지구역", "준보전산지", "상대보호구역", "절대보호구역", "교육환경보호구역", "성장관리계획구역", "중점경관관리구역",
];
for (const zone of shouldNotHit) check(`후보 없음: ${zone}`, restrictionIds(zone).length === 0, JSON.stringify(restrictionIds(zone)));

// 4) 예외 규정은 제한 후보가 아니라 참고로 나온다
const sangsuwon = findCandidates("상수원보호구역", rules);
check("상수원보호구역: 제4조제2항(예외)은 참고 조항으로 분류", sangsuwon.related.some((c) => c.rule.id === "gijun-4-hang2") && !sangsuwon.restriction.some((c) => c.rule.id === "gijun-4-hang2"));

// 5) 입력 방어
check("빈 이름 → 후보 없음", findCandidates("", rules).restriction.length === 0 && findCandidates("   ", rules).related.length === 0);
check("괄호 설명만 달라도 같은 결과", JSON.stringify(restrictionIds("소로3류(폭 8m 미만)")) === JSON.stringify(restrictionIds("소로3류(폭 10m 미만)")));
check("후보 근거 항목은 원문 텍스트가 비어 있지 않음", findCandidates("개발제한구역", rules).restriction.every((c) => c.rule.text.length > 10));

// 5-2) "제한 없음"이 가능한 이름은 [후보 없음 + 허용 목록]일 때만이다
const canBeNone = (zone) => { const r = findCandidates(zone, rules); return r.restriction.length === 0 && r.allowed !== null; };
const noneAllowed = [
  "준주거지역", "중심상업지역", "일반상업지역", "제1종일반주거지역", "제2종일반주거지역", "일반공업지역", "자연녹지지역", "보전녹지지역", "생산녹지지역",
  "생산관리지역", "계획관리지역", "보전관리지역", "농림지역", "자연환경보전지역", "도시지역", "지구단위계획구역", "성장관리계획구역",
  "가축사육제한구역", "방화지구", "고도지구", "자연취락지구", "하수처리구역", "농업진흥구역", "농업보호구역",
  // 2026-11-12: 법제처 API로 받은 해당 법률 원문에 처분 제한 조항이 없음을 확인해 허용 목록에 올린 이름
  "과밀억제권역", "중점경관관리구역", "상대보호구역", "절대보호구역",
];
for (const zone of noneAllowed) check(`제한 없음 가능: ${zone}`, canBeNone(zone));
const confirmNeeded = [
  "교육환경보호구역", "임업용산지", "초지", "영농여건불리농지", "준보전산지", "관광특구", "연구개발특구",
  "배출시설설치제한지역", "처음보는이름구역",
  // 제한 후보가 있는 이름은 허용 목록과 상관없이 "제한 없음"이 될 수 없다
  "개발제한구역", "상수원보호구역", "소로3류(폭 8m 미만)", "도시개발구역", "대학",
];
for (const zone of confirmNeeded) check(`제한 없음 불가(확인 필요 이상): ${zone}`, !canBeNone(zone));

// 5-3) 문서 근거로 정한 판단: 농지는 제한이 아니라 참고, 개발사업 구역은 제3호 + 법 제57조
const relatedIds = (zone) => findCandidates(zone, rules).related.map((c) => c.rule.id);
check("농업진흥구역: 제한 후보 없음 + 참고 조항에 처분기준 제11조", restrictionIds("농업진흥구역").length === 0 && relatedIds("농업진흥구역").includes("gijun-11"));
check("농업보호구역: 제한 후보 없음 + 참고 조항에 처분기준 제11조", restrictionIds("농업보호구역").length === 0 && relatedIds("농업보호구역").includes("gijun-11"));
check("하수처리구역: 참고 조항에 처분기준 제4조제2항(예외)", relatedIds("하수처리구역").includes("gijun-4-hang2") && restrictionIds("하수처리구역").length === 0);
check("도시개발구역: 제3호 후보 + 참고 조항에 법 제57조", restrictionIds("도시개발구역").includes("gijun-4-3") && relatedIds("도시개발구역").includes("beop-57"));
check("법 제57조에 없는 기업도시는 개발사업 후보가 아님", restrictionIds("기업도시").length === 0);
check("허용 목록 근거 id가 모두 정리본에 있음", ["gijun-11", "gijun-4-hang2", "beop-57"].every((id) => ids.has(id)));

// 6) 실제 조회 사례(대전 서구 둔산동 1000)의 지역·지구
// 5-4) 개별 법률 연결 (법제처 API 정리본): 처분을 직접 제한한다고 명시된 조항만 연결한다
const lawCandidates = (zone, id) => findCandidates(zone, rules).related.filter((c) => c.rule.id === id);
check("도시개발구역: 도시개발법 제68조", lawCandidates("도시개발구역", "law-dosigaebal-68").length === 1);
check("근린공원: 도시공원법 제52조 + 제4조제1항제2호 후보", lawCandidates("근린공원", "law-dosigongwon-52").length === 1 && restrictionIds("근린공원").includes("gijun-4-2"));
check("도시자연공원구역: 도시공원법 제52조를 붙이지 않음(직접 가리키지 않음)", lawCandidates("도시자연공원구역", "law-dosigongwon-52").length === 0);
check("국립공원: 자연공원법 제75조", lawCandidates("국립공원", "law-jayeongongwon-75").length === 1);
check("문화재보호구역: 문화유산법 제65조·제66조", lawCandidates("문화재보호구역", "law-munhwayusan-65").length === 1 && lawCandidates("문화재보호구역", "law-munhwayusan-66").length === 1);
check("소로3류: 국토계획법 제97조", lawCandidates("소로3류(폭 8m 미만)", "law-gukto-97").length === 1);
check("대공방어협조구역·토지거래허가구역·개발제한구역: 처분을 직접 제한하는 조항이 없어 개별 법률을 붙이지 않음", ["대공방어협조구역", "토지거래계약에관한허가구역", "개발제한구역"].every((z) => findCandidates(z, rules).related.every((c) => !c.rule.id.startsWith("law-"))));
check("허용 목록 지역(도시지역)에는 개별 법률을 붙이지 않음", findCandidates("도시지역", rules).related.every((c) => !c.rule.id.startsWith("law-")));
check("연결한 개별 법률 조항이 모두 정리본에 있음", ["law-dosigaebal-68", "law-dosigongwon-52", "law-jayeongongwon-75", "law-munhwayusan-65", "law-munhwayusan-66", "law-gukto-97"].every((id) => ids.has(id)));



console.log("\n[실제 사례: 대전광역시 서구 둔산동 1000]");
const sample = ["준주거지역", "중심상업지역", "지구단위계획구역", "보행자전용도로", "소로3류(폭 8m 미만)", "중로1류(폭 20m~25m)", "중로2류(폭 15m~20m)", "소로1류(폭 10m~12m)", "가축사육제한구역"];
for (const zone of sample) {
  const r = findCandidates(zone, rules);
  const refs = r.restriction.map((c) => c.rule.ref).join(", ") || "없음";
  console.log(`  ${zone.padEnd(18)} 제한 후보: ${refs} | 제한 없음 가능: ${r.restriction.length === 0 && r.allowed ? `예(${r.allowed})` : "아니오"}`);
}

console.log(failed === 0 ? "\n통과" : `\n실패: ${failed}개`);
