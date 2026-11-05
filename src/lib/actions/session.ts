"use server";

import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isLocalMode } from "@/lib/mode";
import { findAllowedUser } from "@/lib/session";

export async function signIn(_previous: { error: string } | null, form: FormData): Promise<{ error: string } | null> {
  if (isLocalMode) redirect("/closet");
  const auth = getAuth();
  const { data, error } = await auth.signIn.email({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (error || !data?.user) return { error: "Wrong email or password." };

  // A login alone isn't enough. See findAllowedUser.
  if (!(await findAllowedUser(data.user.id))) {
    await auth.signOut();
    return { error: "This account doesn't have access to Vitrine." };
  }
  redirect("/closet");
}

export async function signOut(): Promise<void> {
  if (!isLocalMode) await getAuth().signOut();
  redirect(isLocalMode ? "/closet" : "/login");
}
