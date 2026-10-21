"use client";

import { TERMS_VERSION } from "@wanderer/shared";
import Link from "next/link";
import { useId, useState } from "react";

export type LoginError = "terms" | "cancelled" | "banned" | "email" | "account";

const ERROR_TEXT: Record<LoginError, string> = {
  terms: "Please accept the current Terms of Service and Privacy Policy.",
  cancelled: "Google login was cancelled.",
  banned: "This account is banned.",
  email: "Your Google email address is not verified.",
  account: "This Google email address belongs to another Wanderer account.",
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 2.9-2.2 5.4-4.7 7.1l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** The login form. The Google link works only after the user ticks the Terms box. */
export function LoginForm({ error }: { error?: LoginError }) {
  const [agreed, setAgreed] = useState(false);
  const checkboxId = useId();
  const googleUrl = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/auth/google?terms=${TERMS_VERSION}`;

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <p role="alert" className="m-0 rounded-xl border border-[#5c2a30] bg-[#2a1517] px-3.5 py-2.5 text-error">
          {ERROR_TEXT[error]}
        </p>
      ) : null}

      <div className="flex items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-0.5 size-[18px] flex-none accent-accent"
        />
        <label htmlFor={checkboxId} className="text-[14px] text-muted">
          I agree to the <Link href="/terms">Terms of Service</Link> and the{" "}
          <Link href="/privacy">Privacy Policy</Link>
        </label>
      </div>

      <a
        className="pill w-full border border-[#8e918f] bg-[#131314] text-[#e3e3e3] hover:bg-[#1e1e22]"
        href={agreed ? googleUrl : undefined}
        aria-disabled={agreed ? undefined : "true"}
        role={agreed ? undefined : "link"}
      >
        <GoogleIcon />
        Continue with Google
      </a>
    </div>
  );
}
