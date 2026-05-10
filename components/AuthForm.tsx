"use client";

import Link from "next/link";
import { useActionState } from "react";

type AuthFormProps = {
  action: (
    prevState: { error?: string },
    formData: FormData,
  ) => Promise<{ error?: string }>;
  mode: "sign-in" | "sign-up";
};

export default function AuthForm({ action, mode }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const isSignIn = mode === "sign-in";

  return (
    <form
      action={formAction}
      className="flex w-full max-w-sm flex-col gap-4 rounded border border-gray-200 p-6 shadow-sm"
    >
      <div>
        <h1 className="text-2xl font-semibold">
          {isSignIn ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isSignIn
            ? "Use your Supabase account credentials."
            : "Create a Supabase-backed account."}
        </p>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
        Email
        <input
          className="rounded border border-gray-300 px-3 py-2"
          name="email"
          required
          type="email"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
        Password
        <input
          className="rounded border border-gray-300 px-3 py-2"
          minLength={6}
          name="password"
          required
          type="password"
        />
      </label>
      {state.error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button
        className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Please wait..." : isSignIn ? "Sign in" : "Sign up"}
      </button>
      <Link
        className="text-center text-sm text-gray-600 underline-offset-4 hover:underline"
        href={isSignIn ? "/sign-up" : "/sign-in"}
      >
        {isSignIn ? "Need an account?" : "Already have an account?"}
      </Link>
    </form>
  );
}
