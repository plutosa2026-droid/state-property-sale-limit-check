// 「토지이용규제 기본법」 별표에 나온 근거 법률들(data/rules/zone-laws.json)의 조문을 법제처 Open API로 받아
// 지역·지구별로 "근거 법률 내용"과 "국유재산 매각·활용 제한 조항 후보"를 만들 재료(data/rules/zone-law-texts.json)로 정리한다.
// 사용법: node --env-file=.env scripts/fetch-zone-law-texts.mjs   (LAW_OC는 .env에서 읽고 출력하지 않는다)
// 먼저 scripts/fetch-zone-laws.mjs 를 실행해 별표 표(zone-laws.json)를 만들어 둔다. 앱 실행 중에는 법제처를 부르지 않는다.
import { readFileSync, writeFileSync } from "node:fs";

const OC = (process.env.LAW_OC ?? "").trim();
if (!OC) {
  console.error("LAW_OC가 .env에 없습니다.");
  process.exit(1);
}
const BASE = "https://www.law.go.kr/DRF";
const MAX_EXTRA_ARTICLES = 8; // 법률마다 별표가 가리키는 조문 외에 더 담는 "제한 후보" 조문 수
const MAX_TEXT = 700; // 조문 한 개에 담는 글자 수(넘으면 자른다)

const zoneLaws = JSON.parse(readFileSync("data/rules/zone-laws.json", "utf8"));
const compact = (s) => s.replace(/[\s·ㆍ・]+/g, ""); // 띄어쓰기·가운뎃점 모양이 달라도 같은 법률 이름으로 본다
const clean = (s) => s.replace(/\s*<[^<>]*\d{4}\.[^<>]*>/g, "").replace(/[ \t ]+/g, " ").trim();

// 조문 안의 항·호·목 글자를 순서대로 모은다
function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join("\n");
  const parts = [];
  for (const [key, value] of Object.entries(node)) {
    if (/내용$/.test(key)) parts.push(typeof value === "string" ? value : textOf(value));
    else if (/^(항|호|목)$/.test(key)) parts.push(textOf(value));
  }
  return parts.filter(Boolean).join("\n");
}

// 별표의 조항 표기("제6조 및 제40조의7", "제10조제1항제1호")에서 조 번호(제N조, 제N조의M)를 뽑는다
function citedArticleKeys(article) {
  const keys = new Set();
  for (const m of article.matchAll(/제(\d+)조(?:의(\d+))?/g)) keys.add(m[2] ? `${m[1]}-${m[2]}` : m[1]);
  return keys;
}

// 국유재산의 "매각·양도·처분" 또는 "활용(대부·사용·점용·개발·건축 등)"을 직접 막거나 제한하는 문장이 있는지 점수를 낸다.
const STRONG = /((국유|공유)[^.。]{0,70}(처분|양도|매각|대부|사용|점용)[^.。]{0,40}(할 수 없|금지|제한|못한다|아니 된다))|((처분|양도|매각)[^.。]{0,40}(할 수 없|금지|제한|못한다|아니 된다))/g;
const USE_LIMIT = /(건축|설치|개발|형질변경|용도변경|점용|사용)[^.。]{0,70}(할 수 없|금지|제한|아니 된다|못한다)/g;
// 제목에 이런 낱말이 있으면 매각·활용 제한 조문일 가능성이 높다. ("개발제한구역"처럼 지역·지구 이름 속의 "제한"은 세지 않는다)
const TITLE_HINT = /제한(?!구역|지역)|금지|처분|양도|매각|행위|점용|사용/;
const score = (text, title = "") => (text.match(STRONG)?.length ?? 0) * 3 + (text.match(USE_LIMIT)?.length ?? 0) + (TITLE_HINT.test(title) ? 3 : 0);

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const lawNames = [...new Set(zoneLaws.rows.map((r) => r.lawName))];
const citedByLaw = new Map();
for (const row of zoneLaws.rows) {
  const set = citedByLaw.get(row.lawName) ?? new Set();
  for (const key of citedArticleKeys(row.article)) set.add(key);
  citedByLaw.set(row.lawName, set);
}

const laws = {};
const missing = [];
for (const lawName of lawNames) {
  try {
    const search = await getJson(`${BASE}/lawSearch.do?OC=${OC}&target=law&type=JSON&display=100&query=${encodeURIComponent(lawName)}`);
    const list = [search?.LawSearch?.law ?? []].flat();
    const hit = list.find((l) => compact(l["법령명한글"] ?? "") === compact(lawName) && l["현행연혁코드"] === "현행");
    if (!hit) {
      missing.push(lawName);
      continue;
    }
    const detail = await getJson(`${BASE}/lawService.do?OC=${OC}&target=law&type=JSON&MST=${hit["법령일련번호"]}`);
    const units = [detail["법령"]["조문"]["조문단위"] ?? []].flat().filter((a) => a["조문여부"] === "조문");
    const cited = citedByLaw.get(lawName) ?? new Set();

    const all = units.map((a) => {
      const key = a["조문가지번호"] ? `${a["조문번호"]}-${a["조문가지번호"]}` : String(a["조문번호"]);
      const ref = `제${a["조문번호"]}조${a["조문가지번호"] ? `의${a["조문가지번호"]}` : ""}`;
      const text = clean([clean(a["조문내용"] ?? ""), clean(textOf(a["항"] ?? a))].filter(Boolean).join("\n"));
      return { key, ref, title: a["조문제목"] ?? "", text, cited: cited.has(key) };
    });

    const citedArticles = all.filter((a) => a.cited);
    const extras = all
      .filter((a) => !a.cited)
      .map((a) => ({ a, s: score(a.text, a.title) }))
      .filter((x) => x.s >= 3) // 제한하는 문장이 거의 없는 조문은 담지 않는다
      .sort((x, y) => y.s - x.s)
      .slice(0, MAX_EXTRA_ARTICLES)
      .map((x) => x.a);

    const eff = hit["시행일자"];
    laws[lawName] = {
      baseDate: `${eff.slice(0, 4)}-${eff.slice(4, 6)}-${eff.slice(6, 8)}`,
      articles: [...citedArticles, ...extras].map((a) => ({ ref: a.ref, title: a.title, text: a.text.slice(0, MAX_TEXT), cited: a.cited })),
    };
  } catch (error) {
    missing.push(`${lawName} (오류: ${error instanceof Error ? error.message : "알 수 없음"})`);
  }
}

const total = Object.values(laws).reduce((n, l) => n + l.articles.length, 0);
writeFileSync(
  "data/rules/zone-law-texts.json",
  JSON.stringify({ document: { source: "법제처 Open API", laws: Object.keys(laws).length, articles: total, note: "별표가 가리키는 조문 + 매각·활용 제한 문장이 있는 조문 후보만 담았다." }, laws }) + "\n",
  "utf8",
);
console.log(`법률 ${Object.keys(laws).length}/${lawNames.length}개, 조문 ${total}개 (cited ${Object.values(laws).reduce((n, l) => n + l.articles.filter((a) => a.cited).length, 0)})`);
if (missing.length) console.log("못 받은 법률:\n- " + missing.join("\n- "));
