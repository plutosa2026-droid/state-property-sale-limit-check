// 법제처 Open API에서 「토지이용규제 기본법」 별표("토지이용규제를 하는 지역·지구등")를 받아
// "지역·지구 이름 → 근거 법률" 표(data/rules/zone-laws.json)로 만든다.
// 사용법: node --env-file=.env scripts/fetch-zone-laws.mjs   (LAW_OC는 .env에서 읽고 출력하지 않는다)
// 앱 실행 중에는 법제처를 부르지 않는다. 별표가 개정되면 이 스크립트를 다시 실행한다.
import { writeFileSync } from "node:fs";

const OC = (process.env.LAW_OC ?? "").trim();
if (!OC) {
  console.error("LAW_OC가 .env에 없습니다.");
  process.exit(1);
}
const BASE = "https://www.law.go.kr/DRF";
const LAW_NAME = "토지이용규제 기본법";

const search = await (await fetch(`${BASE}/lawSearch.do?OC=${OC}&target=law&type=JSON&query=${encodeURIComponent(LAW_NAME)}`)).json();
const hit = [search?.LawSearch?.law ?? []].flat().find((l) => l["법령명한글"] === LAW_NAME && l["현행연혁코드"] === "현행");
if (!hit) throw new Error("현행 토지이용규제 기본법을 찾지 못했습니다.");
const detail = await (await fetch(`${BASE}/lawService.do?OC=${OC}&target=law&type=JSON&MST=${hit["법령일련번호"]}`)).json();
const annex = [detail["법령"]["별표"]?.["별표단위"] ?? []].flat().find((a) => String(a["별표제목"]).includes("지역·지구등"));
if (!annex) throw new Error("별표(지역·지구등)를 찾지 못했습니다.");

// 상자 그림 문자(┃ │ ┠ ┼ …)로 그린 표를 행·칸으로 읽는다. 한 칸이 여러 줄이면 이어 붙인다.
const lines = String(annex["별표내용"]).split(/\r?\n|,(?=[┃┏┠┗])/).map((l) => l.trim());
const rows = [];
let current = null;
for (const line of lines) {
  if (!line.startsWith("┃")) {
    if (/^┠/.test(line) || /^┗/.test(line)) { if (current) rows.push(current); current = null; }
    continue;
  }
  const cells = line.replace(/^┃|┃$/g, "").split("│").map((c) => c.trim());
  if (cells.length < 3) continue;
  if (cells[0] === "연번") continue;
  if (/^\d+$/.test(cells[0])) {
    if (current) rows.push(current);
    current = { no: Number(cells[0]), law: cells[1], zone: cells[2] };
  } else if (current) {
    current.law = `${current.law}${cells[1] ?? ""}`;
    current.zone = `${current.zone}${cells[2] ?? ""}`;
  }
}
if (current) rows.push(current);

// 칸이 줄바꿈되며 붙은 "및제7조" 같은 모양을 "및 제7조"로 바로잡는다
const clean = (s) => s.replace(/\s+/g, " ").replace(/(및|또는)제(?=\d)/g, "$1 제").trim();
const result = rows.filter((r) => r.zone && r.law && !/삭제/.test(r.zone + r.law)).map((r) => {
  const law = clean(r.law);
  const m = law.match(/「([^」]+)」\s*(.*)$/);
  return { no: r.no, lawName: m ? m[1].trim() : law, article: m ? clean(m[2]) : "", law, zone: clean(r.zone) };
});

const out = {
  document: { name: "토지이용규제 기본법 별표(토지이용규제를 하는 지역·지구등)", baseDate: `${hit["시행일자"].slice(0, 4)}-${hit["시행일자"].slice(4, 6)}-${hit["시행일자"].slice(6, 8)}`, basis: "시행일", source: "법제처 Open API", rows: result.length },
  rows: result,
};
writeFileSync("data/rules/zone-laws.json", JSON.stringify(out, null, 1) + "\n", "utf8");
console.log(`zone-laws.json: ${result.length}행 (시행 ${out.document.baseDate})`);
console.log(result.slice(0, 6).map((r) => `${r.no} | ${r.zone} | ${r.lawName} ${r.article}`).join("\n"));
