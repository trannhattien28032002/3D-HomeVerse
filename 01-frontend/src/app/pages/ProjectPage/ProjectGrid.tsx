/**
 * ProjectGrid — vùng main của ProjectsPage: header (tiêu đề + ô tìm kiếm), trạng thái
 * load (loading/error), grid card (card "New Project" + danh sách ProjectCard) và nút
 * "Tải thêm". Thuần trình bày — danh sách/loadState/hành động nhận qua props từ trang.
 * Tách từ ProjectsPage (Phase 5.6).
 */
import type { ProjectMeta, LoadState } from "src/app/hooks/useProjectList";
import ProjectCard from "src/app/pages/ProjectPage/ProjectCard";

type Props = {
    search: string;
    onSearchChange: (value: string) => void;
    loadState: LoadState;
    loadError: string | null;
    filtered: ProjectMeta[];
    nextCursor: string | null;
    loadingMore: boolean;
    onLoadMore: () => void;
    onNewProject: () => void;
    onRename: (project: ProjectMeta) => void;
    onDuplicate: (project: ProjectMeta) => void;
    onDelete: (project: ProjectMeta) => void;
};

export default function ProjectGrid({
    search, onSearchChange,
    loadState, loadError, filtered,
    nextCursor, loadingMore, onLoadMore,
    onNewProject, onRename, onDuplicate, onDelete,
}: Props) {
    return (
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
                            onChange={e => onSearchChange(e.target.value)}
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
                            onClick={onNewProject}
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
                                onRename={onRename}
                                onDuplicate={onDuplicate}
                                onDelete={onDelete}
                            />
                        ))}
                    </div>
                )}

                {/* Load more (WP3.2) — ẩn khi đang lọc search để tránh nhầm lẫn */}
                {loadState === "ready" && nextCursor && search.trim() === "" && (
                    <div className="flex justify-center pt-2 pb-8 relative z-10">
                        <button
                            onClick={onLoadMore}
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
    );
}
