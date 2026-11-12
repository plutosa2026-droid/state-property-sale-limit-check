// 법제처 API 응답 구조를 한 번 살펴보는 일회용 스크립트. 사용법: node --env-file=.env scripts/law-api-probe.mjs <법령명>
const OC = process.env.LAW_OC;
const name = process.argv[2] ?? "수도권정비계획법";
const s = await (await fetch(`https://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=law&type=JSON&query=${encodeURIComponent(name)}`)).json();
const list = [s.LawSearch.law].flat();
console.log(list.map((l) => `${l["법령명한글"]} | MST ${l["법령일련번호"]} | 시행 ${l["시행일자"]} | ${l["현행연혁코드"]}`).join("\n"));
const mst = list.find((l) => l["법령명한글"] === name)?.["법령일련번호"];
const d = await (await fetch(`https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=law&type=JSON&MST=${mst}`)).json();
const law = d["법령"];
console.log(Object.keys(law).join(","), "| 기본정보:", Object.keys(law["기본정보"]).join(","));
const arts = [law["조문"]["조문단위"]].flat();
console.log("조문수", arts.length, JSON.stringify(arts[1]).slice(0, 900));
