/**
 * useEngineEvent — gộp pattern subscribe/unsubscribe engine EventBus trong React (4.4).
 *
 * Trước: mỗi nơi lặp lại
 *   useEffect(() => {
 *       if (!engine) return;
 *       return engine.api.events.on(name, cb);
 *   }, [engine, ...]);
 * Rải ở EditorPage (gizmoMode/placement/entityLimit) và useEngineSelectionSync (3 event).
 *
 * Hook này:
 *   - Bỏ boilerplate null-check + re-subscribe.
 *   - Giữ `handler` trong ref → callback đổi mỗi render KHÔNG re-subscribe (chỉ
 *     `engine`/`name` đổi mới re-bind). Caller không cần useCallback.
 *   - No-op an toàn khi engine === null (chưa khởi tạo xong).
 *
 * Không dùng cho `snapshot` đọc-giá-trị (EntityCounter) — chỗ đó cần
 * useSyncExternalStore để tránh setState-trong-effect, là pattern khác.
 */
import { useEffect, useRef } from "react";
import type { EngineInstance } from "src/engine/engineTypes";
import type { EngineEventMap } from "src/engine/events/EngineEvents";

export function useEngineEvent<K extends keyof EngineEventMap>(
    engine: EngineInstance | null,
    name: K,
    handler: (payload: EngineEventMap[K]) => void,
): void {
    const handlerRef = useRef(handler);
    // Cập nhật ref mỗi render để subscription luôn gọi handler mới nhất mà không
    // cần re-bind EventBus (handler không nằm trong deps của effect dưới).
    useEffect(() => {
        handlerRef.current = handler;
    });

    useEffect(() => {
        if (!engine) return;
        return engine.api.events.on(name, (payload) => handlerRef.current(payload));
    }, [engine, name]);
}
