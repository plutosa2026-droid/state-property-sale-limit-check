// 판정 API: POST /api/check
// 조회된 지역·지구 목록을 받아 지역·지구별 매각제한 판정(+근거)과 건수 요약을 돌려준다. (DESIGN.md 4.2)
// 요청에는 지번이 아니라 지역·지구 이름과 표기만 쓰고, OpenAI 키는 이 서버 코드 안에서만 쓴다.
// 공개 서비스라서 호출 횟수 제한·같은 사이트 확인을 거치고, 조회 API가 준 서명 토큰이 맞는 목록만 판정한다. (DESIGN.md 7장)
import { checkRate, isLookupTokenValid, isSameOrigin } from "@/lib/server/guard";
import { judgeZones, summarize } from "@/lib/server/judge";
import { getDocumentInfos } from "@/lib/server/rules";
import { lawsForZones, ZONE_LAWS_DOCUMENT } from "@/lib/server/zoneLaws";
import { ERROR_MESSAGES, type ApiError, type CheckResponse, type ErrorCode, type Zone } from "@/lib/types";

// 이 함수가 최대 몇 초까지 실행될 수 있는지 (새 AI 호출 마감 35초 + 호출 1번 최대 20초 = 55초보다 길게). Vercel 같은 환경에서 지켜진다.
export const maxDuration = 60;

const MAX_ZONES = 100;
const MAX_NAME_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 200;

function errorResponse(error: ErrorCode, status: number, message?: string, headers?: HeadersInit) {
  const body: ApiError = { ok: false, error, message: message ?? ERROR_MESSAGES[error] };
  return Response.json(body satisfies CheckResponse, { status, headers });
}

// 요청 본문에서 주소와 지역·지구 목록을 꺼내고 모양을 검사한다. 맞지 않으면 null.
function readRequest(body: unknown): { address: string; zones: Zone[]; token: unknown } | null {
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const address = typeof record?.address === "string" ? record.address : "";
  const zones = record?.zones;
  if (!address || address.length > MAX_ADDRESS_LENGTH) return null;
  if (!Array.isArray(zones) || zones.length === 0 || zones.length > MAX_ZONES) return null;
  const result: Zone[] = [];
  for (const item of zones) {
    const entry = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : null;
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    const relation = typeof entry?.relation === "string" ? entry.relation.trim() : "";
    if (!name || name.length > MAX_NAME_LENGTH || relation.length > 20) return null;
    result.push({ name, relation });
  }
  return { address, zones: result, token: record?.token };
}

export async function POST(request: Request) {
  // 0) 남용 방지: 다른 사이트에서 온 요청과 너무 잦은 호출은 받지 않는다
  if (!isSameOrigin(request)) return errorResponse("INPUT_INVALID", 403, "입력 오류: 허용되지 않은 요청입니다.");
  const rate = checkRate(request, "check");
  if (!rate.ok) {
    return errorResponse("CHECK_ERROR", 429, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", { "Retry-After": String(rate.retryAfterSec) });
  }

  // 1) 요청 읽기와 검사
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INPUT_INVALID", 400, "입력 오류: 요청 형식이 올바르지 않습니다.");
  }
  const input = readRequest(body);
  if (!input) return errorResponse("INPUT_INVALID", 400, "입력 오류: 주소와 지역·지구 목록(1~100건)이 올바르지 않습니다.");

  // 2) 서버가 실제로 조회해서 준 목록인지 서명으로 확인한다 (임의의 목록으로 AI를 호출하지 못하게 함)
  if (!isLookupTokenValid(input.token, input.address, input.zones)) {
    return errorResponse("INPUT_INVALID", 400, "입력 오류: 조회 결과가 만료되었거나 맞지 않습니다. 지번을 다시 조회해 주세요.");
  }

  // 3) 판정 (사용자가 요청을 취소하면 AI 호출도 함께 멈춘다)
  try {
    const { results, aiAttempts, aiFailures } = await judgeZones(input.zones, request.signal);

    // 판정 서비스(AI) 전체 장애: 모든 지역·지구가 AI 판정이 필요했는데 전부 실패한 경우에만 오류로 돌려준다.
    // 일부만 실패하면 그 항목만 "확인 필요"로 채워져 있으므로 나머지 결과는 살려서 돌려준다 (DESIGN.md 4.2, 6장).
    if (aiAttempts > 0 && aiFailures === aiAttempts && aiAttempts === results.length) return errorResponse("CHECK_ERROR", 502);

    // 지역·지구별 근거 법률(표시용)을 결과에 덧붙인다
    const zoneLaws = lawsForZones(results.map((result) => result.zone));
    const response: CheckResponse = {
      ok: true,
      documents: [
        ...getDocumentInfos(results.flatMap((result) => result.evidence.map((item) => item.source))),
        // 지역·지구별 근거 법률(표시용)을 보여 줄 때는 그 표(토지이용규제 기본법 별표)의 기준일도 함께 보여 준다
        ...(Object.keys(zoneLaws).length > 0
          ? [{ name: "토지이용규제 기본법 별표(지역·지구별 근거 법률)", baseDate: ZONE_LAWS_DOCUMENT.baseDate, basis: ZONE_LAWS_DOCUMENT.basis }]
          : []),
      ],
      summary: summarize(results),
      results: results.map((result) => ({ ...result, ...(zoneLaws[result.zone] ? { laws: zoneLaws[result.zone] } : {}) })),
      ...(aiFailures > 0 ? { incomplete: aiFailures } : {}),
    };
    return Response.json(response);
  } catch (error) {
    console.error("[check] 판정 실패:", error instanceof Error ? error.name : "알 수 없는 오류");
    return errorResponse("CHECK_ERROR", 502);
  }
}
