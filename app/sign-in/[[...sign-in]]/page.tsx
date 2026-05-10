import { signIn } from "@/app/auth/actions";
import AuthForm from "@/components/AuthForm";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <AuthForm action={signIn} mode="sign-in" />
    </div>
  );
}
