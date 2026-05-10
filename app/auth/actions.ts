"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type AuthState = {
  error?: string;
};

function getField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signIn(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = getField(formData, "email");
  const password = getField(formData, "password");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

export async function signUp(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = getField(formData, "email");
  const password = getField(formData, "password");
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
