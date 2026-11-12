// 지역·지구별 근거 법률 표를 읽어 이름으로 찾아 준다. 서버에서만 쓴다.
import "server-only";
import zoneLaws from "@/data/rules/zone-laws.json";
import { findZoneLaws, type ZoneLawRow } from "@/lib/zoneLaws";

const ROWS = zoneLaws.rows as ZoneLawRow[];

// 지역·지구 이름들 → { 이름: [근거 법률, …] } (근거 법률을 못 찾은 이름은 빼고 돌려준다)
export function lawsForZones(names: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const name of names) {
    const laws = findZoneLaws(name, ROWS);
    if (laws.length > 0) result[name] = laws;
  }
  return result;
}

// 별표의 기준일 (결과 화면의 근거 문서 기준일에 쓴다)
export const ZONE_LAWS_DOCUMENT = zoneLaws.document;
