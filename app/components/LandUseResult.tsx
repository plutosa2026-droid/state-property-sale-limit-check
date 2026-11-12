"use client";

// ② 조회 결과 영역: 전체 주소·조회 시각·지역·지구 목록·"맞음 — 체크 시작" 버튼, 조회 실패 안내
// 기준: DESIGN.md 3장 화면 구성, 3.1 체크리스트 ②, PRD Must ① 규칙 2~5
import { countRelations, formatKoreaTime, relationLabel, type RelationLabel } from "@/lib/zones";
import type { ApiError, LandUseSuccess, SidoChoice } from "@/lib/types";

// 표기별 색과 글자 (색만으로 구분하지 않도록 글자를 항상 함께 보여 준다)
const BADGE_STYLE: Record<RelationLabel, string> = {
  저촉: "border-red-700 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
  접함: "border-amber-700 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  포함: "border-zinc-500 bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
  "표기 없음": "border-purple-700 bg-purple-50 text-purple-900 dark:bg-purple-950 dark:text-purple-100",
};

type SuccessProps = {
  data: LandUseSuccess;
  confirmed: boolean; // 담당자가 필지를 확인하고 "체크 시작"을 눌렀는지
  onConfirm: () => void;
};

export function LandUseResult({ data, confirmed, onConfirm }: SuccessProps) {
  const counts = countRelations(data.zones);

  return (
    <section aria-labelledby="land-use-title" className="flex flex-col gap-4">
      <h2 id="land-use-title" className="border-b-2 border-[#374c85] pb-2 text-2xl font-bold text-zinc-900 dark:border-blue-300 dark:text-zinc-100">
        ② 조회 결과
      </h2>

      {/* 조회된 주소 박스 안에 이 필지의 지역·지구도 함께 보여 준다 */}
      <div className="border-y border-zinc-300 bg-[#f5f5f5] px-4 py-4 dark:border-zinc-600 dark:bg-zinc-900">
        <p className="text-base text-zinc-600 dark:text-zinc-400">조회된 주소 (공공 API 기준)</p>
        <p className="mt-1 break-words text-xl font-bold sm:text-2xl">{data.address}</p>
        <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">조회 시각: {formatKoreaTime(data.queriedAt)}</p>

        <div className="mt-4 border-t border-zinc-300 pt-4 dark:border-zinc-600">
          <p className="font-medium">
            지역·지구 {data.zones.length}건
            <span className="ml-2 text-base font-normal text-zinc-600 dark:text-zinc-400">
              (저촉 {counts.저촉} · 접함 {counts.접함} · 포함 {counts.포함}
              {counts["표기 없음"] > 0 ? ` · 표기 없음 ${counts["표기 없음"]}` : ""})
            </span>
          </p>
          {/* 지역·지구는 박스(칸)로 압축해 한눈에 보이게 한다: 이름 아래에 표기(포함·접함·저촉)를 둔다 */}
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.zones.map((zone) => {
              const label = relationLabel(zone);
              return (
                <li
                  key={zone.name}
                  className="flex break-inside-avoid flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <span className="break-keep text-base font-medium leading-snug">{zone.name}</span>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0 text-sm font-semibold ${BADGE_STYLE[label]}`}>{label}</span>
                  {/* 근거 법률(토지이용규제 기본법 별표 기준). 별표에 없는 지역·지구는 "확인 필요"로 표시한다 */}
                  <span className="basis-full break-keep text-sm leading-snug text-zinc-600 dark:text-zinc-400">
                    관련 법률: {data.laws?.[zone.name]?.length ? data.laws[zone.name].join(", ") : "별표에 없음(확인 필요)"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-2 print:hidden">
        <p className="text-base text-zinc-700 dark:text-zinc-300">위 주소가 매각을 검토하려는 필지가 맞는지 확인한 뒤, 체크를 시작해 주세요.</p>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmed}
          className="min-h-12 self-start rounded-lg bg-[#445b9e] px-6 text-lg font-semibold text-white hover:bg-[#374c85] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#445b9e] disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {confirmed ? "체크 시작함" : "맞음 — 체크 시작"}
        </button>
      </div>
    </section>
  );
}

// 시·도를 생략했는데 같은 지번이 여러 시·도에 있을 때: 어느 시·도인지 고르게 한다. 고르기 전에는 체크로 넘어가지 않는다.
export function SidoChooser({ choices, onChoose }: { choices: SidoChoice[]; onChoose: (sido: string) => void }) {
  return (
    <section aria-labelledby="land-use-title" className="flex flex-col gap-3">
      <h2 id="land-use-title" className="border-b-2 border-[#374c85] pb-2 text-2xl font-bold text-zinc-900 dark:border-blue-300 dark:text-zinc-100">
        ② 조회 결과
      </h2>
      <div className="border-y border-zinc-300 bg-[#f5f5f5] px-4 py-4 dark:border-zinc-600 dark:bg-zinc-900">
        <p role="status" className="text-lg font-bold">같은 지번이 여러 시·도에 있습니다. 시·도를 선택해 주세요.</p>
        <ul className="mt-3 flex flex-col gap-2">
          {choices.map((choice) => (
            <li key={choice.address}>
              <button
                type="button"
                onClick={() => onChoose(choice.sido)}
                className="flex min-h-12 w-full flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-400 bg-white px-4 py-2 text-left text-lg hover:border-[#445b9e] hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#445b9e] dark:bg-zinc-950 dark:hover:bg-zinc-800"
              >
                <span className="font-medium">{choice.address}</span>
                <span className="rounded-md bg-[#445b9e] px-3 py-0.5 text-base font-semibold text-white">{choice.sido} 선택</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// 조회 실패 안내. 실패하면 ③ 체크 단계로 넘어가지 않는다 (PRD Must ① 규칙 2).
export function LandUseFailure({ error }: { error: ApiError }) {
  const title: Record<ApiError["error"], string> = {
    INPUT_INVALID: "입력 오류",
    NOT_FOUND: "조회 결과 없음",
    SERVICE_ERROR: "서비스 연결 오류",
    CHECK_ERROR: "체크 서비스 연결 오류",
  };
  // 서버 문구가 "조회 결과 없음: …"처럼 제목과 같은 말로 시작하면 중복되지 않게 뒷부분만 보여 준다.
  const heading = title[error.error];
  const detail = error.message.startsWith(`${heading}:`) ? error.message.slice(heading.length + 1).trim() : error.message;
  return (
    <section aria-labelledby="land-use-title" className="flex flex-col gap-3">
      <h2 id="land-use-title" className="border-b-2 border-[#374c85] pb-2 text-2xl font-bold text-zinc-900 dark:border-blue-300 dark:text-zinc-100">
        ② 조회 결과
      </h2>
      <p role="alert" className="rounded-lg border border-red-600 bg-red-50 px-4 py-3 text-base font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
        <span className="font-bold">{heading}</span>
        <br />
        {detail}
      </p>
      <p className="text-base text-zinc-600 dark:text-zinc-400">체크는 조회가 성공한 뒤에만 시작할 수 있습니다.</p>
    </section>
  );
}
