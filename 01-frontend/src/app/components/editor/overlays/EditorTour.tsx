/**
 * EditorTour — tour hướng dẫn sử dụng editor bằng react-joyride (v3).
 *
 * Hành vi:
 *   - Tự chạy MỘT LẦN khi user lần đầu vào một project (cờ lưu localStorage theo projectId).
 *     Chỉ auto-start khi `ready` (loader đã tắt) để các DOM target đã mount + không bị
 *     LoadingScreen che.
 *   - Nút "?" trên TopNavBar gọi useUIStore.startTour() để chạy lại bất cứ lúc nào
 *     (kể cả khi đã xem rồi). EditorTour đọc isTourRunning làm prop `run`.
 *   - Khi user hoàn tất / bỏ qua → đánh dấu đã xem (localStorage) + stopTour().
 *
 * Đi LẦN LƯỢT qua từng nút trong BOTTOM_NAV (navigation.ts). Vì một số nút chỉ hiện
 * ở 2D (select/build/to-3d) và số khác chỉ ở 3D, mỗi step khai báo `mode` cần thiết và
 * dùng hook `before` (react-joyride chờ Promise) để chuyển mode trước khi hiển thị —
 * nhờ vậy cả Tiếp/Quay-lại đều luôn nhìn đúng nút. Mode lúc mở tour được khôi phục khi
 * tour kết thúc.
 *
 * react-joyride v3: export có tên `Joyride` (không phải default), dùng `onEvent`
 * (không phải `callback`), `options` cho cấu hình/giao diện và prop `continuous` để
 * nút primary hiện "Tiếp theo"/"Hoàn tất" (thiếu nó sẽ hiện "Đóng").
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Joyride, EVENTS, STATUS, type EventData, type Step } from "react-joyride";
import { useUIStore } from "src/app/store/useUIStore";
import { useEngineOrNull } from "src/app/engineBinding/EngineContext";
import { T } from "src/app/constants/designTokens";
import type { Mode } from "src/app/constants/navigation";

type Props = {
    /** id project hiện hành — khoá để nhớ "đã xem tour" theo từng project. */
    projectId: string | undefined;
    /** true khi LoadingScreen đã tắt — chỉ auto-start tour khi đã sẵn sàng. */
    ready: boolean;
    /** Mode hiện tại của editor — để khôi phục lại khi tour kết thúc. */
    mode: Mode;
    /** Đổi mode 2D/3D — tour gọi để hiện đúng nút trên BottomNavBar. */
    setMode: (m: Mode) => void;
};

/** Khoá localStorage đánh dấu đã xem tour cho một project. */
function seenKey(projectId: string | undefined): string {
    return `homeverse:tour:editor:${projectId ?? "default"}`;
}

function hasSeenTour(projectId: string | undefined): boolean {
    try {
        return localStorage.getItem(seenKey(projectId)) === "1";
    } catch {
        return false; // localStorage bị chặn → cứ coi như chưa xem (sẽ chạy tour)
    }
}

function markTourSeen(projectId: string | undefined): void {
    try {
        localStorage.setItem(seenKey(projectId), "1");
    } catch {
        /* bỏ qua nếu localStorage không khả dụng */
    }
}

/**
 * Mô tả một bước (chưa gắn hook `before`). `mode` là chế độ editor cần bật để target
 * hiển thị; `MODE_ENTRY` nghĩa là dùng lại mode lúc người dùng mở tour (cho các nút
 * top-nav vốn hiện ở cả hai chế độ).
 */
const MODE_ENTRY = "entry" as const;
type StepMode = Mode | typeof MODE_ENTRY;
type StepDef = {
    target: string;
    placement: Step["placement"];
    mode: StepMode;
    title: string;
    content: string;
    /** Bước chỉ hiện khi thiết bị hỗ trợ VR (nút #topnav-vr mới được render). */
    requiresXR?: boolean;
};

