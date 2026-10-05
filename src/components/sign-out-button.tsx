"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function SignOutButton() {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast(error.message, "error");
        setPending(false);
        return;
      }
      window.location.href = "/login";
    } catch {
      toast("Could not sign out. Try again.", "error");
      setPending(false);
    }
  }

  return (
    <Button variant="secondary" onClick={handleSignOut} disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
