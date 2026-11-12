// 지역·지구 목록을 화면에 보여 주기 위한 작은 도구 (화면·서버 공용, 순수 계산만 한다).
import type { Zone } from "./types";

export type RelationLabel = "저촉" | "접함" | "포함" | "표기 없음";

// 표기가 포함·접함·저촉이 아니거나 비어 있으면 "표기 없음"으로 본다 (판정 단계에서 "확인 필요"로 넘어간다).
export function relationLabel(zone: Zone): RelationLabel {
  return zone.relation === "저촉" || zone.relation === "접함" || zone.relation === "포함" ? zone.relation : "표기 없음";
}

// 표기별 건수. 예: { 저촉: 4, 접함: 3, 포함: 2, "표기 없음": 0 }
export function countRelations(zones: Zone[]): Record<RelationLabel, number> {
  const counts: Record<RelationLabel, number> = { 저촉: 0, 접함: 0, 포함: 0, "표기 없음": 0 };
  for (const zone of zones) counts[relationLabel(zone)] += 1;
  return counts;
}

// 조회 시각(ISO 8601, 한국 시간)을 "2026-11-12 14:03:00 (한국 시간)"으로 바꾼다. 시간대 변환 없이 글자만 다듬는다.
export function formatKoreaTime(iso: string): string {
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]} (한국 시간)` : iso;
}
