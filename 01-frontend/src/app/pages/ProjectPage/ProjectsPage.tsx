/**
 * Trang quản lý dự án — hiển thị danh sách project với tìm kiếm và tạo mới.
 *
 * Layout: Sidebar (nav + CTA) + Main (grid card).
 * Danh sách project load từ backend qua listProjects(); "New Project" (CTA sidebar
 * và card dashed) mở CreateProjectModal — tạo xong modal tự navigate vào editor.
 * Tìm kiếm filter realtime theo tên project (case-insensitive).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateProjectModal from "src/app/components/project/CreateProjectModal";
import RenameProjectModal from "src/app/components/project/RenameProjectModal";
import ProfileModal from "src/app/components/project/ProfileModal";
import ConfirmDialog from "src/app/components/common/ConfirmDialog";
import { useProjectList, type ProjectMeta } from "src/app/hooks/useProjectList";
import { toast } from "src/app/store/useToastStore";
import { useAuthStore } from "src/app/store/useAuthStore";

const PLACEHOLDER_THUMBNAIL =
    "https://lh3.googleusercontent.com/aida-public/AB6AXuCLI4SS6cYP-aR9BG_8455ILZI1twieze0OfzXcqhao4XgJ74-TrL4v8Yj1v_-26BvsXgZwykmqvZOTxllTz4JjIjZeF2WPaHNzFlo2YZTpt-2QHXou6ZFk3Rj0ENUWpLy06cLGd8HIqamNdSzmNU0GyCkj2C7-mzDyTTOEoc9BETa8wLSTT2veXpxGXFfMlSKgabtXqW56S3_pKGEDAt2KGAnqAGqkRWvNTmJJ_eRh3IzmBzO7WK4t2BsEGh97FprSJP589mCeLqjh";

type ProjectCardProps = {
    project: ProjectMeta;
    onRename: (project: ProjectMeta) => void;
    onDuplicate: (project: ProjectMeta) => void;
    onDelete: (project: ProjectMeta) => void;
};

function ProjectCard({ project, onRename, onDuplicate, onDelete }: ProjectCardProps) {
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const dateLabel = new Date(project.createdAt).toLocaleDateString();

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
                    <div className="relative flex-shrink-0">
                        <button
                            aria-label="Tuỳ chọn project"
                            onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen((o) => !o);
                            }}
                            className="text-outline hover:text-primary transition-colors p-1 rounded-full hover:bg-surface-variant"
                        >
                            <span className="material-symbols-outlined">more_vert</span>
                        </button>
                        {menuOpen && (
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
                                    className="absolute right-0 top-full mt-1 z-[201] w-44 bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-[0_12px_32px_rgba(var(--rgb-primary),0.18)] py-1.5 flex flex-col"
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
                            </>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}

export default function ProjectsPage() {
    const navigate = useNavigate();
    const signOut = useAuthStore((s) => s.signOut);

    const {
        projects,
        loadState,
        loadError,
        nextCursor,
        loadingMore,
        actionBusy,
        addCreated,
        loadMore,
        renameProject,
        duplicate,
        removeProject,
    } = useProjectList();

    const [search, setSearch] = useState("");
    const [modalOpen, setModalOpen] = useState(false);

    // Project actions (WP3.1) — modal/confirm target là UI state, ở lại component.
    const [renameTarget, setRenameTarget] = useState<ProjectMeta | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<ProjectMeta | null>(null);

    // Profile (WP3.4)
    const [profileOpen, setProfileOpen] = useState(false);

    const handleRenameSubmit = async (name: string) => {
        if (!renameTarget) return;
        const ok = await renameProject(renameTarget.id, name);
        if (ok) setRenameTarget(null);
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        const ok = await removeProject(deleteTarget.id);
        if (ok) setDeleteTarget(null);
    };

    const handleLogout = async () => {
        try {
            await signOut();
            navigate("/login");
        } catch {
            toast.error("Đăng xuất thất bại.");
        }
    };

    const filtered = projects.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="bg-surface text-on-surface font-body-md h-screen w-full flex overflow-hidden relative">
            {/* Grain overlay */}
            <div
                className="pointer-events-none fixed inset-0 z-[-1] opacity-5 mix-blend-multiply"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Sidebar */}
            <nav className="hidden md:flex flex-shrink-0 bg-surface-container-low/60 backdrop-blur-2xl border-r border-outline-variant/20 shadow-xl h-screen w-64 flex-col p-gutter gap-4 relative z-20">
                {/* Logo */}
                <div className="flex items-center gap-3 px-2 pt-2 pb-6">
                    <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)]">
                        <span
                            className="material-symbols-outlined text-on-primary-container"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                            castle
                        </span>
                    </div>
                    <div>
                        <h1 className="font-headline-md text-headline-md text-primary">Tiny Home</h1>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">Cozy Architect</p>
                    </div>
                </div>

                {/* New Project CTA */}
                <button
                    onClick={() => setModalOpen(true)}
                    className="w-full bg-primary text-on-primary font-label-lg text-label-lg rounded-xl py-3 px-4 shadow-[0_0_15px_rgba(var(--rgb-primary-container),0.3)] hover:bg-surface-tint hover:shadow-[0_0_20px_rgba(var(--rgb-primary-container),0.5)] transition-all duration-300 flex items-center justify-center gap-2 mb-4"
                >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    New Project
                </button>

                {/* Nav links */}
                <div className="flex-1 flex flex-col gap-2">
                    <a
                        href="#"
                        className="flex items-center gap-3 bg-primary-container text-on-primary-container rounded-xl px-4 py-3 shadow-[0_0_10px_rgba(var(--rgb-primary-container),0.4)] transition-transform duration-150 font-label-lg text-label-lg"
                    >
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>home_work</span>
                        My Projects
                    </a>
                    <a href="#" className="flex items-center gap-3 text-on-surface-variant px-4 py-3 hover:bg-surface-container-high rounded-xl transition-all hover:scale-[1.02] hover:shadow-sm font-label-lg text-label-lg">
                        <span className="material-symbols-outlined">auto_awesome</span>
                        Design Gallery
                    </a>
                    <a href="#" className="flex items-center gap-3 text-on-surface-variant px-4 py-3 hover:bg-surface-container-high rounded-xl transition-all hover:scale-[1.02] hover:shadow-sm font-label-lg text-label-lg">
                        <span className="material-symbols-outlined">architecture</span>
                        Blueprints
                    </a>
                    <a href="#" className="flex items-center gap-3 text-on-surface-variant px-4 py-3 hover:bg-surface-container-high rounded-xl transition-all hover:scale-[1.02] hover:shadow-sm font-label-lg text-label-lg">
                        <span className="material-symbols-outlined">group</span>
                        Community
                    </a>
                </div>

                {/* Footer links */}
                <div className="flex flex-col gap-2 pt-4 border-t border-outline-variant/30">
                    <button
                        onClick={() => setProfileOpen(true)}
                        className="flex items-center gap-3 text-on-surface-variant px-4 py-3 hover:bg-surface-container-high rounded-xl transition-all hover:scale-[1.02] hover:shadow-sm font-label-lg text-label-lg text-left"
                    >
                        <span className="material-symbols-outlined">account_circle</span>
                        Hồ sơ
                    </button>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 text-on-surface-variant px-4 py-3 hover:bg-surface-container-high rounded-xl transition-all hover:scale-[1.02] hover:shadow-sm font-label-lg text-label-lg text-left"
                    >
                        <span className="material-symbols-outlined">logout</span>
                        Đăng xuất
                    </button>
                </div>
            </nav>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto w-full relative">
                <div className="max-w-[1280px] mx-auto p-margin-mobile md:p-margin-desktop min-h-full flex flex-col gap-8">

                    {/* Page header */}
                    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant/30 pb-6 relative z-10">
                        <div>
                            <h2 className="font-headline-xl text-headline-xl text-primary drop-shadow-sm">My Projects</h2>
                            <p className="font-body-lg text-body-lg text-on-surface-variant mt-2">Manage your cozy creations.</p>
                        </div>
                        <div className="relative w-full md:w-64">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
                            <input
                                type="text"
                                placeholder="Search creations..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full bg-surface-container-lowest border border-outline-variant rounded-full py-2 pl-10 pr-4 font-body-sm text-body-sm text-on-surface shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                            />
                        </div>
                    </header>

                    {loadState === "loading" && (
                        <div className="flex-1 flex items-center justify-center py-20 relative z-10">
                            <p className="font-body-lg text-body-lg text-on-surface-variant flex items-center gap-2">
                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                Loading projects...
                            </p>
                        </div>
                    )}

                    {loadState === "error" && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-20 relative z-10">
                            <span className="material-symbols-outlined text-error text-[32px]">error_outline</span>
                            <p className="font-body-lg text-body-lg text-error">{loadError}</p>
                        </div>
                    )}

                    {(loadState === "ready" || loadState === "empty") && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-gutter relative z-10">
                            {/* New Project card */}
                            <button
                                onClick={() => setModalOpen(true)}
                                className="group flex flex-col items-center justify-center gap-4 bg-surface-container-lowest border-2 border-dashed border-outline-variant rounded-xl p-6 min-h-[280px] shadow-sm hover:shadow-[0_0_20px_rgba(var(--rgb-primary-container),0.3)] hover:border-primary transition-all duration-300"
                            >
                                <div className="w-16 h-16 rounded-full bg-surface-variant flex items-center justify-center group-hover:bg-primary-container transition-colors duration-300">
                                    <span className="material-symbols-outlined text-outline group-hover:text-primary text-[32px]">add</span>
                                </div>
                                <span className="font-headline-sm text-headline-sm text-on-surface-variant group-hover:text-primary transition-colors duration-300">New Project</span>
                            </button>

                            {filtered.map(project => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                                    onRename={setRenameTarget}
                                    onDuplicate={duplicate}
                                    onDelete={setDeleteTarget}
                                />
                            ))}
                        </div>
                    )}

                    {/* Load more (WP3.2) — ẩn khi đang lọc search để tránh nhầm lẫn */}
                    {loadState === "ready" && nextCursor && search.trim() === "" && (
                        <div className="flex justify-center pt-2 pb-8 relative z-10">
                            <button
                                onClick={loadMore}
                                disabled={loadingMore}
                                className="font-label-lg text-label-lg text-primary border border-outline-variant/50 rounded-full py-2.5 px-6 hover:bg-surface-container-high transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {loadingMore && (
                                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                                )}
                                {loadingMore ? "Đang tải..." : "Tải thêm"}
                            </button>
                        </div>
                    )}
                </div>
            </main>

            <CreateProjectModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onCreated={addCreated}
            />

            <RenameProjectModal
                open={renameTarget !== null}
                initialName={renameTarget?.name ?? ""}
                busy={actionBusy}
                onSubmit={handleRenameSubmit}
                onCancel={() => { if (!actionBusy) setRenameTarget(null); }}
            />

            <ConfirmDialog
                open={deleteTarget !== null}
                title="Xoá project?"
                message={`Project "${deleteTarget?.name ?? ""}" sẽ được chuyển vào thùng rác. Bạn có thể khôi phục sau.`}
                confirmLabel="Xoá"
                danger
                busy={actionBusy}
                onConfirm={handleDeleteConfirm}
                onCancel={() => { if (!actionBusy) setDeleteTarget(null); }}
            />

            <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
        </div>
    );
}
