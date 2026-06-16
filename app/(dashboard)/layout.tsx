import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/");

  const userName    = session.user.name    ?? "User";
  const userInitial = userName.charAt(0).toUpperCase();

  // Resolve roleId — JWT may predate the roleId field, so fall back to a DB lookup.
  let roleId: number | null = session.user.roleId ? parseInt(session.user.roleId, 10) : null;
  if (!roleId) {
    const user = await db.user.findFirst({
      where:  { id: parseInt(session.user.id, 10), deletedAt: null },
      select: { roleId: true },
    });
    roleId = user?.roleId ?? null;
  }

  const userPermissions: string[] = roleId
    ? (await db.rolePermission.findMany({
        where:  { roleId },
        select: { permission: true },
      })).map((p) => p.permission)
    : [];

  return (
    <DashboardShell
      userName={userName}
      userInitial={userInitial}
      userPermissions={userPermissions}
    >
      {children}
    </DashboardShell>
  );
}