/**
 * Danh sách bước — đi LẦN LƯỢT qua từng nút BOTTOM_NAV theo navigation.ts:
 *   3D: translate, rotate, decor, color, rot-left, rot-right, top, view-3d, view-walk, to-2d
 *   2D: select, build, to-3d
 * (decor/color hiện ở cả hai mode nên chỉ giới thiệu một lần ở 3D.)
 * Sau đó đi lần lượt từng nút top-nav theo thứ tự trong TopNavBar.tsx:
 *   back, [vr], screenshot, saveload, versions, grid, help, shortcuts, ai, logout.
 * (vr chỉ có khi thiết bị hỗ trợ → bước được lọc bỏ nếu không có kính VR.)
 */
const STEP_DEFS: StepDef[] = [
    {
        target: "body", placement: "center", mode: "3d",
        title: "Chào mừng đến Tiny Home! 🏠",
        content: "Mình sẽ đi qua từng nút công cụ một, từ từ thôi. Bấm \"Tiếp theo\" để bắt đầu, hoặc \"Bỏ qua\" nếu muốn tự khám phá.",
    },
    {
        target: "#editor-viewport", placement: "center", mode: "3d",
        title: "Khung cảnh 3D",
        content: "Toàn bộ không gian thiết kế nằm ở đây. Kéo chuột trái để xoay góc nhìn, lăn chuột để phóng to/thu nhỏ, giữ chuột phải để di chuyển khung hình. Bấm vào một vật để chọn nó.",
    },

    // ── Bottom nav — chế độ 3D ────────────────────────────────────────────────
    {
        target: "#nav-translate", placement: "top", mode: "3d",
        title: "Move — Di chuyển (Q)",
        content: "Chọn một vật rồi dùng công cụ này để kéo đổi vị trí của nó trong phòng. Đây là chế độ thao tác mặc định.",
    },
    {
        target: "#nav-rotate", placement: "top", mode: "3d",
        title: "Rotate — Xoay (W)",
        content: "Chuyển sang chế độ xoay để quay hướng của vật đang chọn quanh trục đứng.",
    },
    {
        target: "#nav-decor", placement: "top", mode: "3d",
        title: "Decor — Thêm nội thất (F)",
        content: "Mở danh mục đồ vật để chọn và đặt bàn, ghế, giường, đèn… vào phòng. Bấm vào sàn để đặt vật xuống.",
    },
    {
        target: "#nav-color", placement: "top", mode: "3d",
        title: "Color — Vật liệu & màu (M)",
        content: "Chọn một vật rồi bấm đây để mở bảng vật liệu, đổi màu/gỗ/vải… cho từng bộ phận của vật, cả tường và sàn.",
    },
    {
        target: "#nav-rot-left", placement: "top", mode: "3d",
        title: "Xoay khung cảnh sang trái",
        content: "Xoay cả khung cảnh 45° ngược chiều kim đồng hồ để nhìn từ một góc khác.",
    },
    {
        target: "#nav-rot-right", placement: "top", mode: "3d",
        title: "Xoay khung cảnh sang phải",
        content: "Xoay cả khung cảnh 45° theo chiều kim đồng hồ.",
    },
    {
        target: "#nav-top", placement: "top", mode: "3d",
        title: "Top — Nhìn từ trên",
        content: "Đưa máy ảnh về góc nhìn từ trên xuống, tiện để căn chỉnh bố cục mặt bằng.",
    },
    {
        target: "#nav-view-3d", placement: "top", mode: "3d",
        title: "3D View — Phối cảnh",
        content: "Trả máy ảnh về góc phối cảnh 3D quen thuộc.",
    },
    {
        target: "#nav-view-walk", placement: "top", mode: "3d",
        title: "Walk — Dạo trong nhà",
        content: "Hạ máy ảnh xuống tầm mắt người để 'đi dạo' và cảm nhận không gian như thật.",
    },
    {
        target: "#nav-to-2d", placement: "top", mode: "3d",
        title: "2D — Chuyển sang mặt bằng",
        content: "Bật chế độ 2D để vẽ tường và bố trí mặt bằng. Bấm Tiếp theo, mình sẽ tự chuyển sang 2D để giới thiệu các nút ở đó.",
    },

    // ── Bottom nav — chế độ 2D (tour tự chuyển mode) ──────────────────────────
    {
        target: "#nav-select", placement: "top", mode: "2d",
        title: "Select — Chọn (V)",
        content: "Đang ở chế độ 2D. Công cụ Chọn để bấm/kéo chọn tường và đồ vật trên mặt bằng.",
    },
    {
        target: "#nav-build", placement: "top", mode: "2d",
        title: "Build — Vẽ tường (B)",
        content: "Công cụ dựng: vẽ tường mới bằng cách bấm lần lượt các điểm trên mặt bằng.",
    },
    {
        target: "#nav-to-3d", placement: "top", mode: "2d",
        title: "3D — Quay lại không gian 3D",
        content: "Bấm đây để quay về chế độ 3D bất cứ lúc nào (hoặc phím Tab).",
    },

    // ── Top nav — lần lượt từng nút theo thứ tự trong TopNavBar.tsx ────────────
    // (Các nút này hiện ở cả 2 mode → dùng lại mode lúc mở tour.)
    {
        target: "#topnav-back", placement: "bottom-start", mode: MODE_ENTRY,
        title: "Quay lại danh sách dự án",
        content: "Nút này đưa bạn trở về trang Projects. Thiết kế đã được tự động lưu nên cứ yên tâm thoát ra.",
    },
    {
        // Chỉ render khi thiết bị hỗ trợ immersive-vr → step được lọc bỏ nếu không có kính.
        target: "#topnav-vr", placement: "bottom", mode: MODE_ENTRY, requiresXR: true,
        title: "Đi dạo bằng kính VR 🥽",
        content: "Nếu bạn có kính thực tế ảo (Quest 3…), bấm đây để bước vào và đi dạo trong chính ngôi nhà của mình ở tỉ lệ thật. Dùng tay cầm để dịch chuyển, xoay góc và đi lại trong không gian. Bấm lần nữa (hoặc nút Thoát VR) để quay về.",
    },
    {
        target: "#topnav-screenshot", placement: "bottom", mode: MODE_ENTRY,
        title: "Chụp ảnh",
        content: "Chụp đúng khung hình đang xem (3D hoặc mặt bằng 2D) và tải về máy dưới dạng ảnh PNG.",
    },
    {
        target: "#topnav-saveload", placement: "bottom", mode: MODE_ENTRY,
        title: "Lưu / Tải tệp",
        content: "Thiết kế được tự động lưu liên tục (Ctrl+S để lưu ngay). Nút này để lưu hoặc tải tệp thiết kế .homeverseplan.",
    },
    {
        target: "#topnav-versions", placement: "bottom", mode: MODE_ENTRY,
        title: "Lịch sử phiên bản",
        content: "Xem lại và khôi phục các phiên bản trước của thiết kế — lỡ tay là có thể quay ngược thời gian.",
    },
    {
        target: "#topnav-grid", placement: "bottom", mode: MODE_ENTRY,
        title: "Lưới snap",
        content: "Đổi bước lưới hít (snap) khi di chuyển/vẽ. Số trên nút là bước lưới hiện tại tính bằng cm; bấm để luân phiên các mức.",
    },
    {
        target: "#topnav-help", placement: "bottom", mode: MODE_ENTRY,
        title: "Trợ giúp — Xem lại hướng dẫn",
        content: "Bấm nút \"?\" này bất cứ lúc nào để chạy lại đúng hướng dẫn bạn đang xem.",
    },
    {
        target: "#topnav-shortcuts", placement: "bottom", mode: MODE_ENTRY,
        title: "Bảng phím tắt",
        content: "Bấm nút bàn phím này (hoặc nhấn phím ?) để mở bảng tra cứu TOÀN BỘ phím tắt và thao tác chuột cho cả 2D lẫn 3D.",
    },
    {
        target: "#topnav-ai", placement: "bottom", mode: MODE_ENTRY,
        title: "Trợ lý AI",
        content: "Nhờ trợ lý AI tạo phòng, sắp xếp nội thất hay gợi ý thiết kế bằng câu lệnh tiếng Việt — ví dụ: \"Tạo phòng khách 5x4m và kê sofa\".",
    },
    {
        target: "#topnav-logout", placement: "bottom-end", mode: MODE_ENTRY,
        title: "Đăng xuất 🎉",
        content: "Nút cuối cùng — đăng xuất khỏi tài khoản. Vậy là xong phần giới thiệu, chúc bạn thiết kế thật vui!",
    },
];

