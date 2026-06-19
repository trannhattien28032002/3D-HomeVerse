/**
 * ConfirmDialog — hộp thoại xác nhận dùng chung (P3).
 * Style theo tokens Tailwind của app (giống CreateProjectModal).
 */
import { useEffect } from "react";

type Props = {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Tô đỏ nút xác nhận cho hành động phá huỷ (vd xoá). */
    danger?: boolean;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = "Xác nhận",
    cancelLabel = "Huỷ",
    danger = false,
    busy = false,
    onConfirm,
    onCancel,
}: Props) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, busy, onCancel]);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={() => { if (!busy) onCancel(); }}
            className="fixed inset-0 z-[210] flex items-center justify-center bg-surface-dim/60 backdrop-blur-sm p-4"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-[0_24px_64px_rgba(124,88,0,0.22),0_4px_16px_rgba(124,88,0,0.10)] p-6"
            >
                <h2 className="font-headline-sm text-headline-sm text-on-surface mb-2">{title}</h2>
                <p className="font-body-md text-body-md text-on-surface-variant mb-6">{message}</p>
                <div className="flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className="font-label-lg text-label-lg text-on-surface-variant px-4 py-2.5 rounded-xl hover:bg-surface-variant transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className={
                            "font-label-lg text-label-lg rounded-xl py-2.5 px-5 transition-all duration-300 flex items-center justify-center gap-2 text-on-primary disabled:opacity-50 disabled:cursor-not-allowed " +
                            (danger
                                ? "bg-error hover:brightness-110 shadow-[0_0_15px_rgba(179,38,30,0.3)]"
                                : "bg-primary hover:bg-surface-tint shadow-[0_0_15px_rgba(248,180,0,0.3)]")
                        }
                    >
                        {busy && (
                            <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                        )}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
