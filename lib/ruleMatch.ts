// 근거 후보 찾기: 지역·지구 이름으로 "이 지역·지구가 처분기준 제4조의 매각제한 사유에 해당할 수 있는가"를 가려
// 정리본(처분기준·국유재산법령)에서 근거가 될 만한 조항을 골라 준다. 순수 계산만 하므로 화면·서버·시험 어디서나 쓴다.
// 기준: DESIGN.md 4.1~4.3, PRD Must ② 규칙 2·3
//
// ※ 중요: 아래 두 표는 법률 판단이 들어간 안이다. 근거는 처분기준·국유재산법·시행령·시행규칙·업무요강 별표 6(승인 절차, 참고용) 5개 문서뿐이다.
//   1) 분류표(ZONE_TOPICS): 걸리면 처분기준 제4조 사유의 "후보"가 되어 AI·담당자가 확인한다 ("제한 있음/확인 필요").
//   2) 허용 목록(NO_RESTRICTION_ALLOWLIST): 제한이 없다고 알려진 이름만 올려 두었다.
//   "제한 없음"은 [후보가 없고 + 허용 목록에 있는] 경우에만 가능하다.
//   두 표 어디에도 없는 낯선 이름은 근거가 없으므로 "확인 필요"로 넘긴다 (잘못된 "제한 없음"을 막기 위함).
//   분류표와 허용 목록은 담당자가 검토해 보완한다.
import type { Rule } from "./types";

// ---------- 분류표 ----------

// 처분기준 제4조 제1항 매각제한 사유 번호 (id: gijun-4-1 ~ gijun-4-10)
export const RESTRICTION_IDS = Array.from({ length: 10 }, (_, i) => `gijun-4-${i + 1}`);

type ZoneTopic = {
  topic: string; // 분류 이름 (화면·로그용)
  pattern: RegExp; // 지역·지구 이름에 이 모양이 있으면 해당
  ruleIds: string[]; // 근거 후보로 올릴 정리본 항목 id
};

