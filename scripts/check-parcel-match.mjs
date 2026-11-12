// 시·도를 생략한 조회의 순수 계산(lib/parcelMatch.ts)을 사례로 확인한다. 사용법: node scripts/check-parcel-match.mjs
import { checkParcel } from "../lib/parcel.ts";
import { matchesInput, uniqueByPnu } from "../lib/parcelMatch.ts";

let failed = 0;
const check = (name, ok) => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}`);
};
const parts = (text) => {
  const r = checkParcel(text);
  if (!r.ok) throw new Error(`입력이 틀림: ${text}`);
  return r.parts;
};

const gaepo = parts("강남구 개포동 617");
check("시·도를 생략하면 sido가 비어 있음", gaepo.sido === undefined);
check("정확히 같은 필지는 통과", matchesInput(gaepo, { pnu: "1168010300106170000", address: "서울특별시 강남구 개포동 617" }));
check("본번이 다르면 거절 (브이월드가 비슷한 필지로 답한 경우)", !matchesInput(gaepo, { pnu: "1168010300100010000", address: "서울특별시 강남구 개포동 1" }));
check("동 이름이 다르면 거절 (신당동 → 무학동 1 처럼 엉뚱한 동)", !matchesInput(parts("중구 신당동 1"), { pnu: "1114010100100010000", address: "서울특별시 중구 무학동 1" }));
check("동 이름이 비슷해도(중앙동 ≠ 중앙동3가) 거절", !matchesInput(parts("중구 중앙동 1"), { pnu: "2611010100100010000", address: "부산광역시 중구 중앙동3가 1" }));
check("산 여부가 다르면 거절", !matchesInput(parts("강남구 개포동 산 617"), { pnu: "1168010300106170000", address: "서울특별시 강남구 개포동 617" }));
check("구가 나뉜 시(포항시 북구)에서 '북구'만 입력해도 통과", matchesInput(parts("북구 두호동 1"), { pnu: "4711110100100010000", address: "경상북도 포항시 북구 두호동 1" }));
check("부번이 다르면 거절", !matchesInput(parts("강남구 개포동 617-1"), { pnu: "1168010300106170000", address: "서울특별시 강남구 개포동 617" }));

const same = { pnu: "2914010100100010000", address: "전남광주통합특별시 서구 동천동 1" };
check("같은 필지(두 시·도가 같은 주소로 답함)는 하나로 합침", uniqueByPnu([same, { ...same }]).length === 1);
check("서로 다른 필지는 둘 다 남음 (→ 시·도를 고르게 함)", uniqueByPnu([same, { pnu: "3017010100100010000", address: "대전광역시 서구 동천동 1" }]).length === 2);

console.log(failed === 0 ? "\n통과" : `\n실패: ${failed}개`);
process.exit(failed === 0 ? 0 : 1);
