import { useEffect, useRef, useState } from "react";
import { useEngineOrNull } from "src/app/engineBinding/EngineContext";
import { useEngineApi } from "src/app/hooks/useEngineApi";
import { createAgentRunner } from "src/ai/agent/createAgentRunner";
import { T, RGB, alpha } from "src/app/constants/designTokens";

type Message = {
    id: number;
    sender: "ai" | "user";
    text: string;
    time: string;
};

/** Monotonic counter cho React key — tránh trùng key khi Date.now() không đủ độ phân giải. */
let _msgId = 1;

function formatTime(date: Date): string {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

type Props = { isOpen: boolean; onClose: () => void };

export default function AIChatbot({ isOpen, onClose }: Props) {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 0,
            sender: "ai",
            text: "Hello! I'm your Tiny Home Architect. What shall we build together today? I can help you place objects, suggest color palettes, or even generate a whole room layout.",
            time: formatTime(new Date()),
        },
    ]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // ── AI agent wiring (WP1b) ───────────────────────────────────────────────
    const engine = useEngineOrNull();
    const api = useEngineApi();

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isTyping]);

    function pushAi(text: string) {
        setMessages((prev) => [...prev, { id: _msgId++, sender: "ai", text, time: formatTime(new Date()) }]);
    }

    async function sendMessage() {
        const text = input.trim();
        if (!text || isTyping) return;

        const now = new Date();
        setMessages((prev) => [...prev, { id: _msgId++, sender: "user", text, time: formatTime(now) }]);
        setInput("");
        setIsTyping(true);

        if (!engine) {
            setIsTyping(false);
            pushAi("Engine chưa sẵn sàng — đợi scene tải xong rồi thử lại nhé.");
            return;
        }

        try {
            // Tạo runner mỗi lượt → luôn bám engine + api hiện tại (WP1: single-shot).
            const runner = createAgentRunner({
                api,
                perception: {
                    world: engine.world,
                    nodes: engine.nodes,
                    wallEntityByWallId: engine.wallEntityByWallId,
                },
            });
            const result = await runner.run(text);
            pushAi(result.finalText || "Xong!");
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            pushAi(`Có lỗi khi xử lý yêu cầu: ${msg}`);
        } finally {
            setIsTyping(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    return (
        <div
            style={{
                position: "fixed",
                bottom: 96,
                right: 16,
                zIndex: 60,
                width: 340,
                display: "flex",
                flexDirection: "column",
                background: "rgba(241,238,229,0.96)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                borderRadius: 24,
                border: `1px solid ${alpha(RGB.primaryContainer, 0.30)}`,
                boxShadow: `0 16px 64px ${alpha(RGB.primary, 0.25)}`,
                overflow: "hidden",
                fontFamily: "'Nunito Sans', sans-serif",
                // animate open/close
                transform: isOpen ? "translateY(0) scale(1)" : "translateY(16px) scale(0.97)",
                opacity: isOpen ? 1 : 0,
                pointerEvents: isOpen ? "auto" : "none",
                transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease",
            }}
        >
            {/* Header */}
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid rgba(213,196,172,0.35)",
                background: alpha(RGB.primaryContainer, 0.10),
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ color: T.primary, fontSize: 20 }}>auto_awesome</span>
                    <span style={{ fontFamily: "Cinzel, serif", fontSize: 15, fontWeight: 700, color: T.primary }}>
                        Tiny Home Architect
                    </span>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: "transparent", border: "none", cursor: "pointer",
                        borderRadius: 9999, width: 28, height: 28,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#504532", transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(213,196,172,0.45)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    aria-label="Close chat"
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                </button>
            </div>

            {/* Messages */}
            <div style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                maxHeight: 360,
                minHeight: 240,
                scrollbarWidth: "none",
            }}>
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: msg.sender === "user" ? "flex-end" : "flex-start",
                        }}
                    >
                        <div style={{
                            padding: "10px 14px",
                            borderRadius: msg.sender === "user"
                                ? "18px 18px 4px 18px"
                                : "18px 18px 18px 4px",
                            maxWidth: "85%",
                            background: msg.sender === "user"
                                ? T.primaryContainer
                                : "#fdf9f0",
                            border: msg.sender === "user"
                                ? "none"
                                : "1px solid rgba(213,196,172,0.6)",
                            color: msg.sender === "user" ? "#271900" : "#1c1c17",
                            fontSize: 13,
                            lineHeight: 1.5,
                            boxShadow: `0 2px 8px ${alpha(RGB.primary, 0.08)}`,
                        }}>
                            {msg.text}
                        </div>
                        <span style={{ fontSize: 10, color: "rgba(80,69,50,0.55)", marginTop: 3, marginLeft: 4, marginRight: 4 }}>
                            {msg.time}
                        </span>
                    </div>
                ))}

                {isTyping && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                        <div style={{
                            padding: "10px 16px",
                            borderRadius: "18px 18px 18px 4px",
                            background: "#fdf9f0",
                            border: "1px solid rgba(213,196,172,0.6)",
                            display: "flex",
                            gap: 4,
                            alignItems: "center",
                        }}>
                            {[0, 1, 2].map((i) => (
                                <span key={i} style={{
                                    width: 7, height: 7,
                                    borderRadius: "50%",
                                    background: T.primary,
                                    display: "inline-block",
                                    animation: `chatbot-bounce 1s ease-in-out ${i * 0.18}s infinite`,
                                    opacity: 0.7,
                                }} />
                            ))}
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{
                padding: "12px",
                background: "rgba(253,249,240,0.50)",
                borderTop: "1px solid rgba(213,196,172,0.30)",
            }}>
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask me anything..."
                        style={{
                            flex: 1,
                            paddingLeft: 16,
                            paddingRight: 48,
                            paddingTop: 10,
                            paddingBottom: 10,
                            borderRadius: 9999,
                            background: "#fdf9f0",
                            border: "1px solid rgba(213,196,172,0.8)",
                            outline: "none",
                            fontSize: 13,
                            color: "#1c1c17",
                            fontFamily: "'Nunito Sans', sans-serif",
                            boxShadow: `0 2px 8px ${alpha(RGB.primary, 0.06)}`,
                            transition: "border-color 0.2s, box-shadow 0.2s",
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = alpha(RGB.primaryContainer, 0.8);
                            e.currentTarget.style.boxShadow = `0 0 0 3px ${alpha(RGB.primaryContainer, 0.15)}`;
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = "rgba(213,196,172,0.8)";
                            e.currentTarget.style.boxShadow = `0 2px 8px ${alpha(RGB.primary, 0.06)}`;
                        }}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!input.trim()}
                        style={{
                            position: "absolute",
                            right: 4,
                            width: 34,
                            height: 34,
                            borderRadius: 9999,
                            background: input.trim() ? T.primaryContainer : alpha(RGB.primaryContainer, 0.35),
                            border: "none",
                            cursor: input.trim() ? "pointer" : "default",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: input.trim() ? "#271900" : "#a08050",
                            transition: "all 0.2s",
                            boxShadow: input.trim() ? `0 2px 8px ${alpha(RGB.primary, 0.20)}` : "none",
                        }}
                        onMouseEnter={(e) => { if (input.trim()) e.currentTarget.style.transform = "scale(1.08)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                        aria-label="Send message"
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>send</span>
                    </button>
                </div>
            </div>

            {/* Bounce keyframe via <style> injection — only once */}
            <style>{`
                @keyframes chatbot-bounce {
                    0%, 80%, 100% { transform: translateY(0); }
                    40% { transform: translateY(-5px); }
                }
            `}</style>
        </div>
    );
}
