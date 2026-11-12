"use client";

// ③ 매각제한 체크 결과: 지역·지구마다 판정 카드(판정 배지, 근거, 원문 인용, 판단 이유)
// 기준: DESIGN.md 3장 화면 구성, 3.1 체크리스트 ③, PRD Must ② 규칙 1~4
// 맨 위에 건수 요약과 문서별 기준일, 맨 아래에 안내 문구 2개와 인쇄 버튼을 둔다.
// 인쇄할 때는 카드가 쪽 중간에서 잘리지 않게 하고(break-inside-avoid), 버튼은 숨긴다(print:hidden).
import { useId, useState } from "react";
import { relationLabel } from "@/lib/zones";
import { NO_EVIDENCE_TEXT, type ApiError, type CheckSuccess, type Verdict, type ZoneResult } from "@/lib/types";

// 판정 배지 색 (색만으로 구분하지 않도록 글자를 항상 함께 보여 준다)
const VERDICT_STYLE: Record<Verdict, string> = {
  "제한 있음": "border-red-700 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
  "확인 필요": "border-amber-700 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  "제한 없음": "border-green-700 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100",
};

// 화면에 보여 주는 판정 순서: 제한 있음 → 확인 필요 → 제한 없음 (서버가 돌려주는 순서는 바꾸지 않는다)
const VERDICT_ORDER: Verdict[] = ["제한 있음", "확인 필요", "제한 없음"];

// 같은 판정 안에서는 토지이용계획에 나온 순서를 그대로 유지한다 (Array.sort는 순서를 보존한다)
function sortByVerdict(results: ZoneResult[]): ZoneResult[] {
  return [...results].sort((a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict));
}

// 카드 바탕색: 제한 있음(붉은 바탕)과 확인 필요(노란 바탕)는 눈에 띄게, 제한 없음은 기본 흰 바탕
const CARD_STYLE: Record<Verdict, string> = {
  "제한 있음": "border-red-600 border-l-8 bg-red-100 dark:border-red-500 dark:bg-red-950",
  "확인 필요": "border-amber-600 border-l-8 bg-amber-100 dark:border-amber-500 dark:bg-amber-950",
  "제한 없음": "border-zinc-300 dark:border-zinc-700",
};

