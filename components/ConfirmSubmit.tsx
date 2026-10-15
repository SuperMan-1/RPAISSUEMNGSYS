"use client";

export function ConfirmSubmit({
  message,
  className = "btn btn-sm",
  formAction,
  children,
}: {
  message: string;
  className?: string;
  /** 폼의 기본 action 대신 이 액션으로 제출한다 (한 폼에 저장·삭제를 같이 둘 때) */
  formAction?: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
