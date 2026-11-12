// 지역·지구의 근거 법률 조문(법제처 Open API로 받아 둔 data/rules/zone-law-texts.json)을 읽는다. 서버에서만 쓴다.
//  - 근거 법률 "내용": 별표가 가리키는 조문(예: 도시개발법 제3조)의 글
//  - 매각·활용 제한 "후보 조문": 그 법률에서 국유재산 처분·활용을 제한하는 문장이 있는 조문 (AI가 읽고 제한 여부를 가린다)
import "server-only";
import zoneLawData from "@/data/rules/zone-laws.json";
import zoneLawTexts from "@/data/rules/zone-law-texts.json";
import { citedArticleRefs, findZoneLawRows, type ZoneLawRow } from "@/lib/zoneLaws";
import type { DocumentInfo, LawContent, Rule } from "@/lib/types";

type LawArticle = { ref: string; title: string; text: string; cited: boolean };
type LawText = { baseDate: string; articles: LawArticle[] };

const ROWS = zoneLawData.rows as ZoneLawRow[];
const LAWS = zoneLawTexts.laws as unknown as Record<string, LawText>;
const LAW_INDEX = new Map(Object.keys(LAWS).map((name, index) => [name, index]));

const QUOTE_MAX = 200;

// 조문 글을 200자 이내 인용문으로 자른다 (줄바꿈은 공백으로)
function quoteOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= QUOTE_MAX ? flat : `${flat.slice(0, QUOTE_MAX - 1)}…`;
}

function ruleOf(lawName: string, article: LawArticle, baseDate: string): Rule {
  return {
    id: `zl-${LAW_INDEX.get(lawName)}-${article.ref}`,
    source: lawName,
    ref: article.ref,
    title: article.title,
    text: article.text,
    keywords: [],
    baseDate,
  };
}

// 이 모듈이 만드는 모든 조항 id (근거 id가 진짜인지 확인할 때 쓴다)
export const ZONE_LAW_RULE_IDS: ReadonlySet<string> = new Set(
  Object.entries(LAWS).flatMap(([name, law]) => law.articles.map((article) => ruleOf(name, article, law.baseDate).id)),
);

// 근거 id → 조항 (결과에 근거를 붙일 때 쓴다)
const RULE_BY_ID = new Map(
  Object.entries(LAWS).flatMap(([name, law]) => law.articles.map((article) => [ruleOf(name, article, law.baseDate).id, ruleOf(name, article, law.baseDate)] as const)),
);
export const getZoneLawRuleById = (id: string): Rule | undefined => RULE_BY_ID.get(id);

export type ZoneLawContext = {
  laws: string[]; // 근거 법률 표기 ("「도시개발법」 제3조")
  contents: LawContent[]; // 근거 법률 내용 (별표가 가리키는 조문 글, 200자 이내 인용)
  citedRules: Rule[]; // 별표가 가리키는 조문
  limitRules: Rule[]; // 매각·활용을 제한하는 문장이 있는 후보 조문 (별표 조문 제외)
};

// 지역·지구 이름 하나의 근거 법률 정보. 별표에 없는 이름이면 모든 목록이 빈 배열이다.
export function zoneLawContext(zoneName: string): ZoneLawContext {
  const rows = findZoneLawRows(zoneName, ROWS);
  const context: ZoneLawContext = { laws: [...new Set(rows.map((row) => row.law))], contents: [], citedRules: [], limitRules: [] };
  const seen = new Set<string>();

  for (const row of rows) {
    const law = LAWS[row.lawName];
    if (!law) continue;
    const wanted = new Set(citedArticleRefs(row.article));
    for (const article of law.articles) {
      const rule = ruleOf(row.lawName, article, law.baseDate);
      if (seen.has(rule.id)) continue;
      if (wanted.has(article.ref)) {
        seen.add(rule.id);
        context.citedRules.push(rule);
        context.contents.push({ law: `「${row.lawName}」`, ref: article.ref, title: article.title, quote: quoteOf(article.text) });
      } else if (!article.cited) {
        seen.add(rule.id);
        context.limitRules.push(rule);
      }
    }
  }
  return context;
}

// 지역·지구 이름들 → { 이름: 근거 법률 내용 } (내용을 못 찾은 이름은 뺀다)
export function lawContentsForZones(names: string[]): Record<string, LawContent[]> {
  const result: Record<string, LawContent[]> = {};
  for (const name of names) {
    const { contents } = zoneLawContext(name);
    if (contents.length > 0) result[name] = contents;
  }
  return result;
}

// 결과에 근거로 쓰인 법률(usedSources = 근거 문서 이름들)의 기준일 목록
export function zoneLawDocumentInfos(usedSources: Iterable<string>): DocumentInfo[] {
  return [...new Set(usedSources)].flatMap((name) => (LAWS[name] ? [{ name, baseDate: LAWS[name].baseDate, basis: "시행일" }] : []));
}
