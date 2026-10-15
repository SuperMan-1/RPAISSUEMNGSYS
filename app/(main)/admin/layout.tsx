import { AdminTabs } from "@/components/AdminTabs";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>관리</h1>
          <p className="sub">
            기준정보를 목록으로 관리합니다. 같은 사이트를 사람마다 다르게 적으면
            검색과 집계가 어긋납니다.
          </p>
        </div>
      </div>

      <AdminTabs />
      {children}
    </main>
  );
}
