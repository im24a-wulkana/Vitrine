"use server";

import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isLocalMode } from "@/lib/mode";

export async function signOut(): Promise<void> {
  if (!isLocalMode) await getAuth().signOut();
  redirect(isLocalMode ? "/closet" : "/login");
}
