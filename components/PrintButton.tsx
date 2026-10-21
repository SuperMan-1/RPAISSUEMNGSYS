"use client";

/**
 * 브라우저 인쇄를 띄운다. 인쇄 대화상자에서 '대상'을 'PDF로 저장'으로 고르면
 * PDF 파일이 된다.
 *
 * 서버에서 PDF 를 직접 만들지 않는 이유는 한글 때문이다. 폰트 파일을 함께
 * 넣어야 하고(폐쇄망 반입·라이선스), Puppeteer 류는 Chromium 을 끌고 온다.
 * 인쇄는 의존성이 없고 한글이 완벽하다. 인쇄용 스타일은 globals.css 의
 * @media print 에 있다.
 */
export function PrintButton({
  className = "btn",
  children = "인쇄 · PDF",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {children}
    </button>
  );
}
