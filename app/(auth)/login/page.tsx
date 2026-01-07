"use client";

import { toast } from "@/components/toast";
import { AuthPage, type AuthPageConfig } from "@/components/auth-page";
import { type LoginActionState, login } from "../actions";

export default function Page() {
  const config: AuthPageConfig = {
    type: "login",
    title: "Sign In",
    description: "Use your email and password to sign in",
    submitButtonText: "Sign in",
    action: login,
    onStatusChange: (status: string) => {
      if (status === "failed") {
        toast({
          type: "error",
          description: "Invalid credentials!",
        });
      } else if (status === "invalid_data") {
        toast({
          type: "error",
          description: "Failed validating your submission!",
        });
      }
    },
    alternateLink: {
      text: "Don't have an account? ",
      linkText: "Sign up",
      href: "/register",
      suffix: " for free.",
    },
  };

  return <AuthPage config={config} />;
}
