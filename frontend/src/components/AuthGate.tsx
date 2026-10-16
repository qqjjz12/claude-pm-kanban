"use client";

import { useEffect, useState } from "react";
import { setSessionExpiredHandler } from "@/lib/api";
import { LoginForm } from "@/components/LoginForm";
import { Workspace } from "@/components/Workspace";

type AuthState = "loading" | "anonymous" | "authenticated";

const readUsername = async (response: Response) => {
  try {
    return (await response.json()).username ?? "";
  } catch {
    return "";
  }
};

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const AuthGate = () => {
  const [state, setState] = useState<AuthState>("loading");
  const [username, setUsername] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then(async (response) => {
        if (response.ok) {
          setUsername(await readUsername(response));
        }
        setState(response.ok ? "authenticated" : "anonymous");
      })
      .catch(() => setState("anonymous"));
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setNotice("Your session expired. Please sign in again.");
      setState("anonymous");
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  // Resolves to an error message, or "" when signed in.
  const handleLogin = async (name: string, password: string) => {
    try {
      const response = await post("/api/login", { username: name, password });
      if (response.ok) {
        setUsername((await readUsername(response)) || name);
        setNotice("");
        setState("authenticated");
        return "";
      }
      return response.status === 429
        ? "Too many failed attempts. Please try again in a few minutes."
        : "Invalid username or password.";
    } catch {
      return "Could not reach the server.";
    }
  };

  // Resolves to an error message, or "" when the account was created.
  const handleRegister = async (name: string, password: string) => {
    try {
      const response = await post("/api/register", { username: name, password });
      if (response.ok) {
        setUsername((await readUsername(response)) || name);
        setState("authenticated");
        return "";
      }
      return response.status === 409
        ? "That username is already taken."
        : "Use a username of 3-32 letters, digits, dots, dashes or underscores and a password of at least 8 characters.";
    } catch {
      return "Could not reach the server.";
    }
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    setNotice("");
    setState("anonymous");
  };

  if (state === "loading") {
    return null;
  }
  if (state === "anonymous") {
    return <LoginForm onLogin={handleLogin} onRegister={handleRegister} notice={notice} />;
  }
  return <Workspace username={username} onLogout={handleLogout} />;
};
