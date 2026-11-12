// 조회 API(/api/land-use)를 실제로 호출해 확인하는 스크립트. 개발 서버가 켜져 있어야 한다.
// 사용법: node --env-file=.env scripts/check-land-use.mjs [서버 주소, 기본 http://localhost:3100]
// 실제 브이월드를 호출하므로 .env에 VWORLD_API_KEY가 있어야 하고, 키 값은 어디에도 출력하지 않는다.
const base = process.argv[2] ?? "http://localhost:3100";
const key = process.env.VWORLD_API_KEY ?? "";

let failed = 0;
const allResponses = [];

async function post(parcel, rawBody) {
  const response = await fetch(`${base}/api/land-use`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify({ parcel }),
  });
  const text = await response.text();
  allResponses.push(text);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: response.status, json, text };
}

function check(name, condition, detail = "") {
  if (!condition) failed += 1;
  console.log(`${condition ? "✓" : "✗"} ${name}${!condition && detail ? ` → ${detail}` : ""}`);
}

// 1) 정상 조회
const ok = await post("대전광역시 서구 둔산동 1000");
check("정상 지번: 200 + ok", ok.status === 200 && ok.json?.ok === true, `${ok.status} ${ok.text.slice(0, 120)}`);
const zones = ok.json?.zones ?? [];
check("정상 지번: 공공 API가 준 전체 주소를 돌려줌", /둔산동 1000/.test(ok.json?.address ?? ""), ok.json?.address);
check("정상 지번: 조회 시각이 한국 시간(+09:00) 형식", /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+09:00$/.test(ok.json?.queriedAt ?? ""), ok.json?.queriedAt);
check("정상 지번: 지역·지구가 1건 이상", zones.length > 0, String(zones.length));
check("정상 지번: 지역·지구 이름이 중복 없이 합쳐짐", new Set(zones.map((z) => z.name)).size === zones.length);
check("정상 지번: 표기는 포함/접함/저촉 중 하나", zones.every((z) => ["포함", "접함", "저촉"].includes(z.relation)), JSON.stringify(zones.map((z) => z.relation)));
check("정상 지번: 같은 이름이 여러 줄이면 저촉이 남음(보행자전용도로)", zones.find((z) => z.name === "보행자전용도로")?.relation === "저촉");
console.log(`  (지역·지구 ${zones.length}건: ${zones.map((z) => `${z.name}(${z.relation})`).join(", ")})`);

// 2) 산 번지
const san = await post("충청남도 공주시 우성면 동대리 산 1-1");
check("산 번지 정상: 200 + 주소에 산 포함", san.status === 200 && /산 1-1/.test(san.json?.address ?? ""), `${san.status} ${san.json?.address ?? san.text.slice(0, 120)}`);

// 3) 입력과 다른 필지로 대신 답하는 경우는 막는다
const swapped = await post("충청남도 공주시 우성면 동대리 산 12-3");
check("입력과 다른 필지(산→일반): 404 NOT_FOUND + 가까운 필지 안내", swapped.status === 404 && swapped.json?.error === "NOT_FOUND" && /가장 가까운 필지/.test(swapped.json?.message ?? ""), `${swapped.status} ${swapped.text.slice(0, 160)}`);
const partial = await post("충청남도 공주시 우성면 동대리 산 1");
check("부번이 다른 필지(산 1 → 산 1-1): 404 NOT_FOUND", partial.status === 404 && partial.json?.error === "NOT_FOUND", `${partial.status} ${partial.text.slice(0, 160)}`);

// 4) 없는 지번
const none = await post("대전광역시 서구 둔산동 9999");
check("없는 지번: 404 NOT_FOUND", none.status === 404 && none.json?.error === "NOT_FOUND", `${none.status} ${none.text.slice(0, 160)}`);

// 5) 형식 오류 (브이월드를 부르기 전에 서버에서 막는다)
const badFormat = await post("충남 공주시 우성면 동대리 12");
check("약칭 시·도: 400 INPUT_INVALID", badFormat.status === 400 && badFormat.json?.error === "INPUT_INVALID", `${badFormat.status} ${badFormat.text.slice(0, 120)}`);
const road = await post("서울특별시 강남구 테헤란로 152");
check("도로명주소: 400 INPUT_INVALID", road.status === 400 && road.json?.error === "INPUT_INVALID");
const empty = await post("");
check("빈 입력: 400 INPUT_INVALID", empty.status === 400 && empty.json?.error === "INPUT_INVALID");
const noJson = await post(null, "이건 JSON이 아님");
check("JSON이 아닌 요청: 400 INPUT_INVALID", noJson.status === 400 && noJson.json?.error === "INPUT_INVALID");
const wrongType = await post(null, JSON.stringify({ parcel: 123 }));
check("지번이 글자가 아님: 400 INPUT_INVALID", wrongType.status === 400 && wrongType.json?.error === "INPUT_INVALID");

// 6) 허용하지 않는 방식
const get = await fetch(`${base}/api/land-use`);
check("GET 요청: 405", get.status === 405, String(get.status));

// 7) 키가 응답에 새지 않는지
check("모든 응답에 API 키가 들어 있지 않음", key.length > 0 && allResponses.every((t) => !t.includes(key)));

console.log(failed === 0 ? "\n통과: 모든 확인이 기대대로 나왔습니다." : `\n실패: ${failed}개가 기대와 다릅니다.`);
process.exitCode = failed === 0 ? 0 : 1;
