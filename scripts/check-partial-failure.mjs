// "판정 서비스(OpenAI)가 일부 또는 전부 실패할 때" 판정 API가 어떻게 동작하는지 확인하는 스크립트 (DESIGN.md 4.2, 6장).
// 반드시 서버를 "틀린 OpenAI 키"로 켜고, 이 스크립트도 같은 틀린 키로 실행해야 한다 (서명 토큰이 키로 만들어지기 때문).
//   1) 서버:  OPENAI_API_KEY=sk-BAD-FOR-TEST npm run dev -- -p 3100
//   2) 시험:  OPENAI_API_KEY=sk-BAD-FOR-TEST node --env-file=.env scripts/check-partial-failure.mjs [서버 주소]
import { deriveSecret, signLookup } from "../lib/token.ts";

const base = process.argv[2] ?? "http://localhost:3100";
const secret = deriveSecret([(process.env.APP_SECRET ?? "").trim(), (process.env.OPENAI_API_KEY ?? "").trim(), (process.env.VWORLD_API_KEY ?? "").trim()]);
const address = "대전광역시 서구 둔산동 1000";

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` → ${detail}` : ""}`);
};
async function post(zones) {
  const r = await fetch(`${base}/api/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, zones, token: signLookup(secret, address, zones, Math.floor(Date.now() / 1000)) }), signal: AbortSignal.timeout(120000) });
  return { status: r.status, json: await r.json() };
}
const z = (name, relation = "포함") => ({ name, relation });

// A) AI가 필요한 1건만 실패 → 나머지는 살아 있다
const a = await post([z("준주거지역"), z("소로3류(폭 8m 미만)", "저촉"), z("개발제한구역")]);
const ar = a.json.results ?? [];
check("일부만 실패: 200 (전체 오류가 아님)", a.status === 200 && a.json.ok === true, `${a.status} ${JSON.stringify(a.json).slice(0, 120)}`);
check("일부만 실패: incomplete = 1", a.json.incomplete === 1, String(a.json.incomplete));
check("일부만 실패: 규칙으로 정한 항목은 그대로 (준주거지역 제한 없음)", ar[0]?.verdict === "제한 없음");
check("일부만 실패: 저촉 항목도 그대로 (확인 필요 + 제4조제1항제2호 근거)", ar[1]?.verdict === "확인 필요" && ar[1].evidence.some((e) => e.id === "gijun-4-2"));
check("일부만 실패: 실패한 항목만 확인 필요 + 판정 서비스 오류 이유", ar[2]?.verdict === "확인 필요" && /판정 서비스 오류/.test(ar[2].reason), ar[2]?.reason);
check("일부만 실패: 요약 합이 3건", Object.values(a.json.summary ?? {}).reduce((x, y) => x + y, 0) === 3);

// B) AI가 필요한 지역·지구가 전부 실패 → 전체 오류
const b = await post([z("개발제한구역")]);
check("AI가 필요한 1건뿐이고 실패: 502 CHECK_ERROR", b.status === 502 && b.json.error === "CHECK_ERROR", JSON.stringify(b));
const c = await post([z("개발제한구역"), z("상수원보호구역")]);
check("모든 지역·지구가 AI 필요 + 전부 실패: 502 CHECK_ERROR", c.status === 502 && c.json.error === "CHECK_ERROR", JSON.stringify(c));

// C) AI 호출 상한(30건): 35건이 AI 대상이어도 30건까지만 부른다
const many = Array.from({ length: 35 }, (_, i) => z(`개발제한구역 ${i + 1}`));
const d = await post([...many, z("준주거지역")]);
const dr = d.json.results ?? [];
const capped = dr.filter((r) => /건수를 넘어/.test(r.reason)).length;
const failedAi = dr.filter((r) => /판정 서비스 오류/.test(r.reason)).length;
check("AI 상한: 200 + 결과 36건", d.status === 200 && dr.length === 36, `${d.status} ${dr.length}`);
check("AI 상한: 30건은 AI 호출을 시도했다가 실패", failedAi === 30, String(failedAi));
check("AI 상한: 나머지 5건은 AI를 부르지 않고 확인 필요", capped === 5, String(capped));
check("AI 상한: 규칙 판정 항목(준주거지역)은 그대로", dr[35]?.verdict === "제한 없음");
check("AI 상한: incomplete = 35", d.json.incomplete === 35, String(d.json.incomplete));

console.log(failed === 0 ? "\n통과: 모든 확인이 기대대로 나왔습니다." : `\n실패: ${failed}개가 기대와 다릅니다.`);
process.exitCode = failed === 0 ? 0 : 1;
