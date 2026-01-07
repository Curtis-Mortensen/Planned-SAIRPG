"use client";

import { toast } from "@/components/toast";
import { AuthPage, type AuthPageConfig } from "@/components/auth-page";
import { type RegisterActionState, register } from "../actions";

export default function Page() {
  const config: AuthPageConfig = {
    type: "register",
    title: "Sign Up",
    description: "Create an account with your email and password",
    submitButtonText: "Sign Up",
    action: register,
    onStatusChange: (status: string) => {
      if (status === "user_exists") {
        toast({ type: "error", description: "Account already exists!" });
      } else if (status === "failed") {
        toast({ type: "error", description: "Failed to create account!" });
      } else if (status === "invalid_data") {
        toast({
          type: "error",
          description: "Failed validating your submission!",
        });
      } else if (status === "success") {
        toast({ type: "success", description: "Account created successfully!" });
      }
    },
    alternateLink: {
      text: "Already have an account? ",
      linkText: "Sign in",
      href: "/login",
      suffix: " instead.",
    },
  };

  return <AuthPage config={config} />;
}
