/**
 * useToastStore — hệ thông báo nhỏ gọn dùng chung toàn app (P1 cross-cutting).
 *
 * Trước đây editor báo lỗi bằng alert()/inline. Store này cho phép push toast từ
 * bất kỳ đâu — kể cả data layer ngoài React — qua helper `toast.*`.
 *
 * Mỗi toast tự biến mất sau `durationMs` (mặc định 3.5s); click để đóng sớm.
 */
import { create } from "zustand";

export type ToastKind = "success" | "error" | "info";
export type Toast = { id: number; kind: ToastKind; message: string };

type ToastState = {
    toasts: Toast[];
    push: (kind: ToastKind, message: string, durationMs?: number) => number;
    dismiss: (id: number) => void;
};

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
    toasts: [],
    push: (kind, message, durationMs = 3500) => {
        const id = nextId++;
        set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
        if (durationMs > 0) {
            setTimeout(() => get().dismiss(id), durationMs);
        }
        return id;
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Helper gọn cho non-React callers (vd data layer). */
export const toast = {
    success: (m: string) => useToastStore.getState().push("success", m),
    error: (m: string) => useToastStore.getState().push("error", m),
    info: (m: string) => useToastStore.getState().push("info", m),
};
