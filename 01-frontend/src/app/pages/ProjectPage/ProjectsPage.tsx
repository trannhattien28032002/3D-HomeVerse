/**
 * Trang quản lý dự án — hiển thị danh sách project với tìm kiếm và tạo mới.
 *
 * Layout: Sidebar (nav + CTA) + Main (grid card).
 * SAMPLE_PROJECTS là dữ liệu tĩnh giả — sẽ được thay bằng API call trong tương lai.
 * Tìm kiếm filter realtime theo tên project (case-insensitive).
 */
import { useState } from "react";

type Project = {
    id: number;
    name: string;
    date: string;
    image: string;
};

const SAMPLE_PROJECTS: Project[] = [
    {
        id: 1,
        name: "Summer Cottage",
        date: "Oct 12, 2023",
        image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCLI4SS6cYP-aR9BG_8455ILZI1twieze0OfzXcqhao4XgJ74-TrL4v8Yj1v_-26BvsXgZwykmqvZOTxllTz4JjIjZeF2WPaHNzFlo2YZTpt-2QHXou6ZFk3Rj0ENUWpLy06cLGd8HIqamNdSzmNU0GyCkj2C7-mzDyTTOEoc9BETa8wLSTT2veXpxGXFfMlSKgabtXqW56S3_pKGEDAt2KGAnqAGqkRWvNTmJJ_eRh3IzmBzO7WK4t2BsEGh97FprSJP589mCeLqjh",
    },
    {
        id: 2,
        name: "Mountain Hut",
        date: "Nov 05, 2023",
        image: "https://lh3.googleusercontent.com/aida-public/AB6AXuD_Py_uD8I_ODDnmL2_EzBtcazLQAtnTIP0yuvbWWcSpBbgoZDOBl1QXho1OenVGpCzO_UzV75osNS5bdNH4MXI_dYra5ZPH0fJKp-b7ZgD_G4rFH2vbIr0c2TejYDFDmpn6rkoL4-kujysSBUwxfum5EpznJj2qTat4-VgoO-ycNjAl2q_G4CoYatP0ep98ClO7axZhRDVsnkpbdV4C3yMg3t-1c0YJ6-NbVQG9lWr4cNIIKsrVOIiYEcNDKpooRgxbfjjM2EREpTB",
    },
    {
        id: 3,
        name: "Wizard's Tower",
        date: "Dec 01, 2023",
        image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBEyfeKF7e8356Q7TPKVH4r3V7UmfkVtD92U0dbkP-dGJQRcxiL8ZA883rn-4blS7mKA2XbHamCmj3XICoMofsKhrI3VbN8Ym1P_FnUVOZCI7W9kLsDQtLsL6_8BjpIozOaatrfGSxr5jBocRcSvG7X5uclSnbLJUN58yIWV_E8uleFDEAIYBrLe-ymy5f7ZVK8Qq5tIFMN8XI06BZRD7m29mSoKUZKApOZC_-2qQJ5cSgMlnhfr_3w1Lm6yi8DVgs2kh0twPUYcu1W",
    },
];

function ProjectCard({ project }: { project: Project }) {
    return (
        <article className="bg-surface-container-highest/40 backdrop-blur-md rounded-xl overflow-hidden border border-outline-variant/30 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05),0_2px_4px_-1px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.5)] hover:shadow-[0_10px_15px_-3px_rgba(124,88,0,0.1),0_4px_6px_-2px_rgba(124,88,0,0.05)] transition-all duration-300 group flex flex-col min-h-[280px] relative">
            <div className="relative h-48 overflow-hidden w-full">
                <img
                    src={project.image}
                    alt={project.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-surface-dim/90 to-transparent" />
            </div>
            <div className="p-4 flex-1 flex flex-col justify-between relative bg-surface-dim/20 backdrop-blur-sm -mt-2 rounded-t-xl">
                <div className="flex justify-between items-start gap-2">
                    <div>
                        <h3 className="font-headline-sm text-headline-sm text-primary mb-1">{project.name}</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                            {project.date}
                        </p>
                    </div>
                    <button className="text-outline hover:text-primary transition-colors p-1 rounded-full hover:bg-surface-variant">
                        <span className="material-symbols-outlined">more_vert</span>
                    </button>
                </div>
            </div>
        </article>
    );
}

export default function ProjectsPage() {
    const [search, setSearch] = useState("");

    const filtered = SAMPLE_PROJECTS.filter(p =>
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
                <button className="w-full bg-primary text-on-primary font-label-lg text-label-lg rounded-xl py-3 px-4 shadow-[0_0_15px_rgba(248,180,0,0.3)] hover:bg-surface-tint hover:shadow-[0_0_20px_rgba(248,180,0,0.5)] transition-all duration-300 flex items-center justify-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    New Project
                </button>

                {/* Nav links */}
                <div className="flex-1 flex flex-col gap-2">
                    <a
                        href="#"
                        className="flex items-center gap-3 bg-primary-container text-on-primary-container rounded-xl px-4 py-3 shadow-[0_0_10px_rgba(248,180,0,0.4)] transition-transform duration-150 font-label-lg text-label-lg"
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
                    <a href="#" className="flex items-center gap-3 text-on-surface-variant px-4 py-3 hover:bg-surface-container-high rounded-xl transition-all hover:scale-[1.02] hover:shadow-sm font-label-lg text-label-lg">
                        <span className="material-symbols-outlined">help_outline</span>
                        Help Center
                    </a>
                    <a href="#" className="flex items-center gap-3 text-on-surface-variant px-4 py-3 hover:bg-surface-container-high rounded-xl transition-all hover:scale-[1.02] hover:shadow-sm font-label-lg text-label-lg">
                        <span className="material-symbols-outlined">logout</span>
                        Log Out
                    </a>
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

                    {/* Projects grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-gutter relative z-10">
                        {/* New Project card */}
                        <button className="group flex flex-col items-center justify-center gap-4 bg-surface-container-lowest border-2 border-dashed border-outline-variant rounded-xl p-6 min-h-[280px] shadow-sm hover:shadow-[0_0_20px_rgba(248,180,0,0.3)] hover:border-primary transition-all duration-300">
                            <div className="w-16 h-16 rounded-full bg-surface-variant flex items-center justify-center group-hover:bg-primary-container transition-colors duration-300">
                                <span className="material-symbols-outlined text-outline group-hover:text-primary text-[32px]">add</span>
                            </div>
                            <span className="font-headline-sm text-headline-sm text-on-surface-variant group-hover:text-primary transition-colors duration-300">New Project</span>
                        </button>

                        {filtered.map(project => (
                            <ProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
