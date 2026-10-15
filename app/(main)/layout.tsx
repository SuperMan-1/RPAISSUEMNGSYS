import { TopNav } from "@/components/TopNav";
import { requireProfile } from "@/lib/auth";

export default async function MainLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();

  return (
    <>
      <TopNav name={profile.name} isAdmin={profile.role === "ADMIN"} />
      {children}
    </>
  );
}
