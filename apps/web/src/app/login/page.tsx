import type { Metadata } from "next";
import { CenteredCard } from "@/components/centered-card";
import { type LoginError, LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · Wanderer" };

const LOGIN_ERRORS: readonly LoginError[] = ["terms", "cancelled", "banned", "email", "account"];

function toLoginError(value: string | string[] | undefined): LoginError | undefined {
  return LOGIN_ERRORS.find((error) => error === value);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  return (
    <CenteredCard title="Log in to Wanderer" subtitle="Make characters and talk with them.">
      <LoginForm error={toLoginError(error)} />
    </CenteredCard>
  );
}
