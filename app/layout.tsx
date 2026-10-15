import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "RPA 이슈관리",
  description: "RPA 유지보수 이슈·정기점검 통합관리",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
