// 공개 API 남용 방지 장치 모음 (서버에서만 쓴다): 호출 횟수 제한, 같은 사이트 확인, 조회 결과 서명 토큰.
// 기준: DESIGN.md 7장 보안. 로그인이 없는 서비스라서 "누구나 호출할 수 있는 주소"가 되므로 비용·사용량이 새지 않게 막는다.
import "server-only";
import { createLimiter, type LimitResult } from "@/lib/rateLimit";
import { deriveSecret, signLookup, verifyLookup } from "@/lib/token";
import { getRequiredKey } from "@/lib/server/env";
import type { Zone } from "@/lib/types";

const TOKEN_MAX_AGE_SEC = 30 * 60; // 조회한 지 30분이 지난 결과는 다시 조회해야 판정할 수 있다

// ---------- 호출 횟수 제한 ----------

const limiters = {
  landUse: createLimiter(20, 60_000), // 조회 API: 1분에 20번
  landUseAnySido: createLimiter(4, 60_000), // 시·도를 생략한 조회: 브이월드를 시·도마다 부르므로 1분에 4번
  check: createLimiter(10, 60_000), // 판정 API(OpenAI 비용이 드는 쪽): 1분에 10번
};

// 요청한 사람의 주소. Vercel 등은 x-forwarded-for에 실제 주소를 넣어 준다.
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

// 개발 중(npm run dev)에는 시험을 위해 제한하지 않고, 배포·운영(production)에서만 적용한다.
export function checkRate(request: Request, bucket: keyof typeof limiters): LimitResult {
  if (process.env.NODE_ENV !== "production") return { ok: true };
  return limiters[bucket](clientIp(request));
}

// ---------- 같은 사이트에서 온 요청인지 ----------

// 브라우저는 다른 사이트에서 부른 요청에 Origin을 붙인다. 우리 사이트와 다르면 거절한다. (Origin이 없는 직접 호출은 통과 — 이것만으로 완전한 방어는 아니다)
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// ---------- 조회 결과 서명 토큰 ----------

// 서명 키: 앱 비밀 값(APP_SECRET, 선택)과 두 API 키를 섞어 만든다. 새로 설정할 값이 없어도 되고, 키가 바뀌면 이전 토큰은 자동으로 무효가 된다.
function secret(): string {
  return deriveSecret([(process.env.APP_SECRET ?? "").trim(), getRequiredKey("OPENAI_API_KEY"), getRequiredKey("VWORLD_API_KEY")]);
}

export function issueLookupToken(address: string, zones: Zone[]): string {
  return signLookup(secret(), address, zones, Math.floor(Date.now() / 1000));
}

export function isLookupTokenValid(token: unknown, address: string, zones: Zone[]): boolean {
  return verifyLookup(secret(), token, address, zones, Math.floor(Date.now() / 1000), TOKEN_MAX_AGE_SEC);
}
