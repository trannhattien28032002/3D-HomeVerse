/**
 * Modal tạo project mới: nhập tên + chọn ảnh thumbnail (optional).
 *
 * Luồng submit:
 *   1. POST /projects (name, floorCount: 1 mặc định).
 *   2. Nếu có chọn ảnh: upload lên Supabase Storage rồi PATCH thumbnailUrl.
 *      Bước này lỗi KHÔNG chặn — project đã tồn tại, chỉ thiếu thumbnail.
 *   3. onCreated?.(project) rồi navigate vào editor của project mới.
 *
 * Chưa có hệ thống toast trong app → báo lỗi bằng text đỏ inline trong modal.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateProject, type ProjectMeta } from "src/app/hooks/useCreateProject";

// To-do: Nên làm 1 file gom các constants
const MAX_NAME_LENGTH = 200;

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated?: (project: ProjectMeta) => void;
};

type Status = "idle" | "submitting" | "error";

export default function CreateProjectModal({ open, onClose, onCreated }: Props) {
    const [name, setName] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [status, setStatus] = useState<Status>("idle");
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const createWithThumbnail = useCreateProject();

    const submitting = status === "submitting";
    const trimmedName = name.trim();

    // Reset form khi đóng modal để lần mở sau sạch sẽ.
    useEffect(() => {
        if (!open) {
            setName("");
            setFile(null);
            setStatus("idle");
            setError(null);
        }
    }, [open]);

    // Tạo object URL preview khi chọn file, tự revoke khi đổi file/unmount.
    useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    // Đóng bằng phím Escape (trừ khi đang submitting).
    // To-do: Lặp code
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !submitting) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, submitting, onClose]);

    if (!open) return null;

    const handleBackdropClick = () => {
        if (!submitting) onClose();
    };

    const handleCancel = () => {
        if (!submitting) onClose();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = e.target.files?.[0] ?? null;
        setFile(picked);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting || !trimmedName) return;

        setStatus("submitting");
        setError(null);

        const result = await createWithThumbnail(trimmedName, file);
        if (result.ok === false) {
            setError(result.message);
            setStatus("error");
            return;
        }

        onCreated?.(result.project);
        navigate(`/project/${result.project.id}`);
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Tạo project mới"
            onClick={handleBackdropClick}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-surface-dim/60 backdrop-blur-sm p-4"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-[0_24px_64px_rgba(124,88,0,0.22),0_4px_16px_rgba(124,88,0,0.10)] p-6"
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="font-headline-sm text-headline-sm text-primary">New Project</h2>
                    <button
                        type="button"
                        aria-label="Đóng"
                        onClick={handleCancel}
                        disabled={submitting}
                        className="text-outline hover:text-primary transition-colors p-1 rounded-full hover:bg-surface-variant disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    {/* Tên project */}
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="project-name" className="font-label-lg text-label-lg text-on-surface-variant">
                            Project name
                        </label>
                        <input
                            id="project-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                            placeholder="My cozy cottage..."
                            maxLength={MAX_NAME_LENGTH}
                            disabled={submitting}
                            autoFocus
                            className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl py-2.5 px-4 font-body-md text-body-md text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-60"
                        />
                    </div>

                    {/* Ảnh thumbnail */}
                    <div className="flex flex-col gap-1.5">
                        <label className="font-label-lg text-label-lg text-on-surface-variant">
                            Thumbnail <span className="text-on-surface-variant/60">(optional)</span>
                        </label>
                        <div className="flex items-center gap-4">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={submitting}
                                className="relative w-24 h-24 flex-shrink-0 rounded-xl border-2 border-dashed border-outline-variant overflow-hidden bg-surface-variant flex items-center justify-center hover:border-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {previewUrl ? (
                                    <img src={previewUrl} alt="Thumbnail preview" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="material-symbols-outlined text-outline text-[28px]">add_photo_alternate</span>
                                )}
                            </button>
                            <div className="flex flex-col gap-1">
                                <span className="font-body-sm text-body-sm text-on-surface-variant">
                                    {file ? file.name : "No image selected"}
                                </span>
                                {file && (
                                    <button
                                        type="button"
                                        onClick={() => setFile(null)}
                                        disabled={submitting}
                                        className="font-label-sm text-label-sm text-error hover:underline w-fit disabled:opacity-60"
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            disabled={submitting}
                            className="hidden"
                        />
                    </div>

                    {error && (
                        <p className="font-label-sm text-label-sm text-error -mt-1">{error}</p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 mt-2">
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={submitting}
                            className="font-label-lg text-label-lg text-on-surface-variant px-4 py-2.5 rounded-xl hover:bg-surface-variant transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !trimmedName}
                            className="bg-primary text-on-primary font-label-lg text-label-lg rounded-xl py-2.5 px-5 shadow-[0_0_15px_rgba(248,180,0,0.3)] hover:bg-surface-tint hover:shadow-[0_0_20px_rgba(248,180,0,0.5)] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-[0_0_15px_rgba(248,180,0,0.3)]"
                        >
                            {submitting && (
                                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                            )}
                            {submitting ? "Creating..." : "Create"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