export const ZONE_TOPICS: ZoneTopic[] = [
  { topic: "개발제한구역", pattern: /개발제한구역|그린벨트/, ruleIds: ["gijun-4-2"] },
  { topic: "상수원 관련", pattern: /상수원|수변구역|특별대책지역|수계/, ruleIds: ["gijun-4-6", "gijun-4-hang2"] },
  { topic: "군사 관련", pattern: /군사|통제보호|제한보호|비행안전|작전|방공|군용/, ruleIds: ["gijun-4-2"] },
  { topic: "문화재 관련", pattern: /문화재|문화유산|역사문화환경|국가유산|사적|천연기념물|매장유산/, ruleIds: ["gijun-4-2"] },
  {
    topic: "공원·자연·산림 보호",
    // "준보전산지"는 보전산지가 아니므로 제외한다 (앞에 "준"이 없는 보전산지만).
    pattern: /자연공원|국립공원|도립공원|군립공원|도시자연공원|공원구역|습지|생태|경관보전|백두대간|(?<!준)보전산지|공익용산지|산림유전자원|야생동물|야생생물/,
    ruleIds: ["gijun-4-2"],
  },
  { topic: "하천 관련", pattern: /하천|제방|홍수/, ruleIds: ["gijun-4-2"] },
  { topic: "접도·도로 구역", pattern: /접도구역|도로구역/, ruleIds: ["gijun-4-2"] },
  {
    // 도시·군계획시설(도로, 공원, 학교 등)은 다른 법률(국토계획법)에 따라 용도가 정해져 처분에 제한이 있을 수 있다.
    topic: "도시·군계획시설",
    // "하수처리구역"·"배수구역"·"녹지구역"처럼 시설이 아닌 구역 이름은 걸리지 않게 시설 이름만 적는다.
    pattern: /(광로|대로|중로|소로|보행자전용도로|자전거전용도로|도로)(\d류|$|\()|^도로|공원$|^공원|광장|유수지|주차장|공공청사|저수지|방재시설|철도|공동구|하수종말처리|하수처리시설|하수도|폐기물처리|연결녹지|완충녹지|경관녹지|학교|대학|시장$|체육시설|문화시설|공공공지/,
    ruleIds: ["gijun-4-2"],
  },
  {
    // 개발사업 구역: 법 제57조에 따른 개발이 필요한 경우(제4조제1항제3호)의 후보.
    // 근거: 법 제57조 제2항이 개발의 근거 법률로 공공주택 특별법, 도시개발법, 도시 및 주거환경정비법,
    //       산업입지 및 개발에 관한 법률, 주택법, 택지개발촉진법 등을 직접 나열한다. 나열되지 않은 구역(기업도시 등)은 넣지 않는다.
    topic: "개발사업 구역",
    pattern: /도시개발|택지개발|정비구역|정비예정|재개발|재건축|공공주택|산업단지|농공단지/,
    ruleIds: ["gijun-4-3", "beop-57", "yogang-b6-40-3-18-하", "yogang-b6-40-3-27다"],
  },
];

// ---------- 개별 법률 연결 (법제처 API로 받은 data/rules/laws.json) ----------

// 지역·지구의 근거 법률 가운데 "국공유재산의 처분(매각·양도)을 직접 제한한다"고 조항 제목·본문에 명시된 조항만 연결한다.
// 걸리면 처분기준 제4조제1항제2호("다른 법률에 따라 처분이 제한되는 경우")의 후보가 되고, 아래 조항이 근거로 함께 올라가 AI가 "제한 있음/확인 필요"를 가린다.
// ※ 허가·협의·신고 같은 절차 요건이나 건축 등 행위 제한은 매각 제한이 아니므로 연결하지 않는다.
//   (군사기지법 제13조, 부동산 거래신고법 제11조, 개발제한구역법, 산지관리법 등은 laws.json에 받아 두었지만 처분을 직접 제한하는 조항이 없어 연결하지 않았다 — 해당 지역·지구는 확인 필요로 남는다.)
// ruleIds는 scripts/fetch-laws.mjs 로 받은 정리본의 id (law-<key>-<조번호>)이다. 담당자가 검토해 보완한다.
type LawTopic = { topic: string; pattern: RegExp; ruleIds: string[] };

export const LAW_TOPICS: LawTopic[] = [
  // 도시공원법 제52조: 도시공원 및 녹지에 있는 국유·공유 재산은 도시·군관리계획 목적 외로 매각·양도할 수 없다 (도시자연공원구역 자체를 가리키지는 않으므로 제외)
  { topic: "도시공원·녹지", pattern: /^(도시|근린|어린이|소|역사|문화|체육|수변|묘지|주제|생활권)?공원$|도시공원|근린공원|어린이공원|연결녹지|완충녹지|경관녹지/, ruleIds: ["law-dosigongwon-52"] },
  { topic: "자연공원", pattern: /국립공원|도립공원|군립공원|자연공원(?!구역)/, ruleIds: ["law-jayeongongwon-75"] },
  { topic: "문화유산", pattern: /문화재|문화유산|역사문화환경|국가유산|사적|천연기념물|매장유산/, ruleIds: ["law-munhwayusan-65", "law-munhwayusan-66"] },
  { topic: "도시개발", pattern: /도시개발/, ruleIds: ["law-dosigaebal-68"] },
  // 국토계획법 제97조: 도시·군계획시설 부지로 지정된 국공유지는 그 시설사업 외의 목적으로 매각·양도할 수 없다
  { topic: "도시·군계획시설", pattern: /(광로|대로|중로|소로|보행자전용도로|자전거전용도로|도로)(\d류|$|\()|^도로|공원$|^공원|광장|유수지|주차장|공공청사|저수지|방재시설|철도|공동구|하수종말처리|하수처리시설|하수도|폐기물처리|연결녹지|완충녹지|경관녹지|학교|대학|시장$|체육시설|문화시설|공공공지/, ruleIds: ["law-gukto-97"] },
];

function lawRulesFor(ids: string[], byId: Map<string, Rule>): Rule[] {
  return ids.map((id) => byId.get(id)).filter((rule): rule is Rule => rule !== undefined);
}

// ---------- 제한 없음 허용 목록 ----------

// 처분기준 제4조의 매각제한 사유와 무관한 것으로 보는 지역·지구 (용도지역·용도지구 등 이용·건축 규제).
// 이 목록에 있고 제한 후보도 없을 때만 "제한 없음"이 가능하다. 목록에 없는 이름은 "확인 필요"가 된다.
type AllowedZone = {
  topic: string;
  pattern: RegExp;
  relatedIds?: string[]; // 함께 보여 줄 참고 조항 id
};

export const NO_RESTRICTION_ALLOWLIST: AllowedZone[] = [
  {
    topic: "용도지역",
    pattern: /^(제[123]종)?(전용|일반)?주거지역$|^준주거지역$|^(중심|일반|근린|유통)상업지역$|^(전용|일반|준)공업지역$|^(보전|생산|자연)녹지지역$|^(보전|생산|계획)관리지역$|^농림지역$|^자연환경보전지역$|^도시지역$|^관리지역$/,
  },
  { topic: "용도지구", pattern: /^(방화|고도|자연취락|집단취락)지구$/ },
  { topic: "지구단위계획 등", pattern: /^(지구단위계획|성장관리계획)구역$/ },
  {
    // 아래 3개는 법제처 API로 받은 해당 법률 원문(laws.json)에 처분·양도·소유권 이전 등을 제한하는 조항이 없음을 확인해 올린 것이다 (2026-11-12).
    // 수도권정비계획법(부담금·이의신청만 해당 낱말이 나옴), 경관법·학교보건법(해당 낱말이 나오는 조항 없음). 담당자 검토 대상.
    topic: "처분 제한 조항이 없는 법률의 구역",
    pattern: /^(과밀억제권역|중점경관관리구역|상대보호구역|절대보호구역)$/,
  },
  { topic: "가축사육제한구역", pattern: /^가축사육제한구역$/ },
  {
    // 처분기준 제4조제2항: 도시지역 중 하수처리구역으로 지정된 지역은 상수원 관련 제한(제6호)에도 불구하고 매각할 수 있다.
    topic: "하수처리구역",
    pattern: /^하수처리구역$/,
    relatedIds: ["gijun-4-hang2"],
  },
  {
    // 처분기준 제11조·시행령 제40조: 농업진흥지역(농업진흥구역·농업보호구역)의 농지는 요건을 갖추면 수의계약으로 매각할 수 있다.
    // (매각을 막는 규정이 아니라 매각 방법의 요건이므로 제한 후보가 아니라 참고 조항으로 보여 준다.)
    topic: "농업진흥지역",
    pattern: /^농업(진흥|보호)(구역|지역)$/,
    relatedIds: ["gijun-11", "yogang-b6-40-3-18-아"],
  },
];

// ---------- 결과 모양 ----------

export type Candidate = {
  rule: Rule;
  via: "지역·지구 분류" | "검색 낱말" | "본문 일치"; // 어떤 방식으로 찾았는지
  topic?: string; // 분류표에서 찾았으면 분류 이름
};

export type CandidateResult = {
  restriction: Candidate[]; // 처분기준 제4조 제1항의 매각제한 사유 후보
  related: Candidate[]; // 그 밖의 참고 조항 (예외 규정, 법령 조항 등)
  topics: string[]; // 걸린 분류 이름들
  // 허용 목록에 있으면 그 분류 이름, 없으면 null.
  // "제한 없음"은 restriction이 비어 있고 allowed가 null이 아닐 때만 가능하다. (둘 다 아니면 "확인 필요")
  allowed: string | null;
};

// ---------- 찾기 ----------

// 지역·지구 이름을 비교하기 좋게 다듬는다. 예: "소로3류(폭 8m 미만)" → "소로3류"
export function normalizeZoneName(name: string): string {
  return name.replace(/\([^)]*\)/g, "").replace(/\s+/g, "").trim();
}

// 이름이 비슷해도 제4조 사유 후보로 올리지 않는 지역·지구 (분류표·검색 낱말보다 먼저 적용한다)
//  - 준보전산지: 보전산지(공익용·임업용)와 다른 산지 구분이다. (허용 목록에도 없어서 결국 "확인 필요"가 된다)
const NEVER_RESTRICTION = [/준보전산지/];

// 너무 흔한 낱말은 검색 낱말 일치에서 뺀다 (엉뚱한 조항이 걸리지 않도록)
const GENERIC_WORDS = new Set(["지역", "지구", "구역", "지정", "일반", "처분", "제한", "관리", "국유재산", "일반재산", "행정재산"]);

export function findCandidates(zoneName: string, rules: Rule[]): CandidateResult {
  const name = normalizeZoneName(zoneName);
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const found = new Map<string, Candidate>(); // id → 후보 (먼저 찾은 방식을 남긴다)
  const topics: string[] = [];

  const add = (rule: Rule | undefined, via: Candidate["via"], topic?: string) => {
    if (rule && !found.has(rule.id)) found.set(rule.id, { rule, via, topic });
  };

  if (!name) return { restriction: [], related: [], topics, allowed: null };
  if (NEVER_RESTRICTION.some((pattern) => pattern.test(name))) return { restriction: [], related: [], topics, allowed: null };

  // 0) 제한 없음 허용 목록 (참고 조항이 딸려 있으면 함께 담는다)
  let allowed: string | null = null;
  for (const entry of NO_RESTRICTION_ALLOWLIST) {
    if (entry.pattern.test(name)) {
      allowed = entry.topic;
      for (const id of entry.relatedIds ?? []) add(byId.get(id), "지역·지구 분류", entry.topic);
    }
  }

  // 1) 지역·지구 분류표
  for (const entry of ZONE_TOPICS) {
    if (entry.pattern.test(name)) {
      topics.push(entry.topic);
      for (const id of entry.ruleIds) add(byId.get(id), "지역·지구 분류", entry.topic);
    }
  }

  // 1-2) 개별 법률 연결: 근거 법률의 처분 관련 조항을 올리고, 제4조제1항제2호 후보로 삼는다 (허용 목록의 지역·지구는 제외)
  if (!allowed) {
    for (const entry of LAW_TOPICS) {
      if (!entry.pattern.test(name)) continue;
      topics.push(entry.topic);
      add(byId.get("gijun-4-2"), "지역·지구 분류", entry.topic);
      for (const rule of lawRulesFor(entry.ruleIds, byId)) add(rule, "지역·지구 분류", entry.topic);
    }
  }

  // 2) 정리본의 검색 낱말 (3글자 이상, 흔한 낱말 제외, 처분기준 조항만)
  for (const rule of rules) {
    if (!rule.id.startsWith("gijun-")) continue;
    const hit = rule.keywords.some((word) => word.length >= 3 && !GENERIC_WORDS.has(word) && (name.includes(word) || (name.length >= 4 && word.includes(name))));
    if (hit) add(rule, "검색 낱말");
  }

  // 3) 법령 조항 본문에 지역·지구 이름이 그대로 나오는 경우 (4글자 이상일 때만)
  if (name.length >= 4) {
    for (const rule of rules) {
      if (!rule.id.startsWith("gijun-") && !rule.id.startsWith("law-") && rule.text.includes(name)) add(rule, "본문 일치");
    }
  }

  const restriction: Candidate[] = [];
  const related: Candidate[] = [];
  for (const candidate of found.values()) {
    (RESTRICTION_IDS.includes(candidate.rule.id) ? restriction : related).push(candidate);
  }
  // 제한 후보가 하나라도 있으면 허용 목록에 있더라도 "제한 없음"은 불가능하다 (안전한 쪽으로).
  return { restriction, related, topics, allowed: restriction.length === 0 ? allowed : null };
}
