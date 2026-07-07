/**
 * ProjectCard — 1 card project trong grid: thumbnail + tên + ngày + menu ngữ cảnh
 * (đổi tên / nhân bản / xoá). Click card → vào editor. Tách từ ProjectsPage (Phase 5.6).
 */
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { ProjectMeta } from "src/app/hooks/useProjectList";

const PLACEHOLDER_THUMBNAIL =
    "https://lh3.googleusercontent.com/aida-public/AB6AXuCLI4SS6cYP-aR9BG_8455ILZI1twieze0OfzXcqhao4XgJ74-TrL4v8Yj1v_-26BvsXgZwykmqvZOTxllTz4JjIjZeF2WPaHNzFlo2YZTpt-2QHXou6ZFk3Rj0ENUWpLy06cLGd8HIqamNdSzmNU0GyCkj2C7-mzDyTTOEoc9BETa8wLSTT2veXpxGXFfMlSKgabtXqW56S3_pKGEDAt2KGAnqAGqkRWvNTmJJ_eRh3IzmBzO7WK4t2BsEGh97FprSJP589mCeLqjh";

type ProjectCardProps = {
    project: ProjectMeta;
    onRename: (project: ProjectMeta) => void;
    onDuplicate: (project: ProjectMeta) => void;
    onDelete: (project: ProjectMeta) => void;
};

export default function ProjectCard({ project, onRename, onDuplicate, onDelete }: ProjectCardProps) {
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    // Toạ độ fixed của menu (render qua portal để không bị article overflow-hidden cắt).
    const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
    const dateLabel = new Date(project.createdAt).toLocaleDateString();

    // Tính vị trí menu neo theo nút more_vert mỗi khi mở.
    useLayoutEffect(() => {
        if (!menuOpen) return;
        const place = () => {
            const r = triggerRef.current?.getBoundingClientRect();
            if (r) setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [menuOpen]);

    const runAction = (action: () => void) => (e: React.MouseEvent) => {
        e.stopPropagation();
        setMenuOpen(false);
        action();
    };

    return (
        <article
            onClick={() => navigate(`/project/${project.id}`)}
            className="bg-surface-container-highest/40 backdrop-blur-md rounded-xl overflow-hidden border border-outline-variant/30 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05),0_2px_4px_-1px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.5)] hover:shadow-[0_10px_15px_-3px_rgba(var(--rgb-primary),0.1),0_4px_6px_-2px_rgba(var(--rgb-primary),0.05)] transition-all duration-300 group flex flex-col min-h-[280px] relative cursor-pointer"
        >
            <div className="relative h-48 overflow-hidden w-full">
                <img
                    src={project.thumbnailUrl ?? PLACEHOLDER_THUMBNAIL}
                    alt={project.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-surface-dim/90 to-transparent" />
            </div>
            <div className="p-4 flex-1 flex flex-col justify-between relative bg-surface-dim/20 backdrop-blur-sm -mt-2 rounded-t-xl">
                <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                        <h3 className="font-headline-sm text-headline-sm text-primary mb-1 truncate">{project.name}</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                            {dateLabel}
                        </p>
                    </div>
                    <div className="flex-shrink-0">
                        <button
                            ref={triggerRef}
                            aria-label="Tuỳ chọn project"
                            onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen((o) => !o);
                            }}
                            className="text-outline hover:text-primary transition-colors p-1 rounded-full hover:bg-surface-variant"
                        >
                            <span className="material-symbols-outlined">more_vert</span>
                        </button>
                        {menuOpen && menuPos && createPortal(
                            <>
                                {/* Backdrop bắt click ngoài để đóng menu */}
                                <button
                                    aria-hidden
                                    tabIndex={-1}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuOpen(false);
                                    }}
                                    className="fixed inset-0 z-[200] cursor-default"
                                />
                                <div
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ top: menuPos.top, right: menuPos.right }}
                                    className="fixed z-[201] w-44 bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-[0_12px_32px_rgba(var(--rgb-primary),0.18)] py-1.5 flex flex-col"
                                >
                                    <button
                                        onClick={runAction(() => onRename(project))}
                                        className="flex items-center gap-3 px-4 py-2.5 font-body-md text-body-md text-on-surface hover:bg-surface-variant transition-colors text-left"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">edit</span>
                                        Đổi tên
                                    </button>
                                    <button
                                        onClick={runAction(() => onDuplicate(project))}
                                        className="flex items-center gap-3 px-4 py-2.5 font-body-md text-body-md text-on-surface hover:bg-surface-variant transition-colors text-left"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">content_copy</span>
                                        Nhân bản
                                    </button>
                                    <button
                                        onClick={runAction(() => onDelete(project))}
                                        className="flex items-center gap-3 px-4 py-2.5 font-body-md text-body-md text-error hover:bg-error/10 transition-colors text-left"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">delete</span>
                                        Xoá
                                    </button>
                                </div>
                            </>,
                            document.body,
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}
