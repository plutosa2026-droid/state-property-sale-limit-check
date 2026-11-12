// 국가법령정보센터 법령 본문(HTML)에서 글자만 뽑아 텍스트 파일로 저장하는 일회용 스크립트.
// 사용법: node scripts/law-html-to-text.mjs <입력.html> <출력.txt>
// 근거 정리본(PLAN 작업 4)을 만들 때 법령 원문을 읽기 위한 도구이며, 앱 실행에는 쓰이지 않는다.
import { readFileSync, writeFileSync } from "node:fs";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("사용법: node scripts/law-html-to-text.mjs <입력.html> <출력.txt>");
  process.exit(1);
}

const entities = { "&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&middot;": "·", "&ldquo;": "“", "&rdquo;": "”" };

const html = readFileSync(inputPath, "utf8")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)[^>]*>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&[a-z]+;|&#39;/gi, (e) => entities[e] ?? e);

const text = html
  .split("\n")
  .map((line) => line.replace(/\s+/g, " ").trim())
  .filter((line) => line.length > 0)
  .join("\n");

writeFileSync(outputPath, text, "utf8");
console.log(`변환 완료: ${text.length}자 → ${outputPath}`);
