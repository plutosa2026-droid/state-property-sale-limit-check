// 과거 매각 검토 사례로 성공 기준 3가지를 측정하는 스크립트 (PLAN 작업 17, DESIGN 8장).
//   1) 빠짐없이: 사례 파일에 적힌 지역·지구(토지이음 토지이용계획확인서 기준) 중 앱 조회 결과에 나온 비율  → 목표 100%
//   2) 정확하게: 지역·지구 하나하나에서 앱 판정이 당시 검토 문서의 제한 여부와 같은 비율 ("확인 필요"는 불일치) → 목표 90% 이상
//   3) 근거와 함께: 앱이 "제한 있음/제한 없음"으로 판정한 것 중 근거가 붙은 비율                              → 목표 100%
//
// 사용법 (개발 서버가 켜져 있어야 하고, .env에 키가 있어야 한다):
//   node scripts/run-cases.mjs [서버 주소, 기본 http://localhost:3100] [사례 파일, 기본 source-docs/cases/cases.csv]
//
// 사례 파일(CSV) 모양은 data/cases-template.csv 참고. 한 줄 = 한 지역·지구.
//   사례번호, 지번, 지역·지구, 당시결과("제한 있음" 또는 "제한 없음"), 메모
//   - 같은 사례(같은 사례번호·지번)의 줄을 토지이음 확인서의 지역·지구 전부 적어야 "빠짐없이"를 제대로 측정할 수 있다.
//   - 사례 파일은 source-docs/cases/ 에 둔다. (Git에 올라가지 않는 폴더. 개인정보는 적지 않는다.)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const csvPath = process.argv[3] ?? "source-docs/cases/cases.csv";

// ---------- CSV 읽기 (따옴표·쉼표·엑셀의 BOM 처리) ----------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const normalize = (name) => name.replace(/\([^)]*\)/g, "").replace(/\s+/g, "").trim();

// ---------- 사례 불러오기 ----------
let text;
try {
  text = readFileSync(csvPath, "utf8");
} catch {
  console.error(`사례 파일을 찾을 수 없습니다: ${csvPath}\ndata/cases-template.csv를 복사해 source-docs/cases/cases.csv로 만들고 사례를 채워 주세요.`);
  process.exit(2);
}
const [header, ...body] = parseCsv(text);
const col = (name) => header.findIndex((h) => h.trim() === name);
const idx = { no: col("사례번호"), parcel: col("지번"), zone: col("지역·지구"), result: col("당시결과"), memo: col("메모") };
if (Object.values(idx).slice(0, 4).some((i) => i < 0)) {
  console.error("첫 줄(머리글)이 맞지 않습니다. data/cases-template.csv의 머리글을 그대로 써 주세요: 사례번호,지번,지역·지구,당시결과,메모");
  process.exit(2);
}
const rows = body.map((r, i) => ({ line: i + 2, no: r[idx.no]?.trim(), parcel: r[idx.parcel]?.trim(), zone: r[idx.zone]?.trim(), expected: r[idx.result]?.trim() }));
const invalid = rows.filter((r) => !r.no || !r.parcel || !r.zone || !["제한 있음", "제한 없음"].includes(r.expected));
if (invalid.length > 0) {
  console.error(`사례 파일 ${invalid.length}줄이 비었거나 당시결과가 "제한 있음"/"제한 없음"이 아닙니다:`);
  for (const r of invalid.slice(0, 10)) console.error(`  ${r.line}번째 줄: ${JSON.stringify(r)}`);
  process.exit(2);
}

// ---------- 사례별로 앱 호출 ----------
async function post(path, payload) {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(180000) });
  return res.json();
}

const cases = new Map(); // "사례번호|지번" → 줄들
for (const r of rows) {
  const key = `${r.no}|${r.parcel}`;
  cases.set(key, [...(cases.get(key) ?? []), r]);
}

const details = []; // 지역·지구 한 줄마다 결과
const caseNotes = []; // 사례 단위 메모(조회 실패 등)
const extras = []; // 앱에는 나왔는데 사례 파일에는 없는 지역·지구
let decisive = 0; // "제한 있음/제한 없음"으로 판정한 수
let decisiveWithEvidence = 0;

