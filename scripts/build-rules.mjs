// 근거 정리본(data/rules/*.json) 생성 스크립트.
// source-docs/의 원문 텍스트(처분기준·국유재산법·시행령·시행규칙)를 조항 단위로 쪼개 JSON으로 저장한다.
// 사용법: node scripts/build-rules.mjs
// 앱 실행에는 쓰이지 않고, 원문이 바뀌었을 때 정리본을 다시 만들 때만 쓴다. (PLAN 작업 4)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SRC = "source-docs";
const OUT = "data/rules";
const RECEIVED = "2026-11-12받음";

// ---------- 공통 도구 ----------

// 제목에서 검색용 낱말을 뽑는다 (2글자 이상).
function titleKeywords(title) {
  return [...new Set(title.split(/[ㆍ·,()\s「」‘’“”]+/).filter((w) => w.length >= 2))];
}

// 법령 본문에 붙은 개정 이력 표시(<개정 2011. 3. 30.> 등)를 지운다.
function stripAmendmentTags(text) {
  return text.replace(/\s*<[^<>]*\d{4}\.[^<>]*>/g, "").replace(/[ \t]+/g, " ").trim();
}

// ---------- 국유재산법·시행령·시행규칙 ----------

const ARTICLE_HEAD = /^제(\d+)조(?:의(\d+))?\(([^)]*)\)\s*(.*)$/;
const DELETED_HEAD = /^제(\d+)조(?:의(\d+))?\s*삭제/;
const STRUCTURE_LINE = /^제\d+(장|절|관)(의\d+)?[\s<]/;
const HISTORY_LINE = /^\[(전문개정|본조신설|제목개정|본조삭제|종전|제\d+조)/;

function parseLaw({ file, idPrefix, name, baseDate, basis }) {
  const lines = readFileSync(`${SRC}/${file}`, "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => /^제1조\(목적\)/.test(l));
  const end = lines.findIndex((l, i) => i > start && /^제1조\(시행일\)/.test(l));
  if (start < 0 || end < 0) throw new Error(`${file}: 본문 범위를 찾지 못했습니다.`);

  // 본문 끝(부칙 직전)까지만 사용한다.
  const body = lines.slice(start, end).filter((l) => !/^부칙/.test(l));

  const rules = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const text = current.lines.map(stripAmendmentTags).filter(Boolean).join("\n");
    rules.push({
      id: current.id,
      source: name,
      ref: current.ref,
      title: current.title,
      text,
      keywords: titleKeywords(current.title),
      baseDate,
    });
    current = null;
  };

  for (const raw of body) {
    const line = raw.trim();
    if (!line) continue;
    if (STRUCTURE_LINE.test(line) || HISTORY_LINE.test(line)) continue;
    if (DELETED_HEAD.test(line)) {
      flush();
      continue;
    }
    const head = line.match(ARTICLE_HEAD);
    if (head) {
      flush();
      const [, n, m, title, rest] = head;
      current = {
        id: `${idPrefix}-${n}${m ? `-${m}` : ""}`,
        ref: `제${n}조${m ? `의${m}` : ""}`,
        title,
        lines: [rest],
      };
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();

  const ids = new Set();
  for (const r of rules) {
    if (ids.has(r.id)) throw new Error(`${file}: 중복 id ${r.id}`);
    ids.add(r.id);
  }
  return {
    document: { name, baseDate, basis, file: file.replace(/_20\d\d-\d\d-\d\d받음\.txt$/, ""), articles: rules.length },
    rules,
  };
}

// ---------- 처분기준 (PDF에서 뽑은 텍스트) ----------

// PDF는 글자 단위로 줄이 바뀌어 띄어쓰기가 어긋난다. 줄을 이을 때 한글 규칙으로 보정한다.
const ENDINGS = new Set("다며고여한된은는이가의를을에도만로와과서면지니면하");
const SINGLE_PARTICLES = new Set("는은의를을에이가도만로와과서며고다터");
function joinWrapped(lines) {
  let out = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    const prev = out[out.length - 1];
    const firstToken = line.split(/[\s.,;:)\]」’”]/)[0];
    const prevIsHangul = /[가-힣]/.test(prev);
    const nextIsHangul = /[가-힣]/.test(line[0]);
    if (/[(「｢‘“\[]$/.test(out) || /^[).,;:\]」’”]/.test(line)) out += line;
    else if (prevIsHangul && nextIsHangul && firstToken.length === 1 && SINGLE_PARTICLES.has(firstToken)) out += line;
    else if (prevIsHangul && nextIsHangul && !ENDINGS.has(prev)) out += line;
    else out += ` ${line}`;
  }
  return out;
}

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

