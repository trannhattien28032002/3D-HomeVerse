/**
 * VersionsPanel — lịch sử phiên bản project (P4).
 *
 * Drawer trượt từ phải. Cho phép:
 *   - "Lưu phiên bản": saveNow(silent) để đẩy scene hiện tại lên server → createVersion(label).
 *     (Backend snapshot scene ĐÃ LƯU, nên phải lưu trước khi tạo version.)
 *   - List version (mới nhất trước) + "Khôi phục": confirm → restoreVersion (ghi server) →
 *     getVersion lấy scene_data → applyScene nạp vào engine.
 */
import { useEffect, useState } from "react";
import type { SceneDocument } from "src/engine/serialization";
import { useVersions, type VersionSummary } from "src/app/hooks/useVersions";
import ConfirmDialog from "src/app/components/common/ConfirmDialog";

type Props = {
    open: boolean;
    onClose: () => void;
    projectId: string | undefined;
    saveNow: (opts?: { silent?: boolean }) => Promise<boolean>;
    applyScene: (doc: SceneDocument) => Promise<void>;
};

const MAX_LABEL_LENGTH = 200;

export default function VersionsPanel({ open, onClose, projectId, saveNow, applyScene }: Props) {
    const { status, versions, creating, restoring, refresh, createNewVersion, restore } =
        useVersions(projectId, saveNow, applyScene, open);
    const [label, setLabel] = useState("");
    const [restoreTarget, setRestoreTarget] = useState<VersionSummary | null>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !creating && !restoring) onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, creating, restoring, onClose]);

    if (!open) return null;

    const handleCreate = async () => {
        const ok = await createNewVersion(label.trim());
        if (ok) setLabel("");
    };

    const handleRestore = async () => {
        if (!restoreTarget) return;
        const ok = await restore(restoreTarget.id);
        if (ok) setRestoreTarget(null);
    };

    const busy = creating || restoring;

    return (
        <>
            {/* Backdrop */}
            <button
                aria-hidden
                tabIndex={-1}
                onClick={() => { if (!busy) onClose(); }}
                className="fixed inset-0 z-[150] bg-surface-dim/40 backdrop-blur-[2px] cursor-default"
            />

            {/* Drawer */}
            <aside
                role="dialog"
                aria-modal="true"
                aria-label="Lịch sử phiên bản"
                className="fixed top-0 right-0 bottom-0 z-[151] w-full max-w-sm bg-surface-container-lowest/95 backdrop-blur-xl border-l border-outline-variant/40 shadow-[-12px_0_48px_rgba(124,88,0,0.18)] flex flex-col"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
                    <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2">
                        <span className="material-symbols-outlined">history</span>
                        Lịch sử phiên bản
                    </h2>
                    <button
                        type="button"
                        aria-label="Đóng"
                        onClick={() => { if (!busy) onClose(); }}
                        disabled={busy}
                        className="text-outline hover:text-primary transition-colors p-1 rounded-full hover:bg-surface-variant disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Tạo phiên bản */}
                <div className="px-5 py-4 border-b border-outline-variant/30 flex flex-col gap-2">
                    <input
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value.slice(0, MAX_LABEL_LENGTH))}
                        maxLength={MAX_LABEL_LENGTH}
                        placeholder="Nhãn phiên bản (tuỳ chọn)..."
                        disabled={creating}
                        className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl py-2.5 px-4 font-body-sm text-body-sm text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-60"
                    />
                    <button
                        type="button"
                        onClick={handleCreate}
                        disabled={creating}
                        className="bg-primary text-on-primary font-label-lg text-label-lg rounded-xl py-2.5 px-4 shadow-[0_0_15px_rgba(248,180,0,0.3)] hover:bg-surface-tint transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {creating
                            ? <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                            : <span className="material-symbols-outlined text-[18px]">bookmark_add</span>}
                        {creating ? "Đang lưu..." : "Lưu phiên bản"}
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {status === "loading" && (
                        <div className="flex items-center justify-center py-10 text-on-surface-variant">
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                        </div>
                    )}

                    {status === "error" && (
                        <div className="flex flex-col items-center gap-2 py-10 text-center">
                            <span className="material-symbols-outlined text-error text-[28px]">error_outline</span>
                            <p className="font-body-sm text-body-sm text-error">Không tải được lịch sử.</p>
                            <button
                                onClick={() => void refresh()}
                                className="font-label-md text-label-md text-primary hover:underline"
                            >
                                Thử lại
                            </button>
                        </div>
                    )}

                    {status === "ready" && versions.length === 0 && (
                        <p className="font-body-sm text-body-sm text-on-surface-variant text-center py-10">
                            Chưa có phiên bản nào. Lưu phiên bản đầu tiên để bắt đầu lịch sử.
                        </p>
                    )}

                    {status === "ready" && versions.length > 0 && (
                        <ul className="flex flex-col gap-2">
                            {versions.map((v) => (
                                <li
                                    key={v.id}
                                    className="flex items-center justify-between gap-3 bg-surface-container-high/40 border border-outline-variant/30 rounded-xl px-4 py-3"
                                >
                                    <div className="min-w-0">
                                        <p className="font-label-lg text-label-lg text-on-surface truncate">
                                            {v.label || `Phiên bản ${v.versionNum}`}
                                        </p>
                                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                                            #{v.versionNum} · {new Date(v.createdAt).toLocaleString()}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setRestoreTarget(v)}
                                        disabled={busy}
                                        className="flex-shrink-0 flex items-center gap-1 font-label-md text-label-md text-primary border border-outline-variant/50 rounded-full py-1.5 px-3 hover:bg-primary-container/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">restore</span>
                                        Khôi phục
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </aside>

            <ConfirmDialog
                open={restoreTarget !== null}
                title="Khôi phục phiên bản?"
                message={`Scene hiện tại sẽ được thay bằng "${restoreTarget?.label || `Phiên bản ${restoreTarget?.versionNum}`}". Hãy lưu phiên bản hiện tại trước nếu muốn giữ lại.`}
                confirmLabel="Khôi phục"
                busy={restoring}
                onConfirm={handleRestore}
                onCancel={() => { if (!restoring) setRestoreTarget(null); }}
            />
        </>
    );
}
