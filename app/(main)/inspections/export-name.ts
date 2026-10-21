/**
 * 다운로드 파일 이름을 Content-Disposition 헤더로 만든다.
 *
 * 한글 파일명은 헤더에 그대로 넣을 수 없다(ASCII 만 허용). RFC 5987 의
 * filename* 로 UTF-8 인코딩해 보내고, 그걸 못 읽는 옛 브라우저를 위해
 * ASCII 로 걸러낸 이름을 filename 에 함께 둔다.
 */
export function attachmentName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
