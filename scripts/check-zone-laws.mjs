// 지역·지구 → 근거 법률 표(data/rules/zone-laws.json)와 찾기(lib/zoneLaws.ts)를 사례로 확인한다.
// 사용법: node scripts/check-zone-laws.mjs
import { readFileSync } from "node:fs";
import { findZoneLaws, normalizeZoneName } from "../lib/zoneLaws.ts";

const { rows, document } = JSON.parse(readFileSync("data/rules/zone-laws.json", "utf8"));
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` → ${detail}` : ""}`);
};
const laws = (zone) => findZoneLaws(zone, rows);

check("표에 200행 이상 있고 기준일이 있음", rows.length >= 200 && /^\d{4}-\d{2}-\d{2}$/.test(document.baseDate), `${rows.length}행`);
check("삭제된 행·빈 칸이 없음", rows.every((r) => r.zone && r.law && !/삭제/.test(r.zone + r.law)));
check("모든 행에 법률 이름이 있음", rows.every((r) => r.lawName.length >= 2));
check("줄바꿈으로 붙은 '및제' 모양이 없음", rows.every((r) => !/(및|또는)제\d/.test(r.law)));

const expect = [
  ["도시개발구역", "도시개발법"],
  ["개발제한구역", "개발제한구역의 지정 및 관리에 관한 특별조치법"],
  ["상수원보호구역", "수도법"],
  ["대공방어협조구역", "군사기지 및 군사시설 보호법"],
  ["상대보호구역", "교육환경 보호에 관한 법률"],
  ["과밀억제권역", "수도권정비계획법"],
  ["공익용산지", "산지관리법"],
  ["사방지", "사방사업법"],
  ["가축사육제한구역", "가축분뇨의 관리 및 이용에 관한 법률"],
  ["지구단위계획구역", "국토의 계획 및 이용에 관한 법률"],
  ["도시지역", "국토의 계획 및 이용에 관한 법률"],
  ["도시자연공원구역", "국토의 계획 및 이용에 관한 법률"],
  ["제3종일반주거지역", "국토의 계획 및 이용에 관한 법률"], // 갈래(주거지역)로 연결
  ["자연녹지지역", "국토의 계획 및 이용에 관한 법률"],
  ["일반상업지역", "국토의 계획 및 이용에 관한 법률"],
  ["농업진흥구역", "농지법"],
  ["하천구역", "하천법"],
];
for (const [zone, law] of expect) check(`${zone} → ${law}`, laws(zone).some((l) => l.includes(law)), JSON.stringify(laws(zone)));

check("별표에 없는 이름은 빈 배열 (지어내지 않음)", laws("비오톱1등급").length === 0 && laws("처음보는이름구역").length === 0 && laws("").length === 0);
check("괄호 설명이 달라도 같은 결과", JSON.stringify(laws("소로3류(폭 8m 미만)")) === JSON.stringify(laws("소로3류")));
check("공백·가운뎃점 모양 차이를 무시", normalizeZoneName("생태·경관 보전지역") === normalizeZoneName("생태ㆍ경관보전지역"));
check("'상수원보호구역'에 문화유산법의 일반 '보호구역'이 엉뚱하게 붙지 않음", laws("상수원보호구역").every((l) => !l.includes("문화유산")));
check("결과에 중복이 없음", laws("도시지역").length === new Set(laws("도시지역")).size);

console.log(failed === 0 ? "\n통과" : `\n실패: ${failed}개`);
process.exit(failed === 0 ? 0 : 1);
