/**
 * 로그인 화면 자리.
 *
 * 미들웨어가 로그인하지 않은 접근을 여기로 보낸다.
 * 실제 Supabase Auth 연동 폼은 다음 단계에서 붙인다.
 */

export default function LoginPage() {
  return (
    <main className="login-wrap">
      <div className="login-box">
        <h1>RPA 이슈관리</h1>
        <p className="sub">사내 RPA 유지보수 이슈 통합관리</p>

        <div className="flash flash-warn">
          로그인 화면은 아직 준비 중입니다.
        </div>

        <p className="small dim mb0">
          Supabase 연결 정보를 <code>.env.local</code>에 채우면 이메일·비밀번호 로그인이
          연결됩니다.
        </p>
      </div>
    </main>
  );
}
