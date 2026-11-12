// 조회 결과 서명 토큰: "서버가 실제로 조회해서 준 지역·지구 목록"만 판정 API가 받아 주게 하는 장치.
// 로그인이 없는 공개 서비스에서 누군가 임의의 지역·지구 이름을 수십~수백 건 보내 OpenAI 비용을 쓰게 만드는 일을 막는다.
// (서버가 비밀 값으로 서명하므로 브라우저에서는 만들 수 없고, 목록이 한 글자라도 다르면 검증에 실패한다.)
// 순수 계산만 한다 (비밀 값은 인자로 받는다). 서버 전용 래퍼는 lib/server/guard.ts. 화면 코드에서는 쓰지 않는다.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Zone } from "./types";

// 비밀 값 만들기: 여러 비밀 조각(예: 앱 비밀 값, API 키들)을 섞어 하나의 서명 키로 쓴다. 조각 자체는 밖으로 나가지 않는다.
export function deriveSecret(parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

// 서명 대상 글자: 주소와 지역·지구(이름·표기)를 순서까지 포함해 한 줄로 만든다.
function canonical(address: string, zones: Zone[]): string {
  return JSON.stringify([address, zones.map((zone) => [zone.name, zone.relation])]);
}

function mac(secret: string, issuedAt: number, address: string, zones: Zone[]): string {
  return createHmac("sha256", secret).update(`${issuedAt}.${canonical(address, zones)}`).digest("base64url");
}

// 토큰 = "발급 시각(초).서명"
export function signLookup(secret: string, address: string, zones: Zone[], nowSec: number): string {
  return `${nowSec}.${mac(secret, nowSec, address, zones)}`;
}

export function verifyLookup(secret: string, token: unknown, address: string, zones: Zone[], nowSec: number, maxAgeSec: number): boolean {
  if (typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const issuedAt = Number(token.slice(0, dot));
  if (!Number.isInteger(issuedAt) || issuedAt > nowSec + 60 || nowSec - issuedAt > maxAgeSec) return false; // 만료되었거나 미래 시각
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(mac(secret, issuedAt, address, zones));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
