// 지역·지구별 매각제한 판정. 서버에서만 쓴다.
// 기준: DESIGN.md 4.1·4.3, PRD Must ② 규칙 1~9
//
// 판정 순서 (AI는 "근거 후보가 있는 포함 지역·지구"에만 부르고, 나머지는 규칙으로 정한다):
//   ① 저촉·접함·표기 없음            → 확인 필요 (AI 호출 없음, PRD 규칙 5)
//   ② 포함 + 제4조 후보 없음 + 허용 목록 → 제한 없음 (근거: 처분기준 제4조 해당 사유 없음)
//   ③ 포함 + 제4조 후보 없음 + 허용 목록 밖 → 확인 필요 (근거 없음)
//   ④ 포함 + 제4조 후보 있음          → AI가 "제한 있음 / 확인 필요" 중 선택 (제한 없음은 불가)
// AI 응답은 그대로 믿지 않는다. 어떤 경로의 결과든 마지막에 lib/safety.ts의 안전 규칙을 반드시 거친다
// (판정값 3종, 저촉·접함은 확인 필요, 근거 id 검증, 제한 없음의 고정 근거, 인용 200자·이유 100자,
//  이유 속 근거 없는 조항·숫자·법령과 매각 가부 표현 금지, 지역·지구 빠짐없이).
import "server-only";
import OpenAI from "openai";
import { getRequiredKey } from "@/lib/server/env";
import { RULE_IDS, findRuleCandidates, getRuleById } from "@/lib/server/rules";
import { zoneLawContext } from "@/lib/server/zoneLawTexts";
import { hasRestrictiveWording } from "@/lib/zoneLaws";
import type { Candidate } from "@/lib/ruleMatch";
import { enforceZoneResult, ensureAllZones } from "@/lib/safety";
import {
  MAX_QUOTE_LENGTH,
  MAX_REASON_LENGTH,
  NO_RESTRICTION_EVIDENCE,
  NO_RESTRICTION_TEXT,
  VERDICTS,
  type Evidence,
  type Rule,
  type Summary,
  type Verdict,
  type Zone,
  type ZoneResult,
} from "@/lib/types";

const DEFAULT_MODEL = "gpt-4.1-mini";
const AI_TIMEOUT_MS = 20_000; // AI 한 번 호출의 제한 시간
// 판정 전체에서 "새 AI 호출을 시작할 수 있는" 마감 시간. 넘기면 남은 항목은 AI를 부르지 않고 확인 필요로 채운다.
// 마감 직전에 시작한 호출도 최대 20초(AI_TIMEOUT_MS)까지 걸리므로, 35 + 20 = 55초가 판정 API의 maxDuration(60초) 안에 들어오게 잡는다.
const OVERALL_MS = 35_000;
const MAX_AI_ZONES = 30; // 한 번의 판정 요청에서 AI를 부르는 지역·지구 수의 상한 (비용 상한). 넘는 항목은 AI 없이 확인 필요
const CONCURRENCY = 3; // 한 번에 AI에 보내는 지역·지구 수
const MAX_EVIDENCE = 3;

// ---------- 근거 만들기 ----------

// 정리본 원문에서 인용문을 만든다. AI가 보낸 글이 아니라 항상 정리본 원문을 쓴다 (지어내기 방지).
function quoteOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_QUOTE_LENGTH ? `${flat.slice(0, MAX_QUOTE_LENGTH - 1)}…` : flat;
}

function evidenceOf(candidate: Candidate): Evidence {
  const { rule } = candidate;
  return { id: rule.id, source: rule.source, ref: rule.ref, quote: quoteOf(rule.text) };
}

function limitEvidence(candidates: Candidate[]): Evidence[] {
  return candidates.slice(0, MAX_EVIDENCE).map(evidenceOf);
}

function trimReason(reason: string): string {
  const flat = reason.replace(/\s+/g, " ").trim();
  return flat.length > MAX_REASON_LENGTH ? `${flat.slice(0, MAX_REASON_LENGTH - 1)}…` : flat;
}

