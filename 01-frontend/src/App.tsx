import { useEffect } from "react";
import "./App.css";
import EditorPage  from "./app/pages/EditorPage";
import Plan2DPage  from "./app/pages/Plan2DPage";
import { useUIStore } from "./app/store/useUIStore";
import { useState } from "react";

/**
 * Cả EditorPage (3D) và Plan2DPage (2D) luôn được mount.
 * Chỉ thay đổi visibility — Engine KHÔNG bao giờ bị dispose khi chuyển mode.
 * Điều này đảm bảo ECS luôn là source of truth, và useWallStore
 * trong Plan2DPage có thể subscribe snapshot ngay từ đầu.
 */
function App() {
    const [mode, setMode] = useState<"3d" | "2d">("3d");
    const syncViewport    = useUIStore((state) => state.syncViewport);

    useEffect(() => {
        syncViewport(window.innerWidth, window.innerHeight);

        const onResize = () => syncViewport(window.innerWidth, window.innerHeight);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [syncViewport]);

    return (
        <div style={{ width: "100vw", height: "100vh", position: "relative" }}>

            {/* EditorPage: luôn mount, ẩn khi ở 2D mode */}
            <div style={{ display: mode === "3d" ? "block" : "none", width: "100%", height: "100%" }}>
                <EditorPage />
            </div>

            {/* Plan2DPage: luôn mount, ẩn khi ở 3D mode */}
            <div style={{ display: mode === "2d" ? "block" : "none", width: "100%", height: "100%" }}>
                <Plan2DPage />
            </div>

            {/* Switch button — luôn visible */}
            <button
                type="button"
                onClick={() => setMode((prev) => (prev === "3d" ? "2d" : "3d"))}
                style={{
                    position: "absolute", top: 12, right: 12, zIndex: 20,
                    border: "1px solid #334155", background: "rgba(15,23,42,0.9)",
                    color: "#e2e8f0", borderRadius: 8,
                    padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
            >
                Switch to {mode === "3d" ? "2D" : "3D"}
            </button>
        </div>
    );
}

export default App;
