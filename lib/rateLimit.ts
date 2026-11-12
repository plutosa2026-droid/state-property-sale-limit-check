// 호출 횟수 제한: 같은 사용자(주소)가 정해진 시간 안에 너무 많이 부르면 막는다. 순수 계산만 하므로 시험하기 쉽다.
// 서버가 여러 개로 나뉘어 돌아가는 환경(Vercel)에서는 서버마다 따로 세기 때문에 "완벽한 차단"이 아니라 "남용 완화" 장치다.
export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function createLimiter(max: number, windowMs: number, now: () => number = () => Date.now()) {
  const hits = new Map<string, number[]>(); // 사용자 → 최근 호출 시각들

  return function hit(key: string): LimitResult {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((time) => t - time < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (t - recent[0])) / 1000)) };
    }
    recent.push(t);
    hits.set(key, recent);

    // 메모리가 계속 늘지 않도록 가끔 오래된 사용자 기록을 정리한다
    if (hits.size > 5000) {
      for (const [k, times] of hits) if (times.every((time) => t - time >= windowMs)) hits.delete(k);
    }
    return { ok: true };
  };
}
