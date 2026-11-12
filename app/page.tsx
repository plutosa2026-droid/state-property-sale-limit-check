import ParcelSearch from "@/app/components/ParcelSearch";

// 화면 구성은 캠코국유재산포털(gpminwon.kamco.or.kr)을 따른다: 흰 상단 바 + 짙은 파란 배너(제목) + 흰 본문 + 연한 회색 입력·결과 영역.
// 인쇄할 때는 배너가 사라지고 제목만 남는다.
export default function Home() {
  return (
    <>
      <div className="border-b border-zinc-300 bg-white print:hidden dark:border-zinc-700 dark:bg-zinc-950">
        <p className="mx-auto max-w-5xl px-4 py-3 text-lg font-bold text-[#1f3f8f] sm:px-6 dark:text-blue-200">국유재산 매각 검토 도우미</p>
      </div>

      {/* 배경 사진은 캠코국유재산포털 배너 이미지(public/hero-bg.jpg). 글자가 잘 읽히게 남색 막을 덮는다. */}
      <header
        className="bg-[#1b2a52] bg-cover bg-center px-4 py-6 text-center text-white sm:px-6 sm:py-8 print:bg-none print:bg-white print:py-0 print:text-black"
        style={{ backgroundImage: "linear-gradient(rgba(27,42,82,0.62), rgba(27,42,82,0.72)), url(/hero-bg.jpg)" }}
      >
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">국유재산 매각 법률제한 자동체크</h1>
        <p className="mx-auto mt-2 max-w-3xl break-keep text-lg text-blue-100 print:hidden">
          지번입력시 토지이용계획과 관련 법률을 비교하여 매각제한 사항을 표시해 드립니다.
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <ParcelSearch />
      </main>

      <footer className="border-t border-zinc-300 bg-[#f3f3f3] px-4 py-5 text-center text-base text-zinc-700 print:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        <p>토지이용계획으로 확인할 수 없는 제한 사항은 별도로 확인해야 하며, 최종 판단과 책임은 담당자에게 있습니다.</p>
      </footer>
    </>
  );
}
