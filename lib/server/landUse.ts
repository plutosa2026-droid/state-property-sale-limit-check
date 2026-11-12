// 토지이용계획 조회: 지번 → 필지 고유번호(PNU) → 지역·지구 목록 (브이월드 오픈 API)
// 서버에서만 쓴다. API 키는 lib/server/env.ts를 통해 .env에서 읽고, 로그·응답에 절대 남기지 않는다.
// 기준: DESIGN.md 4.1~4.2, PRD.md Must ① 규칙 2~5
import "server-only";
import { getRequiredKey } from "@/lib/server/env";
import { formatParcel, type ParcelParts } from "@/lib/parcel";
import { expectedLotPart, matchesInput, uniqueByPnu } from "@/lib/parcelMatch";
import type { Zone } from "@/lib/types";

const ADDRESS_URL = "https://api.vworld.kr/req/address";
const LAND_USE_URL = "https://api.vworld.kr/ned/data/getLandUseAttr";
// 브이월드 키는 발급 때 등록한 서비스 주소(도메인)와 같은 값을 함께 보내야 열린다.
// 개발 중에는 localhost, 배포하면 Vercel 주소를 등록하고 .env / Vercel 환경변수의 VWORLD_DOMAIN에 같은 값을 넣는다.
const vworldDomain = () => (process.env.VWORLD_DOMAIN ?? "").trim() || "localhost";
const TIMEOUT_MS = 10_000; // 브이월드 한 번 호출의 제한 시간
// 조회 전체(주소 찾기 + 여러 쪽 받기)의 "새 호출을 시작할 수 있는" 마감 시간.
// 마감 직전에 시작한 호출도 최대 10초(TIMEOUT_MS)까지 걸리므로, 18 + 10 = 28초가 조회 API의 maxDuration(30초) 안에 들어오게 잡는다.
const OVERALL_MS = 18_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 10; // 지역·지구를 빠뜨리지 않으려고 여러 쪽을 모두 받되, 무한 반복은 막는다

// 이 모듈이 던지는 오류. 화면에는 code에 해당하는 안내만 보여 준다.
export class LandUseError extends Error {
  constructor(
    public code: "NOT_FOUND" | "SERVICE_ERROR",
    message: string,
  ) {
    super(message);
  }
}

export type LandUseLookup = {
  address: string; // 공공 API가 돌려준 전체 주소 (입력값이 아니다)
  pnu: string;
  zones: Zone[];
};

// ---------- 작은 도구 ----------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// 브이월드를 부른다. 연결 실패·시간 초과·JSON이 아닌 응답은 모두 SERVICE_ERROR로 바꾼다.
// (오류 내용에 요청 주소(=키)가 섞일 수 있어 원인을 그대로 던지지 않는다.)
// signal은 사용자가 요청을 취소했을 때(브라우저가 연결을 끊었을 때) 호출도 함께 멈추기 위한 것이다.
async function callVworld(url: URL, signal?: AbortSignal): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: "no-store" });
  } catch {
    throw new LandUseError("SERVICE_ERROR", "브이월드 연결 실패 또는 시간 초과");
  }
  if (!response.ok) throw new LandUseError("SERVICE_ERROR", `브이월드 응답 오류(HTTP ${response.status})`);
  try {
    const json = asRecord(await response.json());
    if (!json) throw new Error("not an object");
    return json;
  } catch {
    throw new LandUseError("SERVICE_ERROR", "브이월드 응답을 읽을 수 없음");
  }
}

// ---------- 1단계: 지번 → 필지 고유번호 ----------

// 브이월드 주소 검색 한 번. 찾지 못하면 null, 서비스 문제는 던진다.
async function requestAddress(addressText: string, signal?: AbortSignal): Promise<{ pnu: string; address: string } | null> {
  const url = new URL(ADDRESS_URL);
  const params = {
    service: "address",
    request: "getCoord",
    version: "2.0",
    crs: "epsg:4326",
    address: addressText,
    refine: "true",
    simple: "false",
    format: "json",
    type: "parcel",
    domain: vworldDomain(),
    key: getRequiredKey("VWORLD_API_KEY"),
  };
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

  const body = asRecord((await callVworld(url, signal)).response);
  const status = asString(body?.status);
  if (status === "NOT_FOUND") return null;
  if (status !== "OK") throw new LandUseError("SERVICE_ERROR", `브이월드 주소 조회 실패(${status || "응답 없음"})`);

  const refined = asRecord(body?.refined);
  const pnu = asString(asRecord(refined?.structure)?.level4LC);
  const address = asString(refined?.text);
  if (!/^\d{19}$/.test(pnu) || !address) {
    throw new LandUseError("SERVICE_ERROR", "브이월드가 필지 고유번호를 돌려주지 않았습니다.");
  }
  return { pnu, address };
}

async function findParcel(parts: ParcelParts, normalized: string, signal?: AbortSignal): Promise<{ pnu: string; address: string }> {
  const found = await requestAddress(normalized, signal);
  if (!found) throw new LandUseError("NOT_FOUND", "입력한 지번에 해당하는 필지를 찾지 못했습니다.");
  const { pnu, address } = found;

  // 브이월드는 없는 지번이면 비슷한 필지로 대신 답하기도 한다(예: "산 12-3" → 산이 아닌 "12-3").
  // 엉뚱한 필지로 판정하지 않도록, 입력한 산·본번·부번과 다르면 조회하지 않고 가장 가까운 필지를 알려 준다.
  if (pnu.slice(10) !== expectedLotPart(parts)) {
    throw new LandUseError(
      "NOT_FOUND",
      `입력한 지번과 같은 필지를 찾지 못했습니다. 가장 가까운 필지는 "${address}"입니다. 지번을 다시 확인해 주세요.`,
    );
  }
  return { pnu, address };
}