// 근거(원문 인용)와 판단 이유 — 펼친 카드와 제한 있음·확인 필요 카드가 함께 쓴다
function ZoneDetail({ item }: { item: ZoneResult }) {
  return (
    <>
      {item.laws?.length ? (
        <p className="mt-2 break-words text-base">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">관련 법률: </span>
          {item.laws.join(", ")}
        </p>
      ) : null}
      <div className="mt-2 text-base">
        <p className="font-medium text-zinc-700 dark:text-zinc-300">근거</p>
        {item.evidence.length === 0 ? (
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">{NO_EVIDENCE_TEXT}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-2">
            {item.evidence.map((evidence) => (
              <li key={evidence.id}>
                <p className="font-medium">
                  {evidence.source} {evidence.ref}
                </p>
                <blockquote className="mt-0.5 break-words border-l-4 border-zinc-300 pl-3 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
                  “{evidence.quote}”
                </blockquote>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-2 break-words text-base">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">판단 이유: </span>
        {item.reason}
      </p>
    </>
  );
}

// 첫째 줄: 지역·지구 이름 · 표기(포함·접함·저촉) · 근거 요약 … 오른쪽에 판정 배지
function CardHeader({ item, evidenceText }: { item: ZoneResult; evidenceText?: string }) {
  const relation = relationLabel({ name: item.zone, relation: item.relation });
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <p className="break-words font-semibold">
        {item.zone}
        <span className="ml-2 text-base font-normal text-zinc-600 dark:text-zinc-400">· {relation}</span>
        {evidenceText ? (
          <span className="ml-2 text-base font-normal text-zinc-600 dark:text-zinc-400">
            · <span className="font-medium text-zinc-700 dark:text-zinc-300">근거</span> {evidenceText}
          </span>
        ) : null}
      </p>
      <span className={`shrink-0 rounded-full border px-3 py-0.5 text-base font-bold ${VERDICT_STYLE[item.verdict]}`}>{item.verdict}</span>
    </div>
  );
}

// 판정 카드: 평소에는 첫째 줄에 이름·표기·근거, 둘째 줄에 이유를 보여 주고, 누르면 세부 내용(원문 인용 포함)을 펼친다.
// 인쇄할 때는 접혀 있어도 세부 내용이 모두 찍히게 한다 (hidden print:block).
function CollapsedCard({ item }: { item: ZoneResult }) {
  const [open, setOpen] = useState(false);
  const first = item.evidence[0];
  const extra = item.evidence.length - 1;
  const evidenceText = first ? `${first.source} ${first.ref}${extra > 0 ? ` 외 ${extra}건` : ""}` : NO_EVIDENCE_TEXT.replace(/^근거 /, ""); // "근거 근거 없음"으로 겹치지 않게 앞의 "근거 "를 뺀다
  const detailId = useId();

  return (
    <li className={`break-inside-avoid rounded-lg border ${CARD_STYLE[item.verdict]}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={detailId}
        className="flex w-full flex-col gap-1 rounded-lg px-4 py-3 text-left hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#445b9e] print:hover:brightness-100 dark:hover:brightness-110"
      >
        <CardHeader item={item} evidenceText={evidenceText} />
        {/* 둘째 줄: 이유 */}
        <span className="flex items-center gap-2 text-base text-zinc-600 print:hidden dark:text-zinc-400">
          <span className="truncate">
            {item.laws?.length ? (
              <>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">관련 법률</span> {item.laws.join(", ")}
                <span className="mx-2 text-zinc-400">·</span>
              </>
            ) : null}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">이유</span> {item.reason}
          </span>
          <span aria-hidden className="ml-auto shrink-0 text-sm font-semibold text-[#445b9e] print:hidden dark:text-blue-200">
            {open ? "접기 ▲" : "자세히 ▼"}
          </span>
        </span>
      </button>
      <div id={detailId} className={`px-4 pb-3 ${open ? "" : "hidden print:block"}`}>
        <ZoneDetail item={item} />
      </div>
    </li>
  );
}

// 모든 판정(제한 있음·확인 필요·제한 없음)을 한 줄로 줄여 보여 주고, 누르면 세부 내용을 펼친다.
function ZoneCard({ item }: { item: ZoneResult }) {
  return <CollapsedCard item={item} />;
}

export function CheckLoading({ count }: { count: number }) {
  return (
    <section aria-labelledby="check-title" className="flex flex-col gap-3">
      <h2 id="check-title" className="border-b-2 border-[#374c85] pb-2 text-2xl font-bold text-zinc-900 dark:border-blue-300 dark:text-zinc-100">
        ③ 매각제한 체크 결과
      </h2>
      <p role="status" className="text-base text-zinc-600 dark:text-zinc-400">
        지역·지구 {count}건을 근거 문서와 대조하는 중입니다… (몇 초 걸릴 수 있어요)
      </p>
    </section>
  );
}

// 결과 맨 위의 건수 요약. 매각 가능 여부는 판정하지 않고 건수만 보여 준다 (PRD Must ② 규칙 6).
function SummaryBar({ summary }: { summary: CheckSuccess["summary"] }) {
  return (
    <div className="break-inside-avoid rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-base text-zinc-600 dark:text-zinc-400">판정 요약</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {VERDICT_ORDER.map((verdict) => (
          <li key={verdict} className={`rounded-full border px-3 py-1 text-base font-bold ${VERDICT_STYLE[verdict]}`}>
            {verdict} {summary[verdict] ?? 0}건
          </li>
        ))}
      </ul>
    </div>
  );
}

// 기준일 목록의 문서 순서: 국유재산법, 시행령, 시행규칙, 국유재산 처분기준, 그 밖의 문서(업무요강 별표 6 → 개별 법률). 같은 순위는 서버가 준 순서를 유지한다.
const DOCUMENT_RANK = ["국유재산법", "국유재산법 시행령", "국유재산법 시행규칙", "국유재산 처분기준"];
function sortDocuments(documents: CheckSuccess["documents"]): CheckSuccess["documents"] {
  const rank = (name: string) => {
    const index = DOCUMENT_RANK.indexOf(name);
    return index >= 0 ? index : name.startsWith("수탁 국유일반재산") ? DOCUMENT_RANK.length : DOCUMENT_RANK.length + 1;
  };
  return [...documents].sort((x, y) => rank(x.name) - rank(y.name));
}

// 판정에 쓴 근거 문서와 문서별 기준일 (처분기준은 재정경제부 등록일, 법령은 시행일 — PRD Must ② 규칙 7)
function BaseDates({ documents }: { documents: CheckSuccess["documents"] }) {
  // 위의 승인 절차 안내와 같은 서술형 박스: "근거 문서 기준일: 국유재산법(2026-08-20, 시행일), 국유재산법 시행령(…), …"
  return (
    <p className="break-inside-avoid rounded-lg border border-yellow-400 bg-[#fffde7] px-4 py-3 text-base font-medium text-amber-900 dark:border-yellow-700 dark:bg-yellow-950 dark:text-amber-100">
      <span>⚠ 근거 문서 기준일: </span>
      {sortDocuments(documents).map((document, index) => (
        <span key={document.name}>
          {index > 0 ? ", " : ""}
          <span className="whitespace-nowrap">
            {document.name}({document.baseDate}, {document.basis})
          </span>
        </span>
      ))}
      . 이후에 개정된 내용은 반영되어 있지 않을 수 있습니다.
    </p>
  );
}

// 항상 보여 주는 안내 문구 (PRD Must ② 규칙 8·9). 근거 문서 기준일(규칙 7)은 "최종 판단과 책임은 담당자에게 있습니다" 바로 위에 둔다.
function Notices({ documents }: { documents: CheckSuccess["documents"] }) {
  return (
    <div className="flex break-inside-avoid flex-col gap-2">
      <p className="rounded-lg border border-yellow-400 bg-[#fffde7] px-4 py-3 text-base font-medium text-amber-900 dark:border-yellow-700 dark:bg-yellow-950 dark:text-amber-100">
        ⚠ 토지이용계획으로 확인할 수 없는 제한 사항(소송·점유 분쟁 등)은 별도로 확인해야 합니다.
      </p>
      <p className="rounded-lg border border-yellow-400 bg-[#fffde7] px-4 py-3 text-base font-medium text-amber-900 dark:border-yellow-700 dark:bg-yellow-950 dark:text-amber-100">
        ⚠ 매각 방법별 승인권자·절차(총괄청 승인, 검토위원회·심의위원회 심의 등)는 업무요강 별표 6(국유재산 처분승인기준)에서 별도로 확인해야 합니다.
      </p>
      <BaseDates documents={documents} />
      <p className="rounded-lg border border-zinc-400 bg-zinc-50 px-4 py-3 text-base font-bold dark:border-zinc-600 dark:bg-zinc-900">
        최종 판단과 책임은 담당자에게 있습니다.
      </p>
    </div>
  );
}

// 판정 서비스 오류·시간 초과로 일부 지역·지구를 자동 판정하지 못했을 때의 안내. 나머지 결과는 그대로 보여 주고 다시 시도할 수 있다.
function IncompleteNotice({ count, onRetry }: { count: number; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-lg border border-red-600 bg-red-50 px-4 py-3 text-base text-red-800 dark:bg-red-950 dark:text-red-200">
      <p className="font-medium">
        판정 서비스 오류로 {count}건은 자동 판정하지 못해 “확인 필요”로 표시했습니다. 나머지 결과는 그대로 사용할 수 있습니다.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-10 self-start rounded-lg border border-red-700 px-4 text-base font-semibold hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 print:hidden dark:hover:bg-red-900"
        >
          체크 다시 시도
        </button>
      )}
    </div>
  );
}

export function CheckResultList({ data, onRetry }: { data: CheckSuccess; onRetry?: () => void }) {
  return (
    <section aria-labelledby="check-title" className="flex flex-col gap-4">
      <h2 id="check-title" className="border-b-2 border-[#374c85] pb-2 text-2xl font-bold text-zinc-900 dark:border-blue-300 dark:text-zinc-100">
        ③ 매각제한 체크 결과
      </h2>
      {data.incomplete ? <IncompleteNotice count={data.incomplete} onRetry={onRetry} /> : null}
      <SummaryBar summary={data.summary} />
      <ul className="flex flex-col gap-3">
        {sortByVerdict(data.results).map((item) => (
          <ZoneCard key={item.zone} item={item} />
        ))}
      </ul>
      <Notices documents={data.documents} />
      {/* 검토 문서에 첨부할 수 있게 브라우저의 인쇄 기능을 연다. 인쇄할 때는 이 버튼도 숨겨진다. */}
      <button
        type="button"
        onClick={() => window.print()}
        className="min-h-12 self-start rounded-lg border border-blue-700 px-6 text-lg font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#445b9e] print:hidden dark:text-blue-300 dark:hover:bg-zinc-800"
      >
        인쇄 (Ctrl+P)
      </button>
    </section>
  );
}

// 판정이 실패하면 조회 결과(②)는 그대로 두고 판정만 다시 시도할 수 있게 한다 (DESIGN.md 6장 CHECK_ERROR)
export function CheckFailure({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const heading = error.error === "CHECK_ERROR" ? "체크 서비스 연결 오류" : "서비스 연결 오류";
  const detail = error.message.startsWith(`${heading}:`) ? error.message.slice(heading.length + 1).trim() : error.message;
  return (
    <section aria-labelledby="check-title" className="flex flex-col gap-3">
      <h2 id="check-title" className="border-b-2 border-[#374c85] pb-2 text-2xl font-bold text-zinc-900 dark:border-blue-300 dark:text-zinc-100">
        ③ 매각제한 체크 결과
      </h2>
      <p role="alert" className="rounded-lg border border-red-600 bg-red-50 px-4 py-3 text-base font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
        <span className="font-bold">{heading}</span>
        <br />
        {detail}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-12 self-start rounded-lg border border-blue-700 px-6 text-lg font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#445b9e] print:hidden dark:text-blue-300 dark:hover:bg-zinc-800"
      >
        체크 다시 시도
      </button>
    </section>
  );
}
