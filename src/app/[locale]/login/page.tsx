import { setRequestLocale } from "next-intl/server";
import AuthForm from "@/components/AuthForm";
import { loginAction } from "@/app/actions";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AuthForm mode="login" action={loginAction} />;
}