// ---------- 2단계: 필지 고유번호 → 지역·지구 ----------

// 같은 지역·지구가 여러 줄로 나오면 하나로 합치고, 더 엄격한 표기를 남긴다 (저촉 > 접함 > 포함).
// 표기가 비었거나 모르는 값은 가장 엄격하게 다룬다 → 판정 단계에서 "확인 필요"가 된다.
const STRICTNESS: Record<string, number> = { 포함: 1, 접함: 2, 저촉: 3 };
const UNKNOWN_STRICTNESS = 99;
const strictnessOf = (relation: string) => STRICTNESS[relation] ?? UNKNOWN_STRICTNESS;

function mergeZones(rows: Zone[]): Zone[] {
  const merged = new Map<string, Zone>();
  for (const row of rows) {
    const found = merged.get(row.name);
    if (!found || strictnessOf(row.relation) > strictnessOf(found.relation)) merged.set(row.name, row);
  }
  return [...merged.values()];
}

async function findZones(pnu: string, deadlineAt: number, signal?: AbortSignal): Promise<Zone[]> {
  const key = getRequiredKey("VWORLD_API_KEY");
  const rows: Zone[] = [];
  let total = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // 전체 제한 시간을 넘기면 중단한다 (지역·지구를 일부만 받은 채로 결과를 내지 않는다)
    if (Date.now() > deadlineAt) throw new LandUseError("SERVICE_ERROR", "토지이용계획 조회 시간 초과");
    const url = new URL(LAND_USE_URL);
    const params = { pnu, format: "json", numOfRows: String(PAGE_SIZE), pageNo: String(page), domain: vworldDomain(), key };
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

    const json = await callVworld(url, signal);
    const body = asRecord(json.landUses) ?? asRecord(json.response);
    // 인증키 오류 등은 HTTP 200으로 resultCode에 담겨 온다.
    const resultCode = asString(body?.resultCode);
    if (resultCode) throw new LandUseError("SERVICE_ERROR", `브이월드 토지이용계획 조회 실패(${resultCode})`);

    total = Number(asString(body?.totalCount)) || 0;
    const fields: unknown[] = body && Array.isArray(body.field) ? body.field : [];
    for (const item of fields) {
      const record = asRecord(item);
      const name = asString(record?.prposAreaDstrcCodeNm).trim();
      if (name) rows.push({ name, relation: asString(record?.cnflcAtNm).trim() });
    }
    if (rows.length >= total || fields.length === 0) break;
  }

  if (total === 0 || rows.length === 0) {
    throw new LandUseError("NOT_FOUND", "이 필지의 토지이용계획 정보를 찾지 못했습니다.");
  }
  // 받은 건수가 전체보다 적으면 빠진 지역·지구가 있다는 뜻이므로 결과를 내지 않는다 (짐작해서 채우지 않기).
  if (rows.length < total) {
    throw new LandUseError("SERVICE_ERROR", "토지이용계획 목록을 끝까지 받지 못했습니다.");
  }
  return mergeZones(rows);
}

// ---------- 공개 함수 ----------

// ---------- 시·도를 생략한 조회 ----------

// 시·도를 생략하면 아래 시·도를 하나씩 붙여 찾는다. (세종은 시·군·구가 없어 시·도를 생략할 수 없으므로 뺀다)
const SIDO_TO_TRY = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시", "경기도",
  "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

// 같은 이름의 지번이 여러 시·도에 있어 사용자가 시·도를 골라야 할 때 던진다.
export class AmbiguousSidoError extends Error {
  constructor(public choices: { sido: string; address: string }[]) {
    super("같은 지번이 여러 시·도에 있습니다.");
  }
}

async function findParcelAnySido(parts: ParcelParts, signal?: AbortSignal): Promise<{ pnu: string; address: string }> {
  const rest = formatParcel(parts);
  const settled = await Promise.allSettled(SIDO_TO_TRY.map((sido) => requestAddress(`${sido} ${rest}`, signal)));
  // 한 곳이라도 서비스 문제로 못 찾았으면 "하나뿐"이라고 단정할 수 없으므로 서비스 오류로 돌려준다.
  if (settled.some((item) => item.status === "rejected")) {
    throw new LandUseError("SERVICE_ERROR", "시·도별 주소 조회 중 일부가 실패했습니다.");
  }
  const found = uniqueByPnu(
    settled.flatMap((item) => (item.status === "fulfilled" && item.value && matchesInput(parts, item.value) ? [item.value] : [])),
  );
  if (found.length === 0) {
    throw new LandUseError("NOT_FOUND", "입력한 지번에 해당하는 필지를 어느 시·도에서도 찾지 못했습니다. 시·군·구와 읍·면·동, 번지를 다시 확인해 주세요.");
  }
  if (found.length > 1) {
    throw new AmbiguousSidoError(found.map((row) => ({ sido: row.address.split(" ")[0], address: row.address })));
  }
  return found[0];
}

export async function lookupLandUse(parts: ParcelParts, normalized: string, signal?: AbortSignal): Promise<LandUseLookup> {
  const deadlineAt = Date.now() + OVERALL_MS;
  const { pnu, address } = parts.sido ? await findParcel(parts, normalized, signal) : await findParcelAnySido(parts, signal);
  const zones = await findZones(pnu, deadlineAt, signal);
  return { address, pnu, zones };
}
