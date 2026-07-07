/**
 * Trang quản lý dự án — shell ghép ProjectsSidebar + ProjectGrid (Phase 5.6).
 *
 * Dữ liệu/hành động danh sách từ useProjectList(); UI state (search, modal tạo/đổi tên/xoá,
 * profile) ở lại trang. "New Project" mở CreateProjectModal — tạo xong tự navigate vào editor.
 * Tìm kiếm filter realtime theo tên (case-insensitive).
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
import ProjectsSidebar from "src/app/pages/ProjectPage/ProjectsSidebar";
import ProjectGrid from "src/app/pages/ProjectPage/ProjectGrid";

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

            <ProjectsSidebar
                onNewProject={() => setModalOpen(true)}
                onProfile={() => setProfileOpen(true)}
                onLogout={handleLogout}
            />

            <ProjectGrid
                search={search}
                onSearchChange={setSearch}
                loadState={loadState}
                loadError={loadError}
                filtered={filtered}
                nextCursor={nextCursor}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                onNewProject={() => setModalOpen(true)}
                onRename={setRenameTarget}
                onDuplicate={duplicate}
                onDelete={setDeleteTarget}
            />

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
