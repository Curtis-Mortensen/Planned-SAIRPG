"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";
import { AuthForm } from "@/components/auth-form";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";

export type AuthPageType = "login" | "register";

export type AuthActionState = {
  status: string;
};

export type AuthPageConfig = {
  type: AuthPageType;
  title: string;
  description: string;
  submitButtonText: string;
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  onStatusChange: (status: string) => void;
  alternateLink: {
    text: string;
    linkText: string;
    href: string;
    suffix: string;
  };
};

export function AuthPage({ config }: { config: AuthPageConfig }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<AuthActionState, FormData>(
    config.action,
    { status: "idle" }
  );

  const { update: updateSession } = useSession();

  // biome-ignore lint/correctness/useExhaustiveDependencies: router and updateSession are stable refs
  useEffect(() => {
    config.onStatusChange(state.status);

    if (state.status === "success") {
      setIsSuccessful(true);
      updateSession();
      router.refresh();
    }
  }, [state.status]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    formAction(formData);
  };

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-12 overflow-hidden rounded-2xl">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="font-semibold text-xl dark:text-zinc-50">
            {config.title}
          </h3>
          <p className="text-gray-500 text-sm dark:text-zinc-400">
            {config.description}
          </p>
        </div>
        <AuthForm action={handleSubmit} defaultEmail={email}>
          <SubmitButton isSuccessful={isSuccessful}>
            {config.submitButtonText}
          </SubmitButton>
          <p className="mt-4 text-center text-gray-600 text-sm dark:text-zinc-400">
            {config.alternateLink.text}
            <Link
              className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
              href={config.alternateLink.href}
            >
              {config.alternateLink.linkText}
            </Link>
            {config.alternateLink.suffix}
          </p>
        </AuthForm>
      </div>
    </div>
  );
}
