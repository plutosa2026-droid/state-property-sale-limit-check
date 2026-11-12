// 근거 정리본(data/rules/*.json)을 읽어 지역·지구별 근거 후보를 찾는다. 서버에서만 쓴다.
// 기준: DESIGN.md 9.1, PLAN 작업 11. 찾는 규칙 자체는 lib/ruleMatch.ts에 있다.
import "server-only";
import beop from "@/data/rules/beop.json";
import gijun from "@/data/rules/gijun.json";
import sihaengryeong from "@/data/rules/sihaengryeong.json";
import sihaenggyuchik from "@/data/rules/sihaenggyuchik.json";
import laws from "@/data/rules/laws.json";
import yogang from "@/data/rules/yogang.json";
import { findCandidates, type CandidateResult } from "@/lib/ruleMatch";
import { ZONE_LAW_RULE_IDS } from "@/lib/server/zoneLawTexts";
import type { DocumentInfo, Rule, RuleDocument } from "@/lib/types";

// 근거 문서 5개. 처분기준을 맨 앞에 둔다 (매각제한 사유가 여기 있다). 업무요강 별표 6은 처분 유형별 승인 절차를 알려 주는 참고 근거다.
const BASE_DOCUMENTS = [gijun, beop, sihaengryeong, sihaenggyuchik, yogang] as RuleDocument[];
// 개별 법률(법제처 API로 받은 정리본). 지역·지구와 연결되어 실제로 근거로 쓰인 법률만 결과 화면의 기준일 목록에 보여 준다.
const LAW_DOCUMENTS = laws.documents as RuleDocument[];
const DOCUMENTS = [...BASE_DOCUMENTS, ...LAW_DOCUMENTS];

const RULES: Rule[] = DOCUMENTS.flatMap((doc) => doc.rules);
const RULE_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));

// 정리본에 실제로 있는 항목 id 모음 (근거 id가 진짜인지 확인할 때 쓴다)
export const RULE_IDS: ReadonlySet<string> = new Set([...RULES.map((rule) => rule.id), ...ZONE_LAW_RULE_IDS]);

// 지역·지구 이름 하나에 대한 근거 후보
export function findRuleCandidates(zoneName: string): CandidateResult {
  return findCandidates(zoneName, RULES);
}

// 정리본 항목 id로 원문 찾기 (AI가 보낸 근거 id가 정리본에 실제로 있는지 확인할 때 쓴다)
export function getRuleById(id: string): Rule | undefined {
  return RULE_BY_ID.get(id);
}

// 결과 화면에 문서별로 보여 줄 기준일
// 기본 문서 5개는 항상, 개별 법률은 이번 결과의 근거(usedSources = 근거로 쓰인 문서 이름들)에 나온 것만 담는다.
export function getDocumentInfos(usedSources: Iterable<string> = []): DocumentInfo[] {
  const used = new Set(usedSources);
  return [...BASE_DOCUMENTS, ...LAW_DOCUMENTS.filter(({ document }) => used.has(document.name))].map(({ document }) => ({
    name: document.name,
    baseDate: document.baseDate,
    basis: document.basis,
  }));
}
