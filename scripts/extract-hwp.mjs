// 한글(HWP 5.x) 파일에서 본문 글자만 뽑아 텍스트 파일로 저장하는 일회용 스크립트.
// 사용법: node scripts/extract-hwp.mjs <입력.hwp> <출력.txt>
// 근거 정리본(PLAN 작업 4)을 만들 때 원문을 읽기 위한 도구이며, 앱 실행에는 쓰이지 않는다.
import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import CFB from "cfb";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("사용법: node scripts/extract-hwp.mjs <입력.hwp> <출력.txt>");
  process.exit(1);
}

const container = CFB.read(readFileSync(inputPath), { type: "buffer" });

// 파일 머리말: 36번째 바이트의 첫 비트가 1이면 본문이 압축되어 있다.
const header = CFB.find(container, "/FileHeader");
if (!header) throw new Error("HWP 5.x 형식이 아닙니다 (FileHeader 없음).");
const isCompressed = (Buffer.from(header.content)[36] & 1) === 1;
const isEncrypted = (Buffer.from(header.content)[36] & 2) === 2;
if (isEncrypted) throw new Error("암호가 걸린 파일이라 읽을 수 없습니다.");

// 본문 구역(Section0, Section1, ...)을 순서대로 읽는다.
const sections = container.FullPaths.filter((p) => /\/BodyText\/Section\d+$/.test(p)).sort(
  (a, b) => Number(a.match(/(\d+)$/)[1]) - Number(b.match(/(\d+)$/)[1]),
);

const PARA_TEXT_TAG = 67; // HWPTAG_PARA_TEXT: 문단 글자
const lines = [];

for (const path of sections) {
  let data = Buffer.from(CFB.find(container, path).content);
  if (isCompressed) data = inflateRawSync(data);

  let offset = 0;
  while (offset + 4 <= data.length) {
    const recordHeader = data.readUInt32LE(offset);
    offset += 4;
    const tag = recordHeader & 0x3ff;
    let size = (recordHeader >>> 20) & 0xfff;
    if (size === 0xfff) {
      size = data.readUInt32LE(offset);
      offset += 4;
    }
    if (tag === PARA_TEXT_TAG) {
      lines.push(decodeParagraph(data.subarray(offset, offset + size)));
    }
    offset += size;
  }
}

// 문단 글자 해석: 2바이트 단위로 읽고, 제어 문자는 건너뛴다.
function decodeParagraph(buffer) {
  let text = "";
  for (let i = 0; i + 1 < buffer.length; i += 2) {
    const code = buffer.readUInt16LE(i);
    if (code >= 32) {
      text += String.fromCharCode(code);
    } else if (code === 9) {
      text += "\t";
    } else if ([1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].includes(code)) {
      i += 14; // 확장 제어(표, 그림 등)는 뒤에 14바이트가 더 붙는다
    } else if (code === 10 || code === 13) {
      text += "\n";
    }
  }
  return text.trim();
}

const result = lines.filter((line) => line.length > 0).join("\n");
writeFileSync(outputPath, result, "utf8");
console.log(`글자 추출 완료: ${lines.length}개 문단, ${result.length}자 → ${outputPath}`);
