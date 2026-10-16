"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

type AuthState = "loading" | "anonymous" | "authenticated";

export const AuthGate = () => {
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    fetch("/api/me")
      .then((response) => setState(response.ok ? "authenticated" : "anonymous"))
      .catch(() => setState("anonymous"));
  }, []);

  const handleLogin = async (username: string, password: string) => {
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        setState("authenticated");
      }
      return response.ok;
    } catch {
      return false;
    }
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    setState("anonymous");
  };

  if (state === "loading") {
    return null;
  }
  if (state === "anonymous") {
    return <LoginForm onLogin={handleLogin} />;
  }
  return <KanbanBoard onLogout={handleLogout} />;
};
