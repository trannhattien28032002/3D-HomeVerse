/**
 * RouteFallback — fallback tối giản cho <Suspense> khi đang tải chunk route lazy.
 *
 * Cố ý nhẹ (không import three/konva/engine) để không kéo theo bundle nặng vào
 * entry chunk. Chỉ là nền + spinner trùng tông màu giấy của app, tránh nháy trắng
 * trong lúc EditorPage/ProjectsPage chunk đang được fetch.
 */
import { T } from "src/app/constants/designTokens";

export default function RouteFallback() {
    return (
        <div
            style={{
                position: "fixed", inset: 0, zIndex: 1000,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "#fdf9f0",
            }}
        >
            <div
                style={{
                    width: 48, height: 48,
                    borderRadius: "50%",
                    border: "4px solid #e6e2d9",
                    borderTopColor: T.primaryContainer,
                    animation: "route-fallback-spin 0.8s linear infinite",
                }}
            />
            <style>{`@keyframes route-fallback-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
