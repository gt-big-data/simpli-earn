"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "./auth/AuthContext";
import { createClient } from "./supabase/client";
import { API_BASE_URL } from "./api-config";
import { ChatController, type ChatResult } from "./chat-controller";
import { chatSource } from "./chat-source";
import { createChatRepository } from "./chat-store";

/** `preferredChat`: the chat to open first (the dashboard's ?chat=, set by links from "All chats"). */
export function useChatController(id: string | null, videoUrl: string | null, open: boolean, preferredChat: string | null = null) {
  const { user, loading } = useAuth();
  const accountId = user?.id ?? null;
  const source = useMemo(() => {
    try { return { value: chatSource(id, videoUrl), error: null }; }
    catch (error) { return { value: null, error: (error as Error).message }; }
  }, [id, videoUrl]);
  const controller = useMemo(() => {
    if (!source.value) return null;
    const repo = accountId && !loading ? createChatRepository(createClient(), accountId, source.value) : null;
    return new ChatController(source.value, repo, async (body, token) => {
      const res = await fetch(`${API_BASE_URL}/chat`, { method: "POST", body,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) throw new Error(data?.error ? data.response : typeof data?.detail === "string" ? data.detail : `Chat request failed (${res.status}). Refresh and retry.`);
      if (!data || typeof data.response !== "string") throw new Error("The chat server returned an invalid response. Refresh and retry.");
      return data as ChatResult;
    });
  }, [accountId, loading, source]);
  const state = useSyncExternalStore(controller?.subscribe ?? noopSubscribe, controller?.snapshot ?? emptySnapshot,
    controller?.snapshot ?? emptySnapshot);
  useEffect(() => {
    if (!controller || loading) return;
    controller.activate();
    void controller.initialize(preferredChat);
    return () => controller.dispose();
  }, [controller, loading, preferredChat]);
  useEffect(() => {
    if (!controller || loading || !open) return;
    const refresh = () => { void controller.refresh(); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [controller, loading, open]);
  return { controller, state, guest: !accountId, loading: loading || !!state?.loading, sourceError: source.error };
}
const noopSubscribe = () => () => {};
const emptySnapshot = () => null;
