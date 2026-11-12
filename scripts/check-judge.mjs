// 판정 API(/api/check)를 실제로 호출해 확인하는 스크립트. 개발 서버가 켜져 있어야 한다.
// 사용법: node --env-file=.env scripts/check-judge.mjs [서버 주소, 기본 http://localhost:3100]
// 실제 OpenAI를 호출하므로 .env에 OPENAI_API_KEY가 있어야 하고, 키 값은 어디에도 출력하지 않는다.
import { readFileSync } from "node:fs";
import { deriveSecret, signLookup } from "../lib/token.ts";

const base = process.argv[2] ?? "http://localhost:3100";
const keys = [process.env.OPENAI_API_KEY, process.env.VWORLD_API_KEY].filter(Boolean);
const ruleIds = new Set([...["gijun", "beop", "sihaengryeong", "sihaenggyuchik", "yogang"].flatMap((n) => JSON.parse(readFileSync(`data/rules/${n}.json`, "utf8")).rules.map((r) => r.id)), ...JSON.parse(readFileSync("data/rules/laws.json", "utf8")).documents.flatMap((d) => d.rules.map((r) => r.id))]);
const zoneLawTexts = JSON.parse(readFileSync("data/rules/zone-law-texts.json", "utf8")).laws;
Object.keys(zoneLawTexts).forEach((name, index) => zoneLawTexts[name].articles.forEach((a) => ruleIds.add(`zl-${index}-${a.ref}`)));
ruleIds.add("gijun-4-none"); // "제한 없음"의 고정 근거 표기

// 판정 API는 "서버가 서명한 조회 결과"만 받는다. 시험에서는 서버와 같은 방법으로 서명 키를 만들어 토큰을 직접 만든다. (lib/server/guard.ts와 같은 방식)
const secret = deriveSecret([(process.env.APP_SECRET ?? "").trim(), (process.env.OPENAI_API_KEY ?? "").trim(), (process.env.VWORLD_API_KEY ?? "").trim()]);
const tokenFor = (address, zones, nowSec = Math.floor(Date.now() / 1000)) => signLookup(secret, address, zones, nowSec);

let failed = 0;
const allText = [];
const check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` → ${detail}` : ""}`);
};

async function post(body, raw) {
  const response = await fetch(`${base}/api/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body && body.token === undefined && body.zones ? { ...body, token: tokenFor(body.address, body.zones) } : body),
    signal: AbortSignal.timeout(120000),
  });
  const text = await response.text();
  allText.push(text);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: response.status, json, text };
}
const judge = async (name, relation) => (await post({ address: "대전광역시 서구 둔산동 1000", zones: [{ name, relation }] })).json?.results?.[0];
const line = (r) => `${r.zone}(${r.relation}) → ${r.verdict} | 근거 ${r.evidence.map((e) => e.ref).join(", ") || "없음"} | ${r.reason}`;

// 1) AI 없이 규칙으로 정해지는 경우
const a = await judge("준주거지역", "포함");
check("용도지역(포함): 제한 없음 + 고정 근거", a?.verdict === "제한 없음" && a.evidence[0]?.id === "gijun-4-none" && /제4조 해당 사유 없음/.test(a.evidence[0].quote), a && line(a));
const b = await judge("소로3류(폭 8m 미만)", "저촉");
check("저촉: 확인 필요 + 제4조제1항제2호 근거", b?.verdict === "확인 필요" && b.evidence.some((e) => e.id === "gijun-4-2"), b && line(b));
const c = await judge("중로1류(폭 20m~25m)", "접함");
check("접함: 확인 필요", c?.verdict === "확인 필요", c && line(c));
const d = await judge("처음보는이름구역", "포함");
check("낯선 이름(포함): 확인 필요 + 근거 없음", d?.verdict === "확인 필요" && d.evidence.length === 0, d && line(d));
const e = await judge("농업진흥구역", "포함");
check("농업진흥구역: 제한 없음 + 참고 근거 제11조", e?.verdict === "제한 없음" && e.evidence.some((x) => x.id === "gijun-11"), e && line(e));
const f = await judge("가축사육제한구역", "");
check("표기가 비어 있음: 확인 필요", f?.verdict === "확인 필요", f && line(f));

// 2) AI가 판정하는 경우 (제4조 후보가 있는 포함 지역·지구)
const aiCases = [["개발제한구역", "포함"], ["상수원보호구역", "포함"], ["국가산업단지", "포함"], ["역사문화환경보존지역", "포함"], ["하천구역", "포함"]];
console.log("\n[AI 판정]");
for (const [name, relation] of aiCases) {
  const r = await judge(name, relation);
  if (!r) {
    check(`AI 판정: ${name}`, false, "응답 없음");
    continue;
  }
  console.log(`  ${line(r)}`);
  check(`AI 판정 ${name}: 제한 없음은 나올 수 없음(후보가 있으므로)`, r.verdict === "제한 있음" || r.verdict === "확인 필요");
  check(`AI 판정 ${name}: 근거 id가 모두 정리본에 있음`, r.evidence.every((x) => ruleIds.has(x.id)), JSON.stringify(r.evidence.map((x) => x.id)));
  check(`AI 판정 ${name}: "제한 있음"이면 근거가 1개 이상`, r.verdict !== "제한 있음" || r.evidence.length > 0);
  check(`AI 판정 ${name}: 이유 100자 이내·비어 있지 않음`, r.reason.length > 0 && r.reason.length <= 100, String(r.reason.length));
}

