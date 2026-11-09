import { setRequestLocale } from "next-intl/server";
import SignupForm from "@/components/SignupForm";
import { signupAction } from "@/app/actions";

export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SignupForm action={signupAction} />;
}