// 처분기준 제4조 매각제한 사유별 검색 낱말 (토지이용계획의 지역·지구 이름과 맞추기 위함)
const GIJUN_KEYWORDS = {
  "gijun-3": ["매각의 일반원칙", "매각제한 대상", "부동산분과위원회", "매각승인"],
  "gijun-4-1": ["행정재산", "사용 승인", "관리전환", "행정목적", "중앙관서"],
  "gijun-4-2": [
    "다른 법률", "처분 제한", "국토의 계획 및 이용에 관한 법률", "용도지역", "용도지구", "개발제한구역",
    "도시계획시설", "도시자연공원구역", "군사기지", "군사시설보호구역", "문화재보호구역", "자연공원",
    "보전산지", "하천구역", "공공시설",
  ],
  "gijun-4-3": ["개발", "법 제57조", "위탁개발", "개발사업"],
  "gijun-4-4": ["비축", "장래 행정수요", "행정수요"],
  "gijun-4-5": ["분쟁", "소송", "점유", "사실상 분쟁", "소송상 분쟁"],
  "gijun-4-6": [
    "상수원관리지역", "상수원보호구역", "수변구역", "특별대책지역", "수계관리기금", "한강수계", "낙동강수계",
    "영산강수계", "금강수계", "상수원",
  ],
  "gijun-4-7": ["소유자 없는 부동산", "무주부동산", "공고", "10년"],
  "gijun-4-8": ["잔여 국유재산", "효용 감소", "일단의 토지", "분할"],
  "gijun-4-9": ["매각제한재산", "총괄청", "부동산분과위원회", "보존", "관리"],
  "gijun-4-10": ["취득과 처분의 균형", "총괄청", "처분 제한"],
  "gijun-4-hang2": ["하수처리구역", "도시지역", "상수원지역 국ㆍ공유지 매각제한 기준"],
  "gijun-4-hang4": ["법령", "불가피", "잔여 국유재산"],
  "gijun-5": ["고액", "100억원", "500억원", "심의", "국무회의"],
  "gijun-6": ["총괄청 승인", "일단의 토지", "수의계약", "면적", "대장가격"],
  "gijun-11": ["농지", "농업진흥지역", "수의계약", "실경작"],
};

// 제4조 호 항목의 짧은 제목 (원문 앞부분을 자르면 문장이 끊기므로 직접 붙인다)
const GIJUN_TITLES = {
  "gijun-4-1": "행정목적 사용 승인·관리전환 신청",
  "gijun-4-2": "다른 법률에 따른 처분 제한",
  "gijun-4-3": "법 제57조에 따른 개발 필요",
  "gijun-4-4": "장래 행정수요 대비 비축",
  "gijun-4-5": "사실상·소송상 분쟁",
  "gijun-4-6": "상수원관리지역 등 국유지",
  "gijun-4-7": "소유자 없는 부동산 취득 후 10년 미경과",
  "gijun-4-8": "잔여 국유재산의 효용 감소",
  "gijun-4-9": "총괄청·분과위원회가 정한 매각제한재산",
  "gijun-4-10": "취득과 처분의 균형을 위한 처분 제한",
  "gijun-4-hang3-1": "예외: 공익사업에 필요하게 된 경우",
  "gijun-4-hang3-2": "예외: 지적 정정 등으로 신규등록된 경우",
  "gijun-4-hang3-3": "예외: 소유자 없는 부동산을 취득한 행정재산을 용도 폐지한 경우",
  "gijun-4-hang3-4": "예외: 다른 법률에 따른 특정 사업목적 재산",
};