// ---------- AI 호출 ----------

// 처분기준 제4조제1항제2호: "다른 법률에 따라 그 처분이 제한되는 경우" (어느 법률인지 말하지 않는 일반 규정)
const GENERAL_RESTRICTION_ID = "gijun-4-2";

export type AiOutcome ={ attempted: boolean; failed: boolean };

const aiSchema = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["제한 있음", "확인 필요"] },
    evidence_ids: { type: "array", items: { type: "string" } },
    reason: { type: "string" },
  },
  required: ["verdict", "evidence_ids", "reason"],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = [
  "당신은 국유재산 매각제한 검토를 돕는 보조자입니다.",
  "아래 '근거 조항'에 적힌 내용만 사용하세요. 근거 조항에 없는 법령·숫자·사실은 절대 지어내지 마세요.",
  "매각 가능 여부나 결론은 말하지 말고, 이 지역·지구가 근거 조항의 국유재산 매각 또는 활용 제한 사유에 해당하는지만 판단하세요.",
  "판정은 두 가지뿐입니다. '제한 있음'은 근거 조항의 원문이 이 지역·지구를 직접 가리키거나, 조건이 원문만으로 명백히 충족될 때만 고릅니다.",
  "조항이 일반 규정(예: '다른 법률에 따라 처분이 제한되는 경우')이고 해당 법률의 내용을 알 수 없으면 '확인 필요'를 고릅니다. 확신이 없으면 '확인 필요'입니다.",
  "'제한 있음'은 근거 조항이 이 지역·지구에서 국유재산(국가·지방자치단체 소유 토지 포함)의 ① 매각·양도·처분을 직접 금지하거나 제한하는 경우, 또는 ② 활용(사용·대부·점용·개발·건축·형질변경·용도변경 등)을 직접 금지하거나 원칙적으로 금지하고 예외만 허용하는 경우입니다.",
  "예: \"~지역에서는 건축물의 건축·용도변경·형질변경 등을 하여서는 아니 된다(다만 허가를 받은 경우 예외)\"처럼 원칙적으로 금지하는 조항은 활용 제한이 있는 것입니다.",
  "허가·협의·신고·승인을 받으면 된다는 절차 요건만 있거나, 지정 절차·정의·손실보상·부담금·조직 규정은 제한이 아닙니다. 이런 조항만 있으면 '확인 필요'입니다.",
  "reason에는 제한이 매각에 대한 것인지 활용에 대한 것인지(또는 둘 다인지) 밝혀서 쓰세요.",
  "evidence_ids에는 판단에 실제로 쓴 근거 조항의 id만 넣으세요. 목록에 없는 id는 넣지 마세요.",
  "reason은 근거 조항 원문에 있는 내용만으로 쓴 한국어 한 문장(100자 이내)입니다.",
].join("\n");

