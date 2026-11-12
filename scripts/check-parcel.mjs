// 지번 형식 검사(lib/parcel.ts)를 사례로 확인하는 스크립트.
// 사용법: node scripts/check-parcel.mjs   (모두 맞으면 "통과", 하나라도 틀리면 목록을 보여 주고 종료 코드 1)
import { checkParcel } from "../lib/parcel.ts";

// [입력, 기대 결과("OK" 또는 실패 이유), 기대 정리 결과(성공일 때만)]
const cases = [
  // ----- 정상 -----
  ["충청남도 공주시 우성면 동대리 산 12-3", "OK", "충청남도 공주시 우성면 동대리 산 12-3"],
  // ----- 시·도 생략 (2026-11-12): 시·군·구부터 입력해도 된다 -----
  ["공주시 우성면 동대리 12", "OK", "공주시 우성면 동대리 12"],
  ["강남구 개포동 617", "OK", "강남구 개포동 617"],
  ["천안시 동남구 신부동 123-4", "OK", "천안시 동남구 신부동 123-4"],
  ["공주시 우성면 동대리 산12-3", "OK", "공주시 우성면 동대리 산 12-3"],
  ["충청남도 공주시 우성면 동대리 산12-3", "OK", "충청남도 공주시 우성면 동대리 산 12-3"],
  ["충청남도  공주시  우성면  동대리  12번지", "OK", "충청남도 공주시 우성면 동대리 12"],
  ["대전광역시 서구 둔산동 1000", "OK", "대전광역시 서구 둔산동 1000"],
  ["충청남도 천안시 동남구 신부동 123-4", "OK", "충청남도 천안시 동남구 신부동 123-4"],
  ["세종특별자치시 어진동 123", "OK", "세종특별자치시 어진동 123"],
  ["서울특별시 종로구 종로1가 1", "OK", "서울특별시 종로구 종로1가 1"],
  ["서울특별시 종로구 세종로 1-1", "OK", "서울특별시 종로구 세종로 1-1"],
  ["인천광역시 강화군 길상면 온수리 123", "OK", "인천광역시 강화군 길상면 온수리 123"],
  ["제주특별자치도 제주시 연동 253-1", "OK", "제주특별자치도 제주시 연동 253-1"],
  ["경기도 수원시 영통구 이의동 1000", "OK", "경기도 수원시 영통구 이의동 1000"],
  // ----- 거부 -----
  ["", "EMPTY"],
  ["   ", "EMPTY"],
  ["충남 공주시 우성면 동대리 12", "ABBREVIATED_SIDO"],
  ["서울시 종로구 종로1가 1", "ABBREVIATED_SIDO"],
  ["충청남도 공주시 우성로 123", "ROAD_ADDRESS"],
  ["충청남도 공주시 우성면 동대리길 5", "ROAD_ADDRESS"],
  ["서울특별시 강남구 테헤란로 152", "ROAD_ADDRESS"],
  ["서울특별시 강남구 테헤란로 152번길 3", "ROAD_ADDRESS"],
  ["충청남도 공주시 우성면 동대리", "BAD_LOT"],
  ["충청남도 공주시 우성면 동대리 abc", "INVALID_CHARS"],
  ["충청남도 공주시 우성면 동대리 0", "BAD_LOT"],
  ["충청남도 공주시 우성면 동대리 12-", "BAD_LOT"],
  ["충청남도 12", "MISSING_REGION"],
  // 시·도를 생략하면 시·군·구는 꼭 필요하다 (세종은 시·도를 써야 한다)
  ["개포동 617", "MISSING_REGION"],
  ["어진동 123", "MISSING_REGION"],
  ["아무말 12", "BAD_REGION"],
  ["서울 강남구 개포동 617", "ABBREVIATED_SIDO"],
  ["강남구 개포동", "BAD_LOT"],
  ["강남구 테헤란로 152", "ROAD_ADDRESS"],
  ["개포동 강남구 617", "BAD_REGION"],
  ["충청남도 공주시 12", "MISSING_REGION"],
  ["충청남도 우성면 동대리 12", "MISSING_REGION"],
  ["충청남도 공주시 동대리 12", "BAD_REGION"],
  ["충청남도 우성면 공주시 동대리 12", "BAD_REGION"],
  ["충청남도 천안시 동남구 서북구 신부동 1", "BAD_REGION"],
  ["충청남도 공주시 우성면 동대리 12 ; DROP", "INVALID_CHARS"],
  ["충청남도 " + "가".repeat(120), "TOO_LONG"],
];

let failed = 0;
for (const [input, expected, expectedNormalized] of cases) {
  const result = checkParcel(input);
  const actual = result.ok ? "OK" : result.reason;
  const normalizedOk = !expectedNormalized || (result.ok && result.normalized === expectedNormalized);
  if (actual !== expected || !normalizedOk) {
    failed += 1;
    console.log(`✗ "${input.slice(0, 40)}" → 기대 ${expected}${expectedNormalized ? ` / ${expectedNormalized}` : ""}, 실제 ${actual}${result.ok ? ` / ${result.normalized}` : ` / ${result.message}`}`);
  }
}

console.log(failed === 0 ? `통과: ${cases.length}개 사례가 모두 기대대로 나왔습니다.` : `실패: ${failed}/${cases.length}개가 기대와 다릅니다.`);
process.exitCode = failed === 0 ? 0 : 1;
