"use client";

// ① 지번 입력 영역: 입력창 + 조회 버튼 + 입력 오류 안내
// 기준: DESIGN.md 3장 화면 구성, 3.1 체크리스트 ①
import { useId, useState, type FormEvent } from "react";
import { checkParcel, type ParcelCheck } from "@/lib/parcel";

type Props = {
  // 지번 형식이 맞을 때만 호출된다. 정리된 지번과 조각을 넘겨 준다.
  onSubmit: (parcel: Extract<ParcelCheck, { ok: true }>) => void;
  busy?: boolean; // 조회 중이면 true (버튼을 잠그고 "조회 중…" 표시)
};

const EXAMPLE = "충청남도 공주시 우성면 동대리 산 12-3";

export default function ParcelForm({ onSubmit, busy = false }: Props) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const result = checkParcel(value);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    onSubmit(result);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 print:hidden">
      <label htmlFor={inputId} className="border-b-2 border-[#374c85] pb-2 text-2xl font-bold text-zinc-900 dark:border-blue-300 dark:text-zinc-100">
        ① 지번 입력
      </label>

      <div className="flex flex-col gap-3 border-y border-zinc-300 bg-[#f5f5f5] px-4 py-5 dark:border-zinc-600 dark:bg-zinc-900">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null); // 고쳐 쓰는 중에는 오류 표시를 지운다
          }}
          placeholder={EXAMPLE}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          className="min-h-12 flex-1 rounded-md border border-zinc-400 bg-white px-4 text-lg text-zinc-900 placeholder:text-zinc-400 focus:border-[#374c85] focus:outline-2 focus:outline-[#374c85] aria-[invalid=true]:border-red-600 dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded-md bg-[#445b9e] px-8 text-lg font-semibold text-white hover:bg-[#374c85] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#445b9e] disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {busy ? "조회 중…" : "조회"}
        </button>
      </div>

      <p id={hintId} className="text-base text-zinc-600 dark:text-zinc-400">
        형식: (시·도) 시·군·구 읍·면·동(리) (산) 본번-부번 — 예) {EXAMPLE}
        <br />
        시·도는 생략해도 됩니다(같은 지번이 여러 시·도에 있으면 선택하게 됩니다). 쓸 때는 정식 명칭으로 쓰고, 도로명주소는 입력할 수 없습니다.
      </p>

      {error && (
        <p id={errorId} role="alert" className="rounded-lg border border-red-600 bg-red-50 px-4 py-3 text-base font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
          입력 오류: {error}
        </p>
      )}
      </div>
    </form>
  );
}