let cachedClient: OpenAI | null = null;
function client(): OpenAI {
  // 자동 재시도는 하지 않는다 (재시도하면 호출 1번이 최대 40초가 되어 위의 시간 계산이 깨진다). 실패한 항목은 확인 필요로 두고 "체크 다시 시도"로 다시 받는다.
  cachedClient ??= new OpenAI({ apiKey: getRequiredKey("OPENAI_API_KEY"), timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  return cachedClient;
}

type AiAnswer = { verdict: Verdict; evidenceIds: string[]; reason: string };

// AI에게 근거 후보를 보여 주고 판정을 받는다. 지번·주소는 보내지 않는다 (지역·지구 이름과 조항 원문만).
async function askAi(zone: Zone, candidates: Candidate[], signal?: AbortSignal): Promise<AiAnswer> {
  const model = (process.env.OPENAI_MODEL ?? "").trim() || DEFAULT_MODEL;
  const input = JSON.stringify({
    지역_지구: zone.name,
    토지이용계획_표기: zone.relation,
    근거_조항: candidates.map(({ rule }) => ({ id: rule.id, 문서: rule.source, 조항: rule.ref, 원문: rule.text })),
  });

  // signal: 사용자가 요청을 취소하면(브라우저가 연결을 끊으면) AI 호출도 함께 멈춘다
  const response = await client().responses.create(
    {
      model,
      instructions: INSTRUCTIONS,
      input,
      // gpt-4 계열만 온도를 0으로 고정한다 (추론 모델은 온도 설정을 받지 않는다)
      ...(model.startsWith("gpt-4") ? { temperature: 0 } : {}),
      text: { format: { type: "json_schema", name: "judgement", strict: true, schema: aiSchema } },
    },
    signal ? { signal } : undefined,
  );

  const parsed: unknown = JSON.parse(response.output_text);
  const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const verdict = record.verdict === "제한 있음" ? "제한 있음" : "확인 필요"; // 모르는 값은 확인 필요
  const evidenceIds = Array.isArray(record.evidence_ids) ? record.evidence_ids.filter((id): id is string => typeof id === "string") : [];
  const reason = typeof record.reason === "string" ? record.reason : "";
  return { verdict, evidenceIds, reason };
}

// ---------- 한 지역·지구 판정 ----------

const REASON = {
  overlap: "필지와 일부만 겹쳐(저촉) 있어 담당자 확인이 필요합니다.",
  adjoin: "필지와 맞닿아(접함) 있어 담당자 확인이 필요합니다.",
  unknownRelation: "토지이용계획의 표기를 알 수 없어 담당자 확인이 필요합니다.",
  noRestriction: "처분기준 제4조의 매각제한 사유에 해당하지 않는 지역·지구입니다.",
  notFound: "근거 문서에서 이 지역·지구에 해당하는 규정을 찾지 못해 담당자 확인이 필요합니다.",
  aiFailed: "판정 서비스 오류로 자동 판정하지 못했습니다. 담당자 확인이 필요합니다.",
  timeout: "판정 시간이 초과되어 자동 판정하지 못했습니다. 다시 시도하거나 담당자가 확인해 주세요.",
  aiCap: "한 번에 자동 판정할 수 있는 건수를 넘어 자동 판정하지 못했습니다. 담당자 확인이 필요합니다.",
  lawNoLimit: "근거 법률에서 국유재산 매각·활용을 직접 제한하는 조항을 찾지 못했습니다. 하위 규정·조례는 확인하지 못해 담당자 확인이 필요합니다.",
  aiUnsure: "근거 조항만으로는 매각제한 여부를 단정할 수 없어 담당자 확인이 필요합니다.",
} as const;

export type JudgeOptions = {
  signal?: AbortSignal; // 사용자가 요청을 취소하면 멈춘다
  deadlineAt?: number; // 이 시각(ms)을 넘기면 AI를 더 부르지 않는다
  takeAiSlot?: () => boolean; // AI를 부를 수 있는 건수가 남았는지 (비용 상한)
};

export async function judgeZone(zone: Zone, options: JudgeOptions = {}): Promise<{ result: ZoneResult; ai: AiOutcome }> {
  const found = findRuleCandidates(zone.name);
  const base = { zone: zone.name, relation: zone.relation };
  const noAi: AiOutcome = { attempted: false, failed: false };
  // AI 호출 결과든 규칙으로 정한 결과든 마지막에 반드시 안전 규칙(lib/safety.ts)을 거친다.
  // 판단 이유 점검에 쓰도록 이 지역·지구의 근거 후보 원문을 함께 넘긴다.
  // 근거 법률(토지이용규제 기본법 별표가 가리키는 법률)의 조문: 별표 조문(지정 근거)과 매각·활용 제한 후보 조문. 허용 목록의 지역·지구(용도지역 등)에는 쓰지 않는다.
  const lawCtx = found.allowed ? null : zoneLawContext(zone.name);
  const known = new Set([...found.restriction, ...found.related].map(({ rule }) => `${rule.source}|${rule.ref}`));
  const toCandidate = (rule: Rule): Candidate => ({ rule, via: "지역·지구 분류", topic: "근거 법률" });
  const lawLimit = (lawCtx?.limitRules ?? []).filter((rule) => !known.has(`${rule.source}|${rule.ref}`)).map(toCandidate);
  const lawCited = (lawCtx?.citedRules ?? []).filter((rule) => !known.has(`${rule.source}|${rule.ref}`)).map(toCandidate);
  // 제한 후보 조문이 있는데 처분기준 제4조 후보가 없으면, 일반 규정(제4조제1항제2호)을 후보로 삼아 AI가 읽게 한다
  let restriction = found.restriction;
  if (restriction.length === 0 && lawLimit.length > 0) {
    const general = getRuleById(GENERAL_RESTRICTION_ID);
    if (general) restriction = [toCandidate(general)];
  }
  const sourceTexts = [...restriction, ...found.related, ...lawLimit, ...lawCited].map(({ rule }) => `${rule.source} ${rule.ref} ${rule.text}`);
  const withEvidence = (verdict: Verdict, evidence: Evidence[], reason: string, ai: AiOutcome = noAi) => {
    const { result, fixes } = enforceZoneResult({ ...base, verdict, evidence, reason: trimReason(reason) }, { sourceTexts, knownEvidenceIds: RULE_IDS });
    // 무엇을 고쳤는지만 남긴다 (키·요청 내용은 남기지 않는다)
    if (fixes.length > 0) console.warn("[check] 안전 규칙으로 고침:", fixes.join(" / "));
    return { result, ai };
  };
  // 제한 후보가 있으면 그것을, 없으면 참고 조항을 근거로 보여 준다.
  const shownCandidates = restriction.length > 0 ? restriction : found.related;

  // ① 저촉·접함·표기 없음 → 확인 필요 (PRD Must ② 규칙 5)
  if (zone.relation !== "포함") {
    const reason = zone.relation === "저촉" ? REASON.overlap : zone.relation === "접함" ? REASON.adjoin : REASON.unknownRelation;
    return withEvidence("확인 필요", limitEvidence(shownCandidates), reason);
  }

  // ②③ 포함인데 제4조 사유 후보가 없는 경우
  if (restriction.length === 0) {
    if (found.allowed) {
      const none: Evidence = { ...NO_RESTRICTION_EVIDENCE, quote: NO_RESTRICTION_TEXT };
      return withEvidence("제한 없음", [none, ...found.related.slice(0, 2).map(evidenceOf)], REASON.noRestriction);
    }
    // 근거 법률은 찾았지만 매각·활용을 직접 제한하는 조항이 없는 경우: 확인 필요 (하위 규정·조례는 보지 못했으므로 "제한 없음"으로 단정하지 않는다)
    if (lawCited.length > 0) return withEvidence("확인 필요", limitEvidence(lawCited), REASON.lawNoLimit);
    return withEvidence("확인 필요", [], REASON.notFound);
  }

  // ④ 포함 + 제4조 후보 있음 → AI가 "제한 있음 / 확인 필요" 중 고른다
  const candidates = [...restriction, ...found.related, ...lawCited, ...lawLimit];
  const failedAi: AiOutcome = { attempted: true, failed: true };
  // 시간이 다 됐거나 요청이 취소됐으면 AI를 부르지 않고 확인 필요로 둔다
  if ((options.deadlineAt !== undefined && Date.now() > options.deadlineAt) || options.signal?.aborted) {
    return withEvidence("확인 필요", limitEvidence(restriction), REASON.timeout, failedAi);
  }
  // 한 번의 요청에서 AI를 부를 수 있는 건수를 넘었으면 부르지 않는다 (비용 상한)
  if (options.takeAiSlot && !options.takeAiSlot()) {
    return withEvidence("확인 필요", limitEvidence(restriction), REASON.aiCap, failedAi);
  }
  try {
    const answer = await askAi(zone, candidates, options.signal);
    const byId = new Map(candidates.map((c) => [c.rule.id, c]));
    const picked = [...new Set(answer.evidenceIds)].map((id) => byId.get(id)).filter((c): c is Candidate => c !== undefined);
    // 근거가 하나도 없거나, 근거가 일반 규정(제4조제1항제2호 "다른 법률에 따라 처분이 제한되는 경우")뿐이면 "제한 있음"은 인정하지 않는다.
    // 일반 규정만으로는 어떤 법률이 처분을 제한하는지 알 수 없다.
    // 근거 법률 조문은 실제로 제한하는 말(할 수 없다·아니 된다·금지·제한)이 있는 "제한 후보 조문"일 때만 제한 있음의 근거로 인정한다.
    // (별표가 가리키는 지정 조문이나 정의·절차 조문만 고르면 인정하지 않는다)
    const limitIds = new Set(lawLimit.map((c) => c.rule.id));
    const specific = picked.filter(
      (c) => c.rule.id !== GENERAL_RESTRICTION_ID && (!c.rule.id.startsWith("zl-") || (limitIds.has(c.rule.id) && hasRestrictiveWording(c.rule.text))),
    );
    if (answer.verdict === "제한 있음" && specific.length > 0) {
      const ordered = [...specific, ...picked.filter((c) => !specific.includes(c))];
      return withEvidence("제한 있음", ordered.slice(0, MAX_EVIDENCE).map(evidenceOf), answer.reason || REASON.aiUnsure, { attempted: true, failed: false });
    }
    return withEvidence("확인 필요", limitEvidence(picked.length > 0 ? picked : restriction), answer.reason || REASON.aiUnsure, { attempted: true, failed: false });
  } catch (error) {
    // 원인은 종류만 남긴다 (요청 내용·키는 남기지 않는다)
    console.error("[check] AI 판정 실패:", error instanceof Error ? error.name : "알 수 없는 오류");
    return withEvidence("확인 필요", limitEvidence(restriction), REASON.aiFailed, { attempted: true, failed: true });
  }
}

// ---------- 여러 지역·지구 판정 ----------

// 한 번에 CONCURRENCY개씩 처리하되, 결과 순서는 입력 순서를 유지한다.
export async function judgeZones(zones: Zone[], signal?: AbortSignal): Promise<{ results: ZoneResult[]; aiAttempts: number; aiFailures: number }> {
  const partial: (ZoneResult | undefined)[] = new Array(zones.length);
  let aiAttempts = 0;
  let aiFailures = 0;
  let next = 0;
  let aiSlotsUsed = 0;
  const options: JudgeOptions = {
    signal,
    deadlineAt: Date.now() + OVERALL_MS,
    takeAiSlot: () => (aiSlotsUsed < MAX_AI_ZONES ? ((aiSlotsUsed += 1), true) : false),
  };

  async function worker() {
    while (next < zones.length) {
      const index = next;
      next += 1;
      try {
        const { result, ai } = await judgeZone(zones[index], options);
        partial[index] = result;
        if (ai.attempted) aiAttempts += 1;
        if (ai.failed) aiFailures += 1;
      } catch (error) {
        // 한 건이 예상 밖으로 실패해도 나머지는 계속한다. 빈 칸은 아래에서 "확인 필요"로 채운다.
        console.error("[check] 지역·지구 판정 중 오류:", error instanceof Error ? error.name : "알 수 없는 오류");
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, zones.length) }, worker));

  // 지역·지구 빠짐없이: 결과가 입력과 순서·개수까지 같도록 맞춘다 (PRD Must ② 규칙, DESIGN 4.3)
  const { results, filled } = ensureAllZones(zones, partial);
  if (filled > 0) console.warn(`[check] 빠진 판정 ${filled}건을 확인 필요로 채움`);
  return { results, aiAttempts, aiFailures };
}

// 판정별 건수 요약 (매각 가능 여부는 만들지 않는다 — PRD Must ② 규칙 6)
export function summarize(results: ZoneResult[]): Summary {
  const summary = Object.fromEntries(VERDICTS.map((verdict) => [verdict, 0])) as Summary;
  for (const result of results) summary[result.verdict] += 1;
  return summary;
}
