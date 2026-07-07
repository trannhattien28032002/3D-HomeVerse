/**
 * ProjectsSidebar — nav trái của ProjectsPage: logo + CTA "New Project" + nav links +
 * footer (Hồ sơ / Đăng xuất). Thuần trình bày — mọi hành động đẩy lên qua callback.
 * Tách từ ProjectsPage (Phase 5.6).
 */
type Props = {
    onNewProject: () => void;
    onProfile: () => void;
    onLogout: () => void;
};

export default function ProjectsSidebar({ onNewProject, onProfile, onLogout }: Props) {
    return (
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
                onClick={onNewProject}
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
                    onClick={onProfile}
                    className="flex items-center gap-3 text-on-surface-variant px-4 py-3 hover:bg-surface-container-high rounded-xl transition-all hover:scale-[1.02] hover:shadow-sm font-label-lg text-label-lg text-left"
                >
                    <span className="material-symbols-outlined">account_circle</span>
                    Hồ sơ
                </button>
                <button
                    onClick={onLogout}
                    className="flex items-center gap-3 text-on-surface-variant px-4 py-3 hover:bg-surface-container-high rounded-xl transition-all hover:scale-[1.02] hover:shadow-sm font-label-lg text-label-lg text-left"
                >
                    <span className="material-symbols-outlined">logout</span>
                    Đăng xuất
                </button>
            </div>
        </nav>
    );
}
