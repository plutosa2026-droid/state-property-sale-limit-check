// 시·도를 생략한 조회에서 쓰는 순수 계산: 브이월드가 돌려준 필지가 입력과 정확히 같은지, 같은 필지를 하나로 합치기.
// 서버·시험 어디서나 쓸 수 있게 다른 서버 모듈을 불러오지 않는다.
import type { ParcelParts } from "./parcel";

export type FoundParcel = { pnu: string; address: string };

// 필지 고유번호(19자리) = 법정동코드(10) + 대지구분(1: 일반, 2: 산) + 본번(4) + 부번(4)
export function expectedLotPart(parts: ParcelParts): string {
  return `${parts.san ? "2" : "1"}${parts.bonbun.padStart(4, "0")}${(parts.bubun ?? "0").padStart(4, "0")}`;
}

// 브이월드는 이름이 비슷한 다른 지번(다른 동·다른 번지)으로 대신 답하기도 하므로,
// 입력한 시·군·구·읍·면·동·리와 지번(산·본번·부번)이 정확히 같은 것만 받는다.
export function matchesInput(parts: ParcelParts, found: FoundParcel): boolean {
  if (found.pnu.slice(10) !== expectedLotPart(parts)) return false;
  const tokens = new Set(found.address.split(" "));
  const names = [...parts.sigungu, parts.eupmyeondong, ...(parts.ri ? [parts.ri] : [])];
  return names.every((name) => tokens.has(name));
}

// 같은 필지(고유번호)는 하나로 합친다. 예: 광주광역시와 전라남도가 합쳐져 같은 주소로 답하는 경우.
export function uniqueByPnu(rows: FoundParcel[]): FoundParcel[] {
  return [...new Map(rows.map((row) => [row.pnu, row])).values()];
}