function parseGijun({ file, name, baseDate, basis }) {
  const all = readFileSync(`${SRC}/${file}`, "utf8").replace(/\f/g, "").split(/\r?\n/);
  const endIdx = all.findIndex((l) => /^\s*부칙/.test(l));
  const lines = all.slice(0, endIdx < 0 ? all.length : endIdx);

  // 조 단위로 나눈다.
  const articles = [];
  let cur = null;
  for (const raw of lines) {
    const head = raw.match(/^제(\d+)조\(([^)]*)\)\s*(.*)$/);
    if (head) {
      cur = { n: Number(head[1]), title: head[2], lines: [head[3]] };
      articles.push(cur);
    } else if (cur) {
      cur.lines.push(raw);
    }
  }

  // 항(①~⑩)과 호(1. 2. …)로 나눈다.
  const splitBlocks = (artLines) => {
    const blocks = []; // { kind: 'lead'|'hang'|'ho', no, lines }
    let block = { kind: "lead", no: 0, lines: [] };
    blocks.push(block);
    for (const raw of artLines) {
      const t = raw.trim();
      if (!t) continue;
      const hang = t.match(new RegExp(`^([${CIRCLED}])\\s*(.*)$`));
      const ho = raw.match(/^\s*(\d+)\.\s+(.*)$/);
      if (hang) {
        block = { kind: "hang", no: CIRCLED.indexOf(hang[1]) + 1, lines: [hang[2]] };
        blocks.push(block);
      } else if (ho) {
        block = { kind: "ho", no: Number(ho[1]), lines: [ho[2]] };
        blocks.push(block);
      } else {
        block.lines.push(t);
      }
    }
    return blocks.filter((b) => b.lines.some((l) => l.trim()));
  };

  const rules = [];
  const push = (id, ref, title, text, extra = []) =>
    rules.push({
      id,
      source: name,
      ref,
      title,
      text,
      keywords: [...new Set([...titleKeywords(title), ...(GIJUN_KEYWORDS[id] ?? []), ...extra])],
      baseDate,
    });

  for (const art of articles) {
    const blocks = splitBlocks(art.lines);
    if (art.n === 4) {
      // 제4조(매각의 제한)는 사유별로 쪼개서 근거로 바로 쓸 수 있게 한다.
      let hangNo = 0;
      let hangLead = "";
      for (const b of blocks) {
        if (b.kind === "hang") {
          hangNo = b.no;
          hangLead = joinWrapped(b.lines);
          if (hangNo !== 1 && !blocks.some((x) => x.kind === "ho" && x._hang === hangNo)) {
            // 호가 따로 없는 항(②, ④)은 항 전체를 한 항목으로 둔다 (③은 아래에서 호별로 만든다)
          }
        } else if (b.kind === "ho") {
          b._hang = hangNo;
        }
      }
      hangNo = 0;
      hangLead = "";
      let hangHasHo = {};
      for (const b of blocks) if (b.kind === "ho") hangHasHo[b._hang] = true;
      for (const b of blocks) {
        if (b.kind === "hang") {
          hangNo = b.no;
          hangLead = joinWrapped(b.lines);
          if (!hangHasHo[hangNo]) {
            push(`gijun-4-hang${hangNo}`, `제4조제${hangNo}항`, `매각의 제한 제${hangNo}항`, hangLead);
          }
        } else if (b.kind === "ho") {
          const hoText = joinWrapped(b.lines);
          const id = b._hang === 1 ? `gijun-4-${b.no}` : `gijun-4-hang${b._hang}-${b.no}`;
          const ref = `제4조제${b._hang}항제${b.no}호`;
          push(id, ref, GIJUN_TITLES[id] ?? ref, `${hangLead} ${hoText}`);
        }
      }
      continue;
    }
    // 나머지 조는 조 전체를 한 항목으로 둔다 (항·호는 줄바꿈으로 구분).
    const text = blocks
      .map((b) => {
        const mark = b.kind === "hang" ? `${CIRCLED[b.no - 1]} ` : b.kind === "ho" ? `${b.no}. ` : "";
        return mark + joinWrapped(b.lines);
      })
      .join("\n");
    push(`gijun-${art.n}`, `제${art.n}조`, art.title, text);
  }

  const ids = new Set();
  for (const r of rules) {
    if (ids.has(r.id)) throw new Error(`${file}: 중복 id ${r.id}`);
    ids.add(r.id);
  }
  return {
    document: {
      name,
      baseDate,
      basis,
      file: file.replace(/_2026-11-12받음\.txt$/, ""),
      articles: rules.length,
      note: "PDF 글자 단위 줄바꿈 때문에 일부 띄어쓰기·숫자와 단위의 순서가 원문과 다를 수 있다. 제3조·제4조는 원문과 대조해 확인했다.",
    },
    rules,
  };
}

// ---------- 실행 ----------

mkdirSync(OUT, { recursive: true });

const jobs = [
  {
    out: "gijun.json",
    build: () =>
      parseGijun({
        file: `국유재산처분기준_2026_${RECEIVED}.txt`,
        name: "국유재산 처분기준",
        baseDate: "2026-05-08",
        basis: "재정경제부 등록일",
      }),
  },
  {
    out: "beop.json",
    build: () =>
      parseLaw({
        file: `국유재산법_시행2026-08-20_${RECEIVED}.txt`,
        idPrefix: "beop",
        name: "국유재산법",
        baseDate: "2026-08-20",
        basis: "시행일",
      }),
  },
  {
    out: "sihaengryeong.json",
    build: () =>
      parseLaw({
        file: `국유재산법시행령_시행2026-08-20_${RECEIVED}.txt`,
        idPrefix: "ryeong",
        name: "국유재산법 시행령",
        baseDate: "2026-08-20",
        basis: "시행일",
      }),
  },
  {
    out: "sihaenggyuchik.json",
    build: () =>
      parseLaw({
        file: `국유재산법시행규칙_시행2026-01-02_${RECEIVED}.txt`,
        idPrefix: "gyuchik",
        name: "국유재산법 시행규칙",
        baseDate: "2026-01-02",
        basis: "시행일",
      }),
  },
];

for (const job of jobs) {
  const result = job.build();
  writeFileSync(`${OUT}/${job.out}`, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(`${job.out}: ${result.document.name} ${result.rules.length}개 항목 (기준일 ${result.document.baseDate})`);
}
