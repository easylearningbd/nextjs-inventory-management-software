import { redirect } from "next/navigation";
import { auth } from "@/auth";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense-in-depth: verify session at the layout level so a request
  // that somehow bypasses proxy.ts cannot reach dashboard pages.
  const session = await auth();
  if (!session) redirect("/");

  return <DashboardShell>{children}</DashboardShell>;
}
