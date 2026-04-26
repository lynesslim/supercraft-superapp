import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/utils/supabase/server";

export type AppRole = "superadmin" | "employee";

export type AuthContext = {
  email: string | null;
  role: AppRole;
  userId: string;
};

type RoleRow = {
  role: AppRole | null;
};

const APP_ROLES = new Set<AppRole>(["superadmin", "employee"]);

function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.has(value as AppRole);
}

function getConfiguredSuperadminEmails() {
  return new Set(
    (process.env.SUPERADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;

  const user = data.user;
  const email = user.email ?? null;
  const metadataRole = user.app_metadata?.role ?? user.user_metadata?.role;
  const configuredSuperadmins = getConfiguredSuperadminEmails();
  let role: AppRole | null = null;

  try {
    const admin = createAdminClient();
    const { data: roleRow } = await admin
      .from("app_user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    role = isAppRole((roleRow as RoleRow | null)?.role) ? (roleRow as RoleRow).role : null;
  } catch {
    role = null;
  }

  if (!role && isAppRole(metadataRole)) {
    role = metadataRole;
  }

  if (!role && email && configuredSuperadmins.has(email.toLowerCase())) {
    role = "superadmin";
  }

  return {
    email,
    role: role ?? "employee",
    userId: user.id,
  };
}

export async function requirePageRole(allowedRoles: AppRole[]) {
  const auth = await getAuthContext();

  if (!auth) {
    redirect("/login");
  }

  if (!allowedRoles.includes(auth.role)) {
    redirect("/");
  }

  return auth;
}

export async function requireApiRole(allowedRoles: AppRole[]) {
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!allowedRoles.includes(auth.role)) {
    return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
  }

  return null;
}
