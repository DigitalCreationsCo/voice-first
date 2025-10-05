"use client";

import Link from "next/link";
import { redirect, useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { AuthForm } from "@/components/custom/auth-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { login, LoginActionState, loginGoogle } from "../actions";
import GoogleButton from 'react-google-button'
import { auth } from "../../../auth";
import { useSession } from "next-auth/react";

export default function Page() {
  const session = useSession().data

  const router = useRouter();

  const [email, setEmail] = useState("");

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    {
      status: "idle",
    },
  );

  useEffect(() => {
    if (state.status === "failed") {
      toast.error("Invalid credentials!");
    } else if (state.status === "invalid_data") {
      toast.error("Failed validating your submission!");
    } else if (state.status === "success") {
      router.refresh();
    }
  }, [state.status, router]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    formAction(formData);
  };

  if (session && session.user) {
    redirect("/")
  }
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="w-full max-w-md overflow-hidden rounded-2xl flex flex-col gap-12">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="text-xl font-semibold dark:text-zinc-50">Sign In</h3>
          <GoogleButton onClick={loginGoogle} />
        </div>
      </div>
    </div>
  );
}