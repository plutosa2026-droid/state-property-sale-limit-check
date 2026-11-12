import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// 캠코 홈페이지와 같은 Noto Sans KR 글꼴
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "국유재산 매각 법률제한 자동체크",
  description: "국유재산 지번을 입력하면 토지이용계획의 지역·지구별 매각제한 여부를 근거와 함께 확인해 주는 도우미 (PoC)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
