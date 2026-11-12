"use client";

// 첫 화면의 상태를 모아 두는 곳. ① 지번 입력 → ② 조회 결과 → ③ 체크 결과가 연결되어 있다.
// 조회·체크 요청에는 화면 쪽 제한 시간을 두어, 서버가 응답하지 않아도 화면이 "조회 중…"에 멈추지 않게 한다.
import { useRef, useState } from "react";
import ParcelForm from "@/app/components/ParcelForm";
import { LandUseFailure, LandUseResult, SidoChooser } from "@/app/components/LandUseResult";
import { CheckFailure, CheckLoading, CheckResultList } from "@/app/components/CheckResult";
import { checkParcel, type ParcelCheck } from "@/lib/parcel";
import type { ApiError, CheckResponse, CheckSuccess, LandUseResponse, LandUseSuccess, SidoChoice } from "@/lib/types";
import { ERROR_MESSAGES } from "@/lib/types";

type ValidParcel = Extract<ParcelCheck, { ok: true }>;

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: LandUseSuccess }
  | { kind: "choose"; parcel: ValidParcel; choices: SidoChoice[] } // 같은 지번이 여러 시·도에 있어 시·도를 고르는 중
  | { kind: "failure"; error: ApiError };

type CheckState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: CheckSuccess }
  | { kind: "failure"; error: ApiError };

const SERVICE_FAILURE: ApiError = { ok: false, error: "SERVICE_ERROR", message: ERROR_MESSAGES.SERVICE_ERROR };
// 판정 단계의 실패는 조회와 다른 안내("체크 서비스 연결 오류")를 보여 준다 (DESIGN.md 6장)
const CHECK_FAILURE: ApiError = { ok: false, error: "CHECK_ERROR", message: ERROR_MESSAGES.CHECK_ERROR };
// 서버의 최대 실행 시간(조회 30초, 판정 60초)보다 조금 길게 잡은 화면 쪽 제한 시간
const LOOKUP_TIMEOUT_MS = 40_000;
const CHECK_TIMEOUT_MS = 75_000;

export default function ParcelSearch() {
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });
  const lookupController = useRef<AbortController | null>(null);
  const checkController = useRef<AbortController | null>(null);

  // ② 조회: 새 조회를 시작하면 앞선 조회와 체크는 모두 취소하고 지운다
  async function search(parcel: ValidParcel) {
    lookupController.current?.abort();
    checkController.current?.abort();
    const controller = new AbortController();
    lookupController.current = controller;

    setCheck({ kind: "idle" });
    setLookup({ kind: "loading" });
    try {
      const response = await fetch("/api/land-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parcel: parcel.normalized }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(LOOKUP_TIMEOUT_MS)]),
      });
      const body = (await response.json()) as LandUseResponse;
      if (controller.signal.aborted) return;
      if (body.ok) setLookup({ kind: "success", data: body });
      else if (body.error === "CHOOSE_SIDO") setLookup({ kind: "choose", parcel, choices: body.choices });
      else setLookup({ kind: "failure", error: body });
    } catch {
      if (controller.signal.aborted) return; // 새 조회로 바뀐 경우
      setLookup({ kind: "failure", error: SERVICE_FAILURE });
    }
  }

  // 시·도를 생략해 같은 지번이 여러 시·도에서 나왔을 때: 고른 시·도를 붙여 다시 조회한다
  function chooseSido(sido: string, parcel: ValidParcel) {
    const next = checkParcel(`${sido} ${parcel.normalized}`);
    if (next.ok) void search(next);
  }

  // ③ 체크: 담당자가 필지를 확인한 뒤에만 시작한다. 조회된 주소와 지역·지구 목록을 판정 API로 보낸다.
  async function startCheck(data: LandUseSuccess) {
    checkController.current?.abort();
    const controller = new AbortController();
    checkController.current = controller;

    setCheck({ kind: "loading" });
    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // token: 조회 API가 이 목록에 서명한 값. 서버가 실제로 조회한 목록만 판정하게 한다.
        body: JSON.stringify({ address: data.address, zones: data.zones, token: data.token }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(CHECK_TIMEOUT_MS)]),
      });
      const body = (await response.json()) as CheckResponse;
      if (controller.signal.aborted) return;
      setCheck(body.ok ? { kind: "success", data: body } : { kind: "failure", error: body });
    } catch {
      if (controller.signal.aborted) return; // 새 조회로 바뀐 경우
      setCheck({ kind: "failure", error: CHECK_FAILURE });
    }
  }

  const checkStarted = check.kind === "loading" || check.kind === "success";

  return (
    <div className="flex flex-col gap-8">
      <ParcelForm onSubmit={search} busy={lookup.kind === "loading"} />

      <div aria-live="polite" className="flex flex-col gap-8">
        {lookup.kind === "loading" && <p className="text-base text-zinc-600 print:hidden dark:text-zinc-400">토지이용계획을 조회하는 중입니다…</p>}

        {lookup.kind === "failure" && <LandUseFailure error={lookup.error} />}

        {lookup.kind === "choose" && <SidoChooser choices={lookup.choices} onChoose={(sido) => chooseSido(sido, lookup.parcel)} />}

        {lookup.kind === "success" && (
          <>
            <LandUseResult data={lookup.data} confirmed={checkStarted} onConfirm={() => startCheck(lookup.data)} />

            {check.kind === "loading" && <CheckLoading count={lookup.data.zones.length} />}
            {check.kind === "failure" && <CheckFailure error={check.error} onRetry={() => startCheck(lookup.data)} />}
            {check.kind === "success" && <CheckResultList data={check.data} onRetry={() => startCheck(lookup.data)} />}
          </>
        )}
      </div>
    </div>
  );
}