for (const [key, caseRows] of cases) {
  const [no, parcel] = key.split("|");
  console.log(`사례 ${no}: ${parcel} 조회 중…`);
  let land;
  try {
    land = await post("/api/land-use", { parcel });
  } catch {
    land = { ok: false, error: "SERVICE_ERROR", message: "서버에 연결하지 못했습니다." };
  }
  if (!land.ok) {
    caseNotes.push(`사례 ${no} (${parcel}): 조회 실패 — ${land.error}: ${land.message}`);
    for (const r of caseRows) details.push({ ...r, found: false, actual: "(조회 실패)", match: false });
    continue;
  }
  let check;
  try {
    check = await post("/api/check", { address: land.address, zones: land.zones, token: land.token });
  } catch {
    check = { ok: false, error: "CHECK_ERROR", message: "서버에 연결하지 못했습니다." };
  }
  if (!check.ok) {
    caseNotes.push(`사례 ${no} (${parcel}): 판정 실패 — ${check.error}: ${check.message}`);
    for (const r of caseRows) details.push({ ...r, found: land.zones.some((z) => normalize(z.name) === normalize(r.zone)), actual: "(판정 실패)", match: false });
    continue;
  }
  const byName = new Map(check.results.map((z) => [normalize(z.zone), z]));
  for (const z of check.results) {
    if (z.verdict !== "확인 필요") {
      decisive += 1;
      if (z.evidence.length > 0) decisiveWithEvidence += 1;
    }
  }
  for (const r of caseRows) {
    const z = byName.get(normalize(r.zone));
    details.push({ ...r, found: Boolean(z), actual: z?.verdict ?? "(앱 조회에 없음)", relation: z?.relation, reason: z?.reason, match: z?.verdict === r.expected });
  }
  const listed = new Set(caseRows.map((r) => normalize(r.zone)));
  for (const z of check.results) if (!listed.has(normalize(z.zone))) extras.push(`사례 ${no}: ${z.zone} (${z.relation}) → ${z.verdict}`);
}

// ---------- 결과 계산 ----------
const total = details.length;
const found = details.filter((d) => d.found).length;
const matched = details.filter((d) => d.match).length;
const pct = (n, d) => (d === 0 ? "해당 없음" : `${((n / d) * 100).toFixed(1)}%`);
const ok = (n, d, target) => (d > 0 && (n / d) * 100 >= target ? "✅ 달성" : "❌ 미달");

const lines = [];
lines.push(`# 사례 시험 결과 (${new Date().toISOString().slice(0, 10)})`, "");
lines.push(`- 사례 ${cases.size}건, 지역·지구 ${total}줄`, "");
lines.push("| 성공 기준 | 측정값 | 목표 | 결과 |", "|---|---|---|---|");
lines.push(`| 빠짐없이 (토지이음 지역·지구가 앱 조회에 나온 비율) | ${pct(found, total)} (${found}/${total}) | 100% | ${ok(found, total, 100)} |`);
lines.push(`| 정확하게 (앱 판정 = 당시 검토 제한 여부, "확인 필요"는 불일치) | ${pct(matched, total)} (${matched}/${total}) | 90% 이상 | ${ok(matched, total, 90)} |`);
lines.push(`| 근거와 함께 ("제한 있음/없음" 판정 중 근거가 붙은 비율) | ${pct(decisiveWithEvidence, decisive)} (${decisiveWithEvidence}/${decisive}) | 100% | ${ok(decisiveWithEvidence, decisive, 100)} |`, "");

const wrong = details.filter((d) => !d.match);
const confirmNeeded = wrong.filter((d) => d.actual === "확인 필요").length;
lines.push(`## 불일치 ${wrong.length}줄 (이 중 앱이 "확인 필요"로 답한 것 ${confirmNeeded}줄)`, "");
if (wrong.length > 0) {
  lines.push("| 사례 | 지역·지구 | 표기 | 당시 결과 | 앱 판정 | 앱의 이유 |", "|---|---|---|---|---|---|");
  for (const d of wrong) lines.push(`| ${d.no} | ${d.zone} | ${d.relation ?? "-"} | ${d.expected} | ${d.actual} | ${(d.reason ?? "").replace(/\|/g, "/")} |`);
  lines.push("");
}
const missing = details.filter((d) => !d.found);
if (missing.length > 0) lines.push(`## 앱 조회에 나오지 않은 지역·지구 ${missing.length}줄`, "", ...missing.map((d) => `- 사례 ${d.no}: ${d.zone}`), "");
if (caseNotes.length > 0) lines.push("## 사례 단위 문제", "", ...caseNotes.map((n) => `- ${n}`), "");
if (extras.length > 0) lines.push("## 앱에는 나왔지만 사례 파일에 없는 지역·지구 (참고)", "", ...extras.map((e) => `- ${e}`), "");

const report = lines.join("\n");
console.log("\n" + report);
const outPath = csvPath.replace(/[^/\\]+$/, "") + `결과_${new Date().toISOString().slice(0, 10)}.md`;
try {
  mkdirSync(outPath.replace(/[^/\\]+$/, "") || ".", { recursive: true });
  writeFileSync(outPath, report, "utf8");
  console.log(`\n보고서 저장: ${outPath}`);
} catch {
  console.log("\n(보고서 파일 저장은 건너뜀)");
}
process.exitCode = found === total && matched / total >= 0.9 && decisive === decisiveWithEvidence ? 0 : 1;
