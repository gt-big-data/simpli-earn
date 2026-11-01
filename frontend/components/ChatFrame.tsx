"use client";

import { History, Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import ChatBot from "./ChatBot";
import ChatHistoryList, { DEFAULT_HISTORY_VIEW, type HistoryView } from "./ChatHistoryList";
import type { useChatController } from "@/lib/use-chat-controller";
import { MOTION_EASING, MOTION_MS, prefersReducedMotion } from "@/lib/motion";

interface ChatFrameProps {
    /** fromFullscreen: the panel was a fullscreen overlay, so there is no docked slot to animate */
    onClose: (fromFullscreen: boolean) => void;
    chat: ReturnType<typeof useChatController>;
}

// One SimpliChat panel for both the docked and fullscreen views. Fullscreen only changes this
// element's layout (fixed over the page), so the chat, its draft and scroll position, and the
// dashboard underneath all stay mounted.
export default function ChatFrame({ onClose, chat }: ChatFrameProps) {
    const [fullscreen, setFullscreen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    // Tab, search and filters: shared by the sidebar and the small-screen popover, and kept when an
    // "All chats" link changes dashboard
    const [historyView, setHistoryView] = useState<HistoryView>(DEFAULT_HISTORY_VIEW);
    const { controller, state, guest, loading, sourceError } = chat;
    const panelRef = useRef<HTMLDivElement>(null);
    // The panel's on-screen rect just before a toggle, used to animate from it (FLIP)
    const fromRect = useRef<DOMRect | null>(null);

    const toggleFullscreen = () => {
        fromRect.current = panelRef.current?.getBoundingClientRect() ?? null;
        setFullscreen((current) => !current);
        setHistoryOpen(false);
    };

    // After the layout switch, start the panel transformed back onto its old rect and animate to
    // its new one, so it grows out of / shrinks back into place, scaling each axis independently
    useLayoutEffect(() => {
        const panel = panelRef.current;
        const from = fromRect.current;
        fromRect.current = null;
        if (!panel || !from || prefersReducedMotion()) return;

        const to = panel.getBoundingClientRect();
        const animation = panel.animate(
            [
                {
                    transformOrigin: "top left",
                    transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
                },
                { transformOrigin: "top left", transform: "none" },
            ],
            { duration: MOTION_MS, easing: MOTION_EASING }
        );
        // Keep the panel above the page (footer included) while it shrinks back into its slot
        panel.style.zIndex = "50";
        animation.onfinish = animation.oncancel = () => {
            panel.style.zIndex = "";
        };
    }, [fullscreen]);

    // While fullscreen: the page behind shouldn't scroll, and Escape returns to the docked view
    useEffect(() => {
        if (!fullscreen) return;
        const root = document.documentElement;
        const previousOverflow = root.style.overflow;
        root.style.overflow = "hidden";
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            fromRect.current = panelRef.current?.getBoundingClientRect() ?? null;
            setFullscreen(false);
            setHistoryOpen(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            root.style.overflow = previousOverflow;
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [fullscreen]);

    return (
        <>
            {/* Covers the dashboard while fullscreen; fades rather than unmounting anything */}
            <div
                aria-hidden
                className={`fixed inset-0 z-40 bg-background transition-opacity motion-reduce:transition-none ${
                    fullscreen ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                style={{ transitionDuration: `${MOTION_MS}ms` }}
            />
            <div
                ref={panelRef}
                className={`surface flex flex-col overflow-hidden rounded-2xl text-foreground ${
                    fullscreen ? "fixed inset-5 z-50" : "relative h-full w-full"
                }`}
            >
                {/* Equal-width side groups keep the title centred whether or not the history button shows */}
                <div className="panel-header">
                    <div className="flex flex-1">
                        <button
                            type="button"
                            className="cursor-pointer text-foreground"
                            aria-label={fullscreen ? "Exit fullscreen" : "Expand chat"}
                            onClick={toggleFullscreen}
                        >
                            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                        </button>
                    </div>
                    <h1 className="text-lg font-medium">SimpliChat</h1>
                    <div className="flex flex-1 items-center justify-end gap-4">
                        {/* History is a fullscreen feature; below lg its sidebar becomes this popover */}
                        {fullscreen && !guest && controller && <button type="button" aria-label="Show chat history"
                            aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}
                            className="cursor-pointer text-foreground lg:hidden"><History className="size-4" /></button>}
                        <button type="button" className="cursor-pointer text-foreground" aria-label="Close chat" onClick={() => onClose(fullscreen)}>
                            <X className="size-4" />
                        </button>
                    </div>
                </div>

                {/* The sidebar sits before the chat in its own slot, so toggling it never remounts ChatBot */}
                <div className={`flex min-h-0 w-full flex-1 ${fullscreen ? "border-t border-white/8" : ""}`}>
                    {fullscreen && !guest && controller && state && (
                        <aside className="hidden w-1/4 min-w-48 border-r border-white/8 p-5 lg:block">
                            <ChatHistoryList controller={controller} state={state} view={historyView} onViewChange={setHistoryView} />
                        </aside>
                    )}
                    {fullscreen && historyOpen && !guest && controller && state && <aside
                        className="absolute inset-x-3 top-14 z-20 flex max-h-[70%] flex-col rounded-lg border border-white/15 bg-background p-4 shadow-xl lg:hidden">
                        <ChatHistoryList controller={controller} state={state} view={historyView} onViewChange={setHistoryView}
                            onSelect={() => setHistoryOpen(false)} />
                    </aside>}
                    <div className={`flex min-h-0 min-w-0 flex-1 flex-col gap-2 ${fullscreen ? "px-8 pt-5 pb-8" : "px-5 pb-5"}`}>
                        {guest && !loading && <p className="text-xs text-muted-foreground"><Link className="text-brand underline" href="/login">Sign in</Link> to save conversations.</p>}
                        {/* Auth only; a chat's own message load shows inside ChatBot */}
                        {loading && !state?.loading && <p className="text-xs text-muted-foreground" role="status">Loading chat…</p>}
                        {(sourceError || state?.error) && <div className="text-xs text-red-300" role="alert">
                            {sourceError || state?.error}{" "}
                            {controller && <button type="button" className="cursor-pointer underline" disabled={state?.busy}
                                onClick={() => void controller.refresh()}>Refresh</button>}
                        </div>}
                        {controller && state && <div className="min-h-0 flex-1">
                            <ChatBot key={`${controller.identity}:${state.sessionId ?? "draft"}`}
                                messages={state.messages} ask={(text, requestId) => controller.ask(text, requestId)}
                                disabled={loading || state.busy || state.loadFailed} loading={state.loading} pendingRequestId={state.pendingRequestId}
                                viewKey={fullscreen ? "fullscreen" : "docked"} />
                        </div>}
                    </div>
                </div>
            </div>
        </>
    );
}