// 3) 한꺼번에 여러 건 (실제 조회 사례: 대전 서구 둔산동 1000, 지역·지구 9건)
const zones = [
  ["준주거지역", "포함"], ["중심상업지역", "접함"], ["지구단위계획구역", "포함"], ["보행자전용도로", "저촉"], ["소로3류(폭 8m 미만)", "저촉"],
  ["중로1류(폭 20m~25m)", "접함"], ["중로2류(폭 15m~20m)", "접함"], ["소로1류(폭 10m~12m)", "저촉"], ["가축사육제한구역", "포함"],
].map(([name, relation]) => ({ name, relation }));
const all = await post({ address: "대전광역시 서구 둔산동 1000", zones });
const res = all.json;
console.log("\n[여러 건 한꺼번에]");
check("여러 건: 200 + ok", all.status === 200 && res?.ok === true, `${all.status} ${all.text.slice(0, 120)}`);
check("여러 건: 지역·지구 수와 결과 수가 같고 순서 유지", res?.results?.length === zones.length && res.results.every((r, i) => r.zone === zones[i].name));
check("여러 건: 건수 요약의 합이 지역·지구 수와 같음", res && Object.values(res.summary).reduce((x, y) => x + y, 0) === zones.length, JSON.stringify(res?.summary));
check("여러 건: 판정값이 3종 안", res?.results?.every((r) => ["제한 있음", "제한 없음", "확인 필요"].includes(r.verdict)));
check("여러 건: 인용문이 모두 200자 이내", res?.results?.every((r) => r.evidence.every((x) => x.quote.length <= 200)));
check("여러 건: 문서별 기준일 5건 이상", res?.documents?.length >= 5 && res.documents.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.baseDate)));
check("여러 건: 매각 가능 여부 문구가 없음", !/매각\s*(가능|불가)/.test(all.text.replace(/매각제한|매각할 수/g, "")), "");
console.log(`  요약: ${JSON.stringify(res?.summary)}`);

// 4) 잘못된 요청
const e1 = await post({ address: "x", zones: [] });
check("지역·지구가 비어 있음: 400 INPUT_INVALID", e1.status === 400 && e1.json?.error === "INPUT_INVALID");
const e2 = await post(null, "이건 JSON이 아님");
check("JSON이 아닌 요청: 400 INPUT_INVALID", e2.status === 400 && e2.json?.error === "INPUT_INVALID");
const e3 = await post({ address: "x", zones: [{ name: "", relation: "포함" }] });
check("이름이 빈 지역·지구: 400 INPUT_INVALID", e3.status === 400);
const e4 = await post({ address: "x", zones: Array.from({ length: 101 }, () => ({ name: "가", relation: "포함" })) });
check("101건: 400 INPUT_INVALID", e4.status === 400);
// 5) 서명 토큰 확인 (조회 API가 서명하지 않은 목록은 판정하지 않는다)
const sample = { address: "대전광역시 서구 둔산동 1000", zones: [{ name: "개발제한구역", relation: "포함" }] };
const noToken = await fetch(`${base}/api/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sample, token: "" }) }).then(async (r) => ({ status: r.status, json: await r.json() }));
check("토큰이 비어 있음: 400 INPUT_INVALID", noToken.status === 400 && noToken.json?.error === "INPUT_INVALID", JSON.stringify(noToken));
const noTokenField = await fetch(`${base}/api/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sample) }).then((r) => r.status);
check("토큰 항목이 아예 없음: 400", noTokenField === 400, String(noTokenField));
const forged = await fetch(`${base}/api/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sample, token: "1.AAAA" }) }).then((r) => r.status);
check("꾸며 낸 토큰: 400", forged === 400, String(forged));
const otherZones = { ...sample, zones: [{ name: "상수원보호구역", relation: "포함" }] };
const swapped = await fetch(`${base}/api/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...otherZones, token: tokenFor(sample.address, sample.zones) }) }).then((r) => r.status);
check("다른 목록에 쓴 토큰(지역·지구 바꿔치기): 400", swapped === 400, String(swapped));
const expired = await fetch(`${base}/api/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sample, token: tokenFor(sample.address, sample.zones, Math.floor(Date.now() / 1000) - 3600) }) }).then((r) => r.status);
check("30분이 지난 토큰: 400", expired === 400, String(expired));
const crossSite = await fetch(`${base}/api/check`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example.com" }, body: JSON.stringify({ ...sample, token: tokenFor(sample.address, sample.zones) }) }).then((r) => r.status);
check("다른 사이트에서 온 요청(Origin 다름): 403", crossSite === 403, String(crossSite));

const g = await fetch(`${base}/api/check`);
check("GET 요청: 405", g.status === 405, String(g.status));

// 5) 키가 응답에 새지 않는지
check("모든 응답에 API 키가 들어 있지 않음", keys.length > 0 && allText.every((t) => keys.every((k) => !t.includes(k))));

console.log(failed === 0 ? "\n통과: 모든 확인이 기대대로 나왔습니다." : `\n실패: ${failed}개가 기대와 다릅니다.`);
process.exitCode = failed === 0 ? 0 : 1;
