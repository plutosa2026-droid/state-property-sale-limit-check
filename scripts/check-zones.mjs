// 지역·지구 표시 도구(lib/zones.ts)를 사례로 확인하는 스크립트.
// 사용법: node scripts/check-zones.mjs
import { countRelations, formatKoreaTime, relationLabel } from "../lib/zones.ts";

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` → ${detail}` : ""}`);
};

const zones = [
  { name: "A", relation: "저촉" },
  { name: "B", relation: "저촉" },
  { name: "C", relation: "접함" },
  { name: "D", relation: "포함" },
  { name: "E", relation: "" },
  { name: "F", relation: "모르는값" },
];
const counts = countRelations(zones);
check("건수: 저촉 2", counts.저촉 === 2, JSON.stringify(counts));
check("건수: 접함 1", counts.접함 === 1);
check("건수: 포함 1", counts.포함 === 1);
check("건수: 비었거나 모르는 값은 '표기 없음' 2", counts["표기 없음"] === 2);
check("건수 합계가 목록 개수와 같음(빠지는 항목 없음)", Object.values(counts).reduce((a, b) => a + b, 0) === zones.length);
check("빈 목록", Object.values(countRelations([])).every((n) => n === 0));
check("표기: 빈 값 → 표기 없음", relationLabel({ name: "x", relation: "" }) === "표기 없음");
check("시각 형식", formatKoreaTime("2026-11-12T14:03:07+09:00") === "2026-11-12 14:03:07 (한국 시간)");
check("시각 형식이 이상하면 그대로", formatKoreaTime("어제") === "어제");

console.log(failed === 0 ? "\n통과" : `\n실패: ${failed}개`);
process.exitCode = failed === 0 ? 0 : 1;
