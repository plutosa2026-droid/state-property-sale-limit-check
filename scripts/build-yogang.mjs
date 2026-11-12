// 업무요강 별표 6(국유재산 처분승인기준) 정리본(data/rules/yogang.json) 생성 스크립트.
// 사용법: node scripts/build-yogang.mjs   (앱 실행에는 쓰이지 않고, 원문이 바뀌었을 때 다시 만들 때만 쓴다)
// 원문: source-docs/수탁국유일반재산관리처분업무요강_2026-01-29.txt (캠코 홈페이지 현행내규, 2026.1.28. 개정)
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "source-docs/수탁국유일반재산관리처분업무요강_2026-01-29.txt";
const NAME = "수탁 국유일반재산 관리·처분 업무요강 별표 6(국유재산 처분승인기준)";
const BASE_DATE = "2026-01-28";
const lines = readFileSync(SRC, "utf8").split(/\r?\n/).map((l) => l.trim());

const start = lines.findIndex((l) => l.startsWith("[별표 6]"));
const end = lines.findIndex((l, i) => i > start && l.startsWith("[별표 7]"));
if (start < 0 || end < 0) throw new Error("별표 6 범위를 찾지 못했습니다.");
const body = lines.slice(start, end);

const rules = [];
const add = (id, ref, title, text) =>
  rules.push({ id, source: NAME, ref, title, text, keywords: title.split(/[ㆍ·,()\s「」‘’“”]+/).filter((w) => w.length >= 2), baseDate: BASE_DATE });

// 1) 머리말: 총괄청 승인사항·심의 대상 (표 앞부분)
const tableAt = body.findIndex((l) => l === "□ 매각 심의대상");
const head = body.slice(0, tableAt).filter((l) => l && l !== "-  -" && !/^(→|부점장|감정평가|심의위원회|\(외부\)|총괄청 승인|국유심|심의|국무회의|의결|국회 보고|감정가|10억 원 (이상|미만)|50억 원 이상|300억 원 이상|부점장\+검토위원회\(내부\)|\(처분기준\))$/.test(l));
add("yogang-b6-head", "별표 6 머리말", "총괄청 승인사항과 심의 대상", head.slice(1).join("\n"));

// 2) 처분 유형별 행: 코드 줄(예: 40-3-18-아, 40-3-27(가), 6-3)에서 시작해 첫 "O"/"X" 줄 앞까지가 처분 유형 설명
const CODE = /^\d+-\d+(?:-\d+)?(?:-[가-하])?(?:\([가-하]\))?$/;
for (let i = tableAt; i < body.length; i++) {
  if (!CODE.test(body[i])) continue;
  const code = body[i];
  const desc = [];
  let j = i + 1;
  while (j < body.length && !/^(O|X|-)$/.test(body[j]) && !CODE.test(body[j]) && body[j] !== "매각") desc.push(body[j++]);
  const text = desc.join("\n").trim();
  if (!text || /^삭제/.test(text)) continue; // 삭제된 행은 근거로 쓰지 않는다
  const title = text.split("\n")[0].replace(/^\([^)]*\)\s*/, "").slice(0, 60);
  add(`yogang-b6-${code.replace(/[()]/g, "")}`, `처분승인기준 ${code}`, title, text);
}

const result = {
  document: { name: NAME, baseDate: BASE_DATE, basis: "개정일", file: "수탁국유일반재산관리처분업무요강_2026-01-29", articles: rules.length, note: "별표 6은 처분 유형별 승인권자·절차를 정한 표다. 표의 O/X·금액 기준 칸은 담지 않고 처분 유형 설명만 담았다." },
  rules,
};
writeFileSync("data/rules/yogang.json", JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(`yogang.json: ${rules.length}개 항목`);
console.log(rules.map((r) => `${r.id} | ${r.title}`).join("\n"));
