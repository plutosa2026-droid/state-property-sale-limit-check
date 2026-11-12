// 남용 방지 장치(lib/token.ts, lib/rateLimit.ts)를 서버 없이 시험하는 스크립트.
// 사용법: node scripts/check-guard.mjs
import { createLimiter } from "../lib/rateLimit.ts";
import { deriveSecret, signLookup, verifyLookup } from "../lib/token.ts";

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` → ${detail}` : ""}`);
};

// ---------- 조회 결과 서명 토큰 ----------
const secret = deriveSecret(["앱비밀", "openai-key", "vworld-key"]);
const address = "대전광역시 서구 둔산동 1000";
const zones = [{ name: "준주거지역", relation: "포함" }, { name: "보행자전용도로", relation: "저촉" }];
const now = 1_800_000_000;
const token = signLookup(secret, address, zones, now);
// 값을 일부러 undefined/null로 넣는 시험도 있어서, 항목이 '있는지'로 판단한다
const pick = (over, key, fallback) => (key in over ? over[key] : fallback);
const verify = (over = {}) => verifyLookup(pick(over, "secret", secret), pick(over, "token", token), pick(over, "address", address), pick(over, "zones", zones), pick(over, "now", now + 60), pick(over, "maxAge", 1800));

check("같은 목록·같은 키: 통과", verify());
check("토큰은 '발급 시각.서명' 모양", /^\d+\.[A-Za-z0-9_-]+$/.test(token), token);
check("주소가 한 글자 다르면 실패", !verify({ address: address + " " }));
check("지역·지구 이름이 다르면 실패", !verify({ zones: [{ name: "개발제한구역", relation: "포함" }, zones[1]] }));
check("표기(포함/저촉)가 다르면 실패 (저촉을 포함으로 바꿔치기)", !verify({ zones: [zones[0], { ...zones[1], relation: "포함" }] }));
check("지역·지구가 하나 늘면 실패", !verify({ zones: [...zones, { name: "추가", relation: "포함" }] }));
check("지역·지구가 하나 빠지면 실패", !verify({ zones: [zones[0]] }));
check("순서가 바뀌면 실패", !verify({ zones: [zones[1], zones[0]] }));
check("다른 서명 키(키가 바뀜)면 실패", !verify({ secret: deriveSecret(["앱비밀", "다른키", "vworld-key"]) }));
check("서명 부분을 바꾸면 실패", !verify({ token: token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA") }));
check("발급 시각만 바꿔서는 통과하지 못함", !verify({ token: `${now + 10}.${token.split(".")[1]}` }));
check("30분(1800초)이 넘으면 만료", !verify({ now: now + 1801 }));
check("정확히 만료 직전(1800초)은 통과", verify({ now: now + 1800 }));
check("미래 시각으로 발급된 토큰은 실패", !verify({ now: now - 3600 }));
for (const bad of ["", ".", "abc", "x.y", undefined, null, 123, {}, "1800000000."]) check(`엉뚱한 토큰 값(${JSON.stringify(bad)})은 실패하고 오류도 나지 않음`, !verify({ token: bad }));
check("서명 키 조각이 다르면 서로 다른 키", deriveSecret(["a", "b"]) !== deriveSecret(["a", "c"]) && deriveSecret(["a", "b"]) !== deriveSecret(["ab"]));

// ---------- 호출 횟수 제한 ----------
let clock = 1_000_000;
const limiter = createLimiter(3, 60_000, () => clock);
check("제한 안(1~3번째)은 통과", limiter("사용자A").ok && limiter("사용자A").ok && limiter("사용자A").ok);
const blocked = limiter("사용자A");
check("4번째는 막히고 다시 시도할 초가 나옴", !blocked.ok && blocked.retryAfterSec >= 1 && blocked.retryAfterSec <= 60, JSON.stringify(blocked));
check("다른 사용자는 영향 없음", limiter("사용자B").ok);
clock += 30_000;
check("30초 뒤에도 아직 막힘", !limiter("사용자A").ok);
clock += 31_000;
check("1분이 지나면 다시 통과 (창이 지나감)", limiter("사용자A").ok);
const slide = createLimiter(2, 10_000, () => clock);
slide("s"); clock += 6_000; slide("s"); clock += 5_000; // 첫 호출은 11초 전 → 빠짐
check("창이 미끄러지며 오래된 호출만 빠짐", slide("s").ok && !slide("s").ok);
check("막힌 호출은 횟수에 더해지지 않음(계속 눌러도 풀리는 시각이 밀리지 않음)", (() => { limiter("사용자C"); limiter("사용자C"); limiter("사용자C"); const a = limiter("사용자C"); clock += 10_000; const b = limiter("사용자C"); return !a.ok && !b.ok && b.retryAfterSec < a.retryAfterSec; })());

console.log(failed === 0 ? "\n통과" : `\n실패: ${failed}개`);
process.exitCode = failed === 0 ? 0 : 1;
