// 지역·지구 → 근거 법률 표(data/rules/zone-laws.json)와 찾기(lib/zoneLaws.ts)를 사례로 확인한다.
// 사용법: node scripts/check-zone-laws.mjs
import { readFileSync } from "node:fs";
import { citedArticleRefs, findZoneLaws, hasRestrictiveWording, normalizeZoneName } from "../lib/zoneLaws.ts";

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

// ----- 별표의 조항 표기 읽기 (lib/zoneLaws.ts) -----
check("조항 표기 읽기: 제3조", JSON.stringify(citedArticleRefs("제3조")) === JSON.stringify(["제3조"]), JSON.stringify(citedArticleRefs("제3조")));
check("조항 표기 읽기: 제6조 및 제40조의7", JSON.stringify(citedArticleRefs("제6조 및 제40조의7")) === JSON.stringify(["제6조", "제40조의7"]));
check("조항 표기 읽기: 제10조제1항제2호 → 제10조", JSON.stringify(citedArticleRefs("제10조제1항제2호")) === JSON.stringify(["제10조"]));
check("제한하는 말 검사", hasRestrictiveWording("…할 수 없다") && hasRestrictiveWording("금지한다") && !hasRestrictiveWording("지정할 수 있다"));

// ----- 근거 법률 조문(data/rules/zone-law-texts.json) -----
const texts = JSON.parse(readFileSync("data/rules/zone-law-texts.json", "utf8")).laws;
const lawNames = [...new Set(rows.map((r) => r.lawName))];
check("별표의 모든 법률의 조문을 받아 둠", lawNames.every((n) => texts[n]?.articles?.length > 0), lawNames.filter((n) => !texts[n]?.articles?.length).join(", "));
check("조문 글이 비어 있지 않고 700자 이내", Object.values(texts).every((l) => l.articles.every((a) => a.text.length > 5 && a.text.length <= 700)));
const refsOf = (article) => [...article.matchAll(/제(\d+)조(?:의(\d+))?/g)].map((m) => `제${m[1]}조${m[2] ? `의${m[2]}` : ""}`);
const missingCited = rows.filter((r) => texts[r.lawName] && !refsOf(r.article).some((ref) => texts[r.lawName].articles.some((a) => a.ref === ref && a.cited)));
check("별표가 가리키는 조문의 글이 들어 있음 (빠진 행 5개 이하)", missingCited.length <= 5, missingCited.slice(0, 5).map((r) => r.lawName + " " + r.article).join(" / "));
const dosi = texts["도시개발법"].articles;
check("도시개발법: 제3조(별표)와 제68조(국공유지의 처분 제한)가 있음", dosi.some((a) => a.ref === "제3조" && a.cited) && dosi.some((a) => a.ref === "제68조" && /처분 제한/.test(a.title)));
const gae = texts["개발제한구역의 지정 및 관리에 관한 특별조치법"].articles;
check("개발제한구역법: 제12조(행위제한)가 후보로 들어 있음", gae.some((a) => a.ref === "제12조" && /행위제한/.test(a.title)));

console.log(failed === 0 ? "\n통과" : `\n실패: ${failed}개`);
process.exit(failed === 0 ? 0 : 1);
