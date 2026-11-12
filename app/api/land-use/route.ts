// 조회 API: POST /api/land-use
// 지번을 받아 토지이용계획의 지역·지구 목록을 돌려준다. (DESIGN.md 4.2)
// 서버에서 지번 형식을 다시 검사하고, 브이월드 키는 이 서버 코드 안에서만 쓴다.
// 공개 서비스라서 호출 횟수 제한·같은 사이트 확인을 거치고, 결과에는 판정 API가 확인할 서명 토큰을 붙인다. (DESIGN.md 7장)
import { checkParcel } from "@/lib/parcel";
import { checkRate, isSameOrigin, issueLookupToken } from "@/lib/server/guard";
import { lawsForZones } from "@/lib/server/zoneLaws";
import { AmbiguousSidoError, LandUseError, lookupLandUse } from "@/lib/server/landUse";
import { ERROR_MESSAGES, type ApiError, type ErrorCode, type LandUseResponse } from "@/lib/types";

// 이 함수가 최대 몇 초까지 실행될 수 있는지 (새 호출 마감 18초 + 호출 1번 최대 10초 = 28초보다 길게). Vercel 같은 환경에서 지켜진다.
export const maxDuration = 30;

function errorResponse(error: ErrorCode, status: number, message?: string, headers?: HeadersInit) {
  const body: ApiError = { ok: false, error, message: message ?? ERROR_MESSAGES[error] };
  return Response.json(body satisfies LandUseResponse, { status, headers });
}

// 한국 시간(+09:00)으로 표시한 ISO 8601 시각. 예: 2026-11-12T14:03:00+09:00
function nowInKorea(): string {
  const shifted = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, "+09:00");
}

export async function POST(request: Request) {
  // 0) 남용 방지: 다른 사이트에서 온 요청과 너무 잦은 호출은 받지 않는다
  if (!isSameOrigin(request)) return errorResponse("INPUT_INVALID", 403, "입력 오류: 허용되지 않은 요청입니다.");
  const rate = checkRate(request, "landUse");
  if (!rate.ok) {
    return errorResponse("SERVICE_ERROR", 429, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", { "Retry-After": String(rate.retryAfterSec) });
  }

  // 1) 요청 읽기와 형식 재검사 (화면에서 한 검사를 서버에서 한 번 더 한다)
  let parcel: unknown;
  try {
    parcel = ((await request.json()) as { parcel?: unknown } | null)?.parcel;
  } catch {
    return errorResponse("INPUT_INVALID", 400);
  }
  if (typeof parcel !== "string") return errorResponse("INPUT_INVALID", 400);

  const checked = checkParcel(parcel);
  if (!checked.ok) return errorResponse("INPUT_INVALID", 400, `입력 오류: ${checked.message}`);

  // 시·도를 생략한 조회는 브이월드를 시·도마다 부르므로 별도로 더 엄격하게 제한한다
  if (!checked.parts.sido) {
    const anySido = checkRate(request, "landUseAnySido");
    if (!anySido.ok) {
      return errorResponse("SERVICE_ERROR", 429, "시·도를 생략한 조회가 너무 많습니다. 시·도를 함께 입력하거나 잠시 후 다시 시도해 주세요.", { "Retry-After": String(anySido.retryAfterSec) });
    }
  }

  // 2) 조회 (사용자가 요청을 취소하면 브이월드 호출도 함께 멈춘다)
  try {
    const { address, zones } = await lookupLandUse(checked.parts, checked.normalized, request.signal);
    const body: LandUseResponse = { ok: true, address, queriedAt: nowInKorea(), zones, token: issueLookupToken(address, zones), laws: lawsForZones(zones.map((zone) => zone.name)) };
    return Response.json(body);
  } catch (error) {
    // 같은 지번이 여러 시·도에 있으면 시·도를 고르게 한다 (오류가 아니므로 200으로 돌려준다)
    if (error instanceof AmbiguousSidoError) {
      const body: LandUseResponse = {
        ok: false,
        error: "CHOOSE_SIDO",
        message: "같은 지번이 여러 시·도에 있습니다. 시·도를 선택해 주세요.",
        choices: error.choices,
      };
      return Response.json(body);
    }
    if (error instanceof LandUseError && error.code === "NOT_FOUND") {
      // 안내 문구는 화면용이다. 지번 외의 정보는 담지 않는다.
      return errorResponse("NOT_FOUND", 404, `조회 결과 없음: ${error.message}`);
    }
    // 서비스 오류: 원인은 서버 로그에 종류만 남기고(키·주소 제외), 화면에는 고정 안내만 보낸다.
    console.error("[land-use] 조회 실패:", error instanceof LandUseError ? error.message : "알 수 없는 오류");
    return errorResponse("SERVICE_ERROR", 502);
  }
}
