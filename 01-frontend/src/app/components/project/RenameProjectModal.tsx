/**
 * RenameProjectModal — đổi tên project (P3). Submit gọi onSubmit(name) (parent PATCH).
 */
import { useEffect, useState } from "react";

const MAX_NAME_LENGTH = 200;

type Props = {
    open: boolean;
    initialName: string;
    busy?: boolean;
    onSubmit: (name: string) => void;
    onCancel: () => void;
};

export default function RenameProjectModal({ open, initialName, busy = false, onSubmit, onCancel }: Props) {
    const [name, setName] = useState(initialName);

    // Đồng bộ tên ban đầu mỗi lần mở (đổi project khác).
    useEffect(() => {
        if (open) setName(initialName);
    }, [open, initialName]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, busy, onCancel]);

    if (!open) return null;

    const trimmed = name.trim();
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || !trimmed || trimmed === initialName) return;
        onSubmit(trimmed);
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Đổi tên project"
            onClick={() => { if (!busy) onCancel(); }}
            className="fixed inset-0 z-[210] flex items-center justify-center bg-surface-dim/60 backdrop-blur-sm p-4"
        >
            <form
                onClick={(e) => e.stopPropagation()}
                onSubmit={handleSubmit}
                className="w-full max-w-md bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-[0_24px_64px_rgba(124,88,0,0.22),0_4px_16px_rgba(124,88,0,0.10)] p-6 flex flex-col gap-5"
            >
                <h2 className="font-headline-sm text-headline-sm text-primary">Đổi tên project</h2>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                    maxLength={MAX_NAME_LENGTH}
                    disabled={busy}
                    autoFocus
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl py-2.5 px-4 font-body-md text-body-md text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-60"
                />
                <div className="flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className="font-label-lg text-label-lg text-on-surface-variant px-4 py-2.5 rounded-xl hover:bg-surface-variant transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        Huỷ
                    </button>
                    <button
                        type="submit"
                        disabled={busy || !trimmed || trimmed === initialName}
                        className="bg-primary text-on-primary font-label-lg text-label-lg rounded-xl py-2.5 px-5 shadow-[0_0_15px_rgba(248,180,0,0.3)] hover:bg-surface-tint transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {busy && (
                            <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                        )}
                        Lưu
                    </button>
                </div>
            </form>
        </div>
    );
}
