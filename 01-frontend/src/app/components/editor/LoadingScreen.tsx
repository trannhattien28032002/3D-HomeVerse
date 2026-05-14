import { useEffect, useRef, useState } from "react";

const LOGO_URL =
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDj8iVj8LYluoTpES8dpsgurXNqMnF5_lFgeWmfaiDhoBd2CkQGb2iMBNCZXfQVpbVjOK0UHWTT9ejM_fpsbRj8-Nf42ZfOH8f131KGBqzypOj7Ze0vzWELf-_qsjeXgaervXJc_F4v8k1J4Bw3Woc1NGobQYiBHReFFrGNg6w2JqTdM3NYnJprmUG2QrF5s1zc9WSaSR_K9sYnxOvX3S6XVHzOhxIgHHI2_6pPKi-sFgBD8jd5eXkFA-8QTbXYwHp6VpRjdW77RkkB";

const MESSAGES = [
    "Gathering Materials...",
    "Laying Foundations...",
    "Raising Walls...",
    "Placing Windows...",
    "Finishing Touches...",
];

type Props = {
    /** 0–100 */
    progress: number;
    /** When true, plays the fade-out animation before unmounting */
    done: boolean;
    onFadeOutEnd: () => void;
};

export default function LoadingScreen({ progress, done, onFadeOutEnd }: Props) {
    const [msgIdx, setMsgIdx] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Cycle status messages
    useEffect(() => {
        intervalRef.current = setInterval(() => {
            setMsgIdx(i => (i + 1) % MESSAGES.length);
        }, 1200);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, []);

    return (
        <div
            onTransitionEnd={done ? onFadeOutEnd : undefined}
            style={{
                position: "fixed", inset: 0, zIndex: 1000,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                background: "#fdf9f0",
                fontFamily: "'Nunito Sans', sans-serif",
                opacity: done ? 0 : 1,
                transition: done ? "opacity 0.55s ease" : "none",
                overflow: "hidden",
                userSelect: "none",
            }}
        >
            {/* Paper texture overlay */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10,
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")`,
            }} />

            {/* Soft radial glow behind logo */}
            <div style={{
                position: "absolute",
                width: 320, height: 320,
                borderRadius: "50%",
                background: "rgba(248,180,0,0.12)",
                filter: "blur(80px)",
                pointerEvents: "none",
                zIndex: 11,
            }} />

            {/* Content */}
            <div style={{
                position: "relative", zIndex: 20,
                display: "flex", flexDirection: "column",
                alignItems: "center", gap: 32,
            }}>
                {/* Circular logo */}
                <div style={{
                    width: 240, height: 240,
                    borderRadius: "50%",
                    border: "4px solid #ece8df",
                    background: "rgba(255,255,255,0.5)",
                    backdropFilter: "blur(8px)",
                    boxShadow: "0 10px 40px rgba(124,88,0,0.10), inset 0 0 20px rgba(124,88,0,0.04)",
                    overflow: "hidden",
                    padding: 16,
                    boxSizing: "border-box",
                }}>
                    <img
                        src={LOGO_URL}
                        alt="Tiny Home logo"
                        style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "50%" }}
                    />
                </div>

                {/* Title + progress */}
                <div style={{
                    display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 20,
                }}>
                    <h1 style={{
                        fontFamily: "Cinzel, serif",
                        fontSize: 48, lineHeight: "56px",
                        fontWeight: 400,
                        color: "#7c5800",
                        letterSpacing: "0.02em",
                        margin: 0,
                    }}>
                        Tiny Home
                    </h1>

                    {/* Progress track */}
                    <div style={{ width: 192, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                        <div style={{
                            width: "100%", height: 8,
                            background: "#e6e2d9",
                            borderRadius: 9999,
                            overflow: "hidden",
                            boxShadow: "inset 0 1px 3px rgba(80,69,50,0.18)",
                        }}>
                            <div style={{
                                height: "100%",
                                width: `${progress}%`,
                                background: "#f8b400",
                                borderRadius: 9999,
                                boxShadow: "0 0 8px rgba(248,180,0,0.55)",
                                transition: "width 0.4s ease",
                            }} />
                        </div>

                        {/* Status message */}
                        <span style={{
                            fontSize: 14, fontWeight: 700,
                            color: "#504532",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            // Fade between messages
                            transition: "opacity 0.3s",
                        }}>
                            {MESSAGES[msgIdx]}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
