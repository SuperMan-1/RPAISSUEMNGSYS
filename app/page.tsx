import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function HomePage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>RPA 이슈관리</h1>
          <p className="sub">RPA 유지보수 이슈·정기점검 통합관리</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>설치 상태</h2>
          <span className={`badge ${configured ? "badge-ok" : "badge-warn"}`}>
            {configured ? "Supabase 연결 설정됨" : "Supabase 키 필요"}
          </span>
        </div>
        <div className="card-body">
          {configured ? (
            <p className="mb0">
              Supabase 연결 정보가 설정됐습니다. 다음 단계로 화면을 붙입니다.
            </p>
          ) : (
            <>
              <p style={{ marginTop: 0 }}>
                아직 Supabase 연결 정보가 없습니다. 아래 순서로 준비하면 됩니다.
              </p>
              <ol className="steps">
                <li>
                  Supabase에서 프로젝트를 만든다 (리전: <strong>Northeast Asia (Seoul)</strong>)
                </li>
                <li>
                  SQL Editor에서 <code>supabase/migrations/0001_init.sql</code> 실행
                </li>
                <li>
                  이어서 <code>supabase/seed.sql</code> 실행
                </li>
                <li>
                  <code>.env.example</code>을 <code>.env.local</code>로 복사하고 키 3개를 채운다
                </li>
                <li>
                  개발 서버를 다시 시작한다 (<code>npm run dev</code>)
                </li>
              </ol>
              <p className="help" style={{ marginTop: 12 }}>
                키는 Supabase 대시보드 → Project Settings → API 에서 복사합니다.
                <br />
                자세한 설계 내용은 <code>prod.md</code>를 참고하세요.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
