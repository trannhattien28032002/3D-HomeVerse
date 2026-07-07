/**
 * ProfileModal — xem/sửa profile user (P3).
 *
 * Mở → GET /auth/me; sửa displayName + avatarUrl → PATCH /auth/me/profile.
 * Email/plan/storage chỉ hiển thị (read-only).
 */
import { useEffect, useState } from "react";
import { useProfile } from "src/app/hooks/useProfile";

type Props = {
    open: boolean;
    onClose: () => void;
};

export default function ProfileModal({ open, onClose }: Props) {
    const { status, profile, saving, save } = useProfile(open);
    const [displayName, setDisplayName] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");

    // Sync input form từ profile khi tải xong (hoặc sau khi lưu cập nhật).
    useEffect(() => {
        if (profile) {
            setDisplayName(profile.displayName ?? "");
            setAvatarUrl(profile.avatarUrl ?? "");
        }
    }, [profile]);

    // Todo: Bị lặp code
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, saving, onClose]);

    if (!open) return null;

    const dirty =
        status === "ready" &&
        (displayName.trim() !== (profile?.displayName ?? "") || avatarUrl.trim() !== (profile?.avatarUrl ?? ""));

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving || !dirty) return;
        const ok = await save({
            displayName: displayName.trim(),
            avatarUrl: avatarUrl.trim() || undefined,
        });
        if (ok) onClose();
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Hồ sơ tài khoản"
            onClick={() => { if (!saving) onClose(); }}
            className="fixed inset-0 z-[210] flex items-center justify-center bg-surface-dim/60 backdrop-blur-sm p-4"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-[0_24px_64px_rgba(124,88,0,0.22),0_4px_16px_rgba(124,88,0,0.10)] p-6"
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="font-headline-sm text-headline-sm text-primary">Hồ sơ tài khoản</h2>
                    <button
                        type="button"
                        aria-label="Đóng"
                        onClick={() => { if (!saving) onClose(); }}
                        disabled={saving}
                        className="text-outline hover:text-primary transition-colors p-1 rounded-full hover:bg-surface-variant disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {status === "loading" && (
                    <div className="flex items-center justify-center py-10">
                        <span className="material-symbols-outlined animate-spin text-on-surface-variant">progress_activity</span>
                    </div>
                )}

                {status === "error" && (
                    <p className="font-body-md text-body-md text-error py-6 text-center">Không tải được hồ sơ.</p>
                )}

                {status === "ready" && profile && (
                    <form onSubmit={handleSave} className="flex flex-col gap-5">
                        <div className="flex flex-col gap-1.5">
                            <label className="font-label-lg text-label-lg text-on-surface-variant">Email</label>
                            <p className="font-body-md text-body-md text-on-surface bg-surface-variant/40 rounded-xl py-2.5 px-4">
                                {profile.email}
                            </p>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="profile-name" className="font-label-lg text-label-lg text-on-surface-variant">
                                Tên hiển thị
                            </label>
                            <input
                                id="profile-name"
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                disabled={saving}
                                className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl py-2.5 px-4 font-body-md text-body-md text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-60"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="profile-avatar" className="font-label-lg text-label-lg text-on-surface-variant">
                                Avatar URL <span className="text-on-surface-variant/60">(optional)</span>
                            </label>
                            <input
                                id="profile-avatar"
                                type="url"
                                value={avatarUrl}
                                onChange={(e) => setAvatarUrl(e.target.value)}
                                placeholder="https://..."
                                disabled={saving}
                                className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl py-2.5 px-4 font-body-md text-body-md text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-60"
                            />
                        </div>

                        <p className="font-label-sm text-label-sm text-on-surface-variant/80">
                            Gói: <span className="text-on-surface">{profile.plan}</span>
                        </p>

                        <div className="flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={saving}
                                className="font-label-lg text-label-lg text-on-surface-variant px-4 py-2.5 rounded-xl hover:bg-surface-variant transition-colors disabled:opacity-60"
                            >
                                Đóng
                            </button>
                            <button
                                type="submit"
                                disabled={saving || !dirty}
                                className="bg-primary text-on-primary font-label-lg text-label-lg rounded-xl py-2.5 px-5 shadow-[0_0_15px_rgba(248,180,0,0.3)] hover:bg-surface-tint transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving && (
                                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                                )}
                                Lưu
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
