import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AuthButton() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="max-w-48 truncate text-sm text-gray-600">
        {user.email}
      </span>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
