// 지역·지구 이름 → 근거 법률. 「토지이용규제 기본법」 별표("토지이용규제를 하는 지역·지구등")를 법제처 API로 받아 만든 표(data/rules/zone-laws.json)를 쓴다.
// 순수 계산만 하므로 화면·서버·시험 어디서나 쓸 수 있다. (표 자체는 lib/server/zoneLaws.ts에서 읽는다)
// 이 표는 "관련 법률을 보여 주는" 용도이며, 그 법률이 매각을 제한하는지의 판정과는 별개다 (판정 근거는 lib/ruleMatch.ts).

export type ZoneLawRow = {
  no: number;
  lawName: string; // 예: "도시개발법"
  article: string; // 예: "제3조"
  law: string; // 예: "「도시개발법」 제3조"
  zone: string; // 별표의 지역·지구등 명칭
};

// 이름을 비교하기 좋게 다듬는다: 괄호 설명·공백·가운뎃점 모양을 없앤다. 예: "소로3류(폭 8m 미만)" → "소로3류"
export function normalizeZoneName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s·ㆍ・]/g, "")
    .trim();
}

// 용도지역은 별표에 "주거지역·상업지역·공업지역·녹지지역"처럼 큰 갈래로만 나온다.
// 토지이용계획에는 "제3종일반주거지역", "자연녹지지역"처럼 세부 이름이 나오므로 갈래로 이어 준다.
const USE_AREA_FAMILIES = ["주거지역", "상업지역", "공업지역", "녹지지역", "관리지역", "농림지역", "자연환경보전지역"];

// 한 지역·지구의 근거 법률 행들. 못 찾으면 빈 배열.
export function findZoneLawRows(zoneName: string, rows: ZoneLawRow[]): ZoneLawRow[] {
  const name = normalizeZoneName(zoneName);
  if (!name) return [];

  const family = USE_AREA_FAMILIES.find((f) => name.endsWith(f));
  return rows.filter((row) => {
    const rowName = normalizeZoneName(row.zone);
    return rowName === name || (family !== undefined && rowName === family);
  });
}

// 한 지역·지구의 근거 법률 목록(중복 없이). 못 찾으면 빈 배열.
export function findZoneLaws(zoneName: string, rows: ZoneLawRow[]): string[] {
  return [...new Set(findZoneLawRows(zoneName, rows).map((row) => row.law))];
}

// 별표의 조항 표기("제6조 및 제40조의7", "제10조제1항제1호")에서 조 단위 표기("제6조", "제40조의7", "제10조")를 뽑는다.
export function citedArticleRefs(article: string): string[] {
  const refs = new Set<string>();
  for (const match of article.matchAll(/제(\d+)조(?:의(\d+))?/g)) refs.add(`제${match[1]}조${match[2] ? `의${match[2]}` : ""}`);
  return [...refs];
}

// 조문 글에 "할 수 없다 / 아니 된다 / 금지 / 제한" 같은 제한하는 말이 있는지. AI가 "제한 있음"을 고른 근거가 실제로 제한하는 말을 담고 있는지 코드에서 다시 확인할 때 쓴다.
export function hasRestrictiveWording(text: string): boolean {
  return /(할 수 없|아니 된다|하지 못한다|못한다|금지|제한)/.test(text);
}
