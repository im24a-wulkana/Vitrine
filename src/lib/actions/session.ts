"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE } from "@/lib/demo";
import { getAuth } from "@/lib/auth";
import { isLocalMode } from "@/lib/mode";

export async function signOut(): Promise<void> {
  (await cookies()).delete(DEMO_COOKIE);
  if (!isLocalMode) await getAuth().signOut();
  redirect(isLocalMode ? "/closet" : "/login");
}
