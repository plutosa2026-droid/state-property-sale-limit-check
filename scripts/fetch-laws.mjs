// 법제처 국가법령정보 Open API에서 (1) 앱에 넣은 국유재산법령 3종의 현행 여부를 확인하고,
// (2) 지역·지구와 관련된 개별 법률의 "처분(양도·매각·소유권 이전 등)" 관련 조항을 받아 data/rules/laws.json 으로 만든다.
// 사용법: node --env-file=.env scripts/fetch-laws.mjs        (LAW_OC는 .env에서 읽고 어디에도 출력하지 않는다)
// 앱 실행에는 쓰이지 않는 일회용 도구다. 법령이 개정되면 다시 실행해 정리본을 갱신한다.
import { readFileSync, writeFileSync } from "node:fs";

const OC = (process.env.LAW_OC ?? "").trim();
if (!OC) {
  console.error("LAW_OC가 .env에 없습니다.");
  process.exit(1);
}
const BASE = "https://www.law.go.kr/DRF";

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function findLaw(name) {
  const data = await getJson(`${BASE}/lawSearch.do?OC=${OC}&target=law&type=JSON&display=100&query=${encodeURIComponent(name)}`);
  const list = [data?.LawSearch?.law ?? []].flat();
  const hit = list.find((l) => l["법령명한글"] === name && l["현행연혁코드"] === "현행");
  return hit ? { mst: hit["법령일련번호"], effective: hit["시행일자"], promulgated: hit["공포일자"] } : null;
}

const iso = (yyyymmdd) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

// ---------- (1) 현행 확인: 앱에 넣어 둔 정리본의 기준일과 법제처 현행 시행일 비교 ----------
const OWN = [
  { name: "국유재산법", file: "beop" },
  { name: "국유재산법 시행령", file: "sihaengryeong" },
  { name: "국유재산법 시행규칙", file: "sihaenggyuchik" },
];
console.log("[현행 확인] 앱에 넣은 정리본 ↔ 법제처 현행");
let stale = 0;
for (const { name, file } of OWN) {
  const mine = JSON.parse(readFileSync(`data/rules/${file}.json`, "utf8")).document.baseDate;
  const live = await findLaw(name);
  if (!live) {
    console.log(`  ? ${name}: 법제처에서 현행본을 찾지 못함`);
    continue;
  }
  const same = iso(live.effective) === mine;
  if (!same) stale += 1;
  console.log(`  ${same ? "✓ 최신" : "✗ 다름"} ${name}: 앱 ${mine} / 법제처 현행 시행일 ${iso(live.effective)}${same ? "" : ` (공포 ${iso(live.promulgated)})`}`);
}
console.log(stale === 0 ? "→ 3종 모두 현행과 같은 시행일입니다.\n" : `→ ${stale}종이 현행과 다릅니다. 원문을 다시 받아야 합니다.\n`);

// ---------- (2) 개별 법률 정리본 ----------
// key: 조항 id에 쓰는 짧은 이름. 지역·지구와의 연결은 lib/ruleMatch.ts 의 LAW_TOPICS 에 있다.
const LAWS = [
  ["sudogwon", "수도권정비계획법"],
  ["georaesingo", "부동산 거래신고 등에 관한 법률"],
  ["gyeonggwan", "경관법"],
  ["hakgyobogeon", "학교보건법"],
  ["gunsagiji", "군사기지 및 군사시설 보호법"],
  ["gaebaljehan", "개발제한구역의 지정 및 관리에 관한 특별조치법"],
  ["dosigongwon", "도시공원 및 녹지 등에 관한 법률"],
  ["sanjigwanri", "산지관리법"],
  ["sabang", "사방사업법"],
  ["dosigaebal", "도시개발법"],
  ["hacheon", "하천법"],
  ["munhwayusan", "문화유산의 보존 및 활용에 관한 법률"],
  ["jayeongongwon", "자연공원법"],
  ["nongji", "농지법"],
  ["sudo", "수도법"],
  ["doro", "도로법"],
  ["gukto", "국토의 계획 및 이용에 관한 법률"],
];

// 처분(양도·매각·소유권 이전 등)과 관련 있어 보이는 조항만 담는다. 이 낱말이 없는 조항은 매각제한 근거가 될 수 없다.
const DISPOSAL = /처분|양도|매각|매매|소유권|양수|거래|취득|저당|국유|대부/;

function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join("\n");
  // 항/호/목 내용을 순서대로 모은다 (번호 키는 제외)
  const parts = [];
  for (const [key, value] of Object.entries(node)) {
    if (/내용$/.test(key)) parts.push(typeof value === "string" ? value : textOf(value));
    else if (/^(항|호|목)$/.test(key)) parts.push(textOf(value));
  }
  return parts.filter(Boolean).join("\n");
}

const clean = (s) => s.replace(/\s*<[^<>]*\d{4}\.[^<>]*>/g, "").replace(/[ \t ]+/g, " ").trim();

const documents = [];
for (const [key, name] of LAWS) {
  const found = await findLaw(name);
  if (!found) {
    console.log(`✗ ${name}: 현행본을 찾지 못했습니다 (이름 확인 필요)`);
    continue;
  }
  const detail = await getJson(`${BASE}/lawService.do?OC=${OC}&target=law&type=JSON&MST=${found.mst}`);
  const articles = [detail["법령"]["조문"]["조문단위"]].flat().filter((a) => a["조문여부"] === "조문");
  const rules = [];
  for (const a of articles) {
    const head = clean(a["조문내용"] ?? "");
    const body = clean(textOf(a["항"] ?? a));
    const text = clean([head, body].filter(Boolean).join("\n"));
    if (!DISPOSAL.test(text)) continue;
    const no = `${a["조문번호"]}${a["조문가지번호"] ? `의${a["조문가지번호"]}` : ""}`;
    rules.push({
      id: `law-${key}-${no.replace("의", "-")}`,
      source: name,
      ref: `제${no}조`,
      title: a["조문제목"] ?? "",
      text,
      keywords: [],
      baseDate: iso(found.effective),
    });
  }
  documents.push({
    document: { name, baseDate: iso(found.effective), basis: "시행일", file: `법제처 API ${key}`, articles: rules.length, note: "처분·양도·소유권 이전 등과 관련된 조항만 담았다." },
    rules,
  });
  console.log(`✓ ${name}: 시행 ${iso(found.effective)}, 전체 ${articles.length}개 조문 중 처분 관련 ${rules.length}개`);
}

writeFileSync("data/rules/laws.json", JSON.stringify({ documents }, null, 1) + "\n", "utf8");
console.log(`\ndata/rules/laws.json: 법률 ${documents.length}개, 조항 ${documents.reduce((n, d) => n + d.rules.length, 0)}개`);
