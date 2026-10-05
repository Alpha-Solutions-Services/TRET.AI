"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function GoogleSignInButton() {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function handleSignIn() {
    setPending(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      });
      if (error) {
        toast(error.message, "error");
        setPending(false);
      }
    } catch {
      toast("Could not start Google sign-in. Try again.", "error");
      setPending(false);
    }
  }

  return (
    <Button onClick={handleSignIn} disabled={pending} className="w-full">
      {pending ? "Redirecting…" : "Sign in with Google"}
    </Button>
  );
}