export default function EditorTour({ projectId, ready, mode, setMode }: Props) {
    const isTourRunning = useUIStore((s) => s.isTourRunning);
    const startTour = useUIStore((s) => s.startTour);
    const stopTour = useUIStore((s) => s.stopTour);

    // VR: chỉ chèn bước hướng dẫn nút VR khi thiết bị hỗ trợ (nút #topnav-vr mới mount).
    // Cùng pattern với TopNavBar — tránh Joyride chờ một target không bao giờ xuất hiện.
    const engine = useEngineOrNull();
    const [xrSupported, setXrSupported] = useState(false);
    useEffect(() => {
        if (!engine) return;
        let active = true;
        void engine.xr.isSupported().then((ok) => { if (active) setXrSupported(ok); });
        return () => { active = false; };
    }, [engine]);

    // Giữ tham chiếu mới nhất cho các hook `before` (định nghĩa 1 lần) đọc được.
    const setModeRef = useRef(setMode);
    setModeRef.current = setMode;
    const modeRef = useRef(mode);
    modeRef.current = mode;
    // Mode tại thời điểm mở tour — để khôi phục khi kết thúc + cho các step MODE_ENTRY.
    const entryModeRef = useRef<Mode>(mode);
    const wasRunningRef = useRef(false);
    useEffect(() => {
        if (isTourRunning && !wasRunningRef.current) {
            entryModeRef.current = modeRef.current; // chốt mode lúc bắt đầu
        }
        wasRunningRef.current = isTourRunning;
    }, [isTourRunning]);

    // Đổi mode rồi đợi 2 frame để React kịp render target mới (targetWaitTimeout làm
    // lưới an toàn nếu vẫn chậm).
    const ensureMode = (m: Mode): Promise<void> => {
        if (modeRef.current !== m) setModeRef.current(m);
        return new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
    };

    const steps: Step[] = useMemo(
        () => STEP_DEFS
            .filter((def) => !def.requiresXR || xrSupported)
            .map((def) => ({
                target: def.target,
                placement: def.placement,
                title: def.title,
                content: def.content,
                before: () => ensureMode(def.mode === MODE_ENTRY ? entryModeRef.current : def.mode),
            })),
        [xrSupported],
    );

    // Auto-start lần đầu vào project (sau khi loader tắt và DOM target đã sẵn sàng).
    useEffect(() => {
        if (!ready) return;
        if (hasSeenTour(projectId)) return;
        startTour();
    }, [ready, projectId, startTour]);

    const handleEvent = (data: EventData) => {
        // Tour kết thúc (hoàn tất / bỏ qua) → nhớ đã xem + tắt run + trả lại mode ban đầu.
        const finished = data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED;
        if (data.type === EVENTS.TOUR_END || finished) {
            markTourSeen(projectId);
            stopTour();
            if (modeRef.current !== entryModeRef.current) setModeRef.current(entryModeRef.current);
        }
    };

    return (
        <Joyride
            // `continuous` BẮT BUỘC: nếu thiếu, nút primary luôn hiện nhãn `close`
            // ("Đóng") thay vì `next`/`last`. Có nó → "Tiếp theo" rồi "Hoàn tất".
            continuous
            run={isTourRunning}
            steps={steps}
            onEvent={handleEvent}
            options={{
                showProgress: true,
                skipBeacon: true,
                skipScroll: true,
                // Chờ target lâu hơn một chút vì có bước phải đổi mode 2D/3D trước.
                targetWaitTimeout: 2000,
                // X = bỏ qua toàn bộ tour (không chỉ đóng step hiện tại).
                closeButtonAction: "skip",
                buttons: ["skip", "back", "primary"],
                primaryColor: T.primary,
                textColor: T.onSurface,
                backgroundColor: "#fffdf7",
                arrowColor: "#fffdf7",
                overlayColor: "rgba(28,28,23,0.55)",
                spotlightPadding: 8,
                zIndex: 10000,
            }}
            locale={{
                back: "Quay lại",
                close: "Đóng",
                last: "Hoàn tất",
                next: "Tiếp theo",
                nextWithProgress: "Tiếp theo ({current}/{total})",
                skip: "Bỏ qua",
            }}
        />
    );
}
