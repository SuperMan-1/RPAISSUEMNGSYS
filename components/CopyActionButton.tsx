"use client";

/**
 * 유사 이슈의 처리 내용을 지금 작성 중인 입력란에 붙여 넣는다.
 *
 * 대상 textarea 는 비제어(defaultValue)로 두고 DOM 을 직접 건드린다.
 * 사용자가 이미 쓰던 내용은 지우지 않고 아래에 덧붙인다.
 */
export function CopyActionButton({
  targetId,
  content,
  reference,
}: {
  targetId: string;
  content: string;
  reference: string;
}) {
  function handleClick() {
    const el = document.getElementById(targetId);
    if (!(el instanceof HTMLTextAreaElement)) return;

    const existing = el.value.trimEnd();
    const prefix = existing ? `${existing}\n\n` : "";
    el.value = `${prefix}[${reference} 참고]\n${content}`;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  return (
    <button type="button" className="btn btn-sm" onClick={handleClick}>
      처리내용 가져오기
    </button>
  );
}
