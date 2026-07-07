import { useState } from 'react';
import './HomePage.css';
import { Link } from 'react-router-dom';

/**
 * HomePage — landing "Tiny Home" theo mẫu scratch/home.html.
 *
 * Bố cục (cân giữa, tối giản): Header (scroll đổ bóng) → Hero (Build Your Sanctuary) →
 * Philosophy 3 cột → Community Stats → Gallery Preview 4 cột → CTA → Footer.
 * Mọi nút "Start Building" điều hướng tới /projects (luồng tạo dự án).
 * Token màu/typography dùng Tailwind theme của dự án (trùng với config trong mock).
 */

const GALLERY = [
    {
        title: 'The Morning Nook',
        author: 'by Elara Craft',
        src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAcV6OGPkjR1mBcfGCFaeCCvlIzTjO5aQY3HH18NQmXCjjwacqBIX-B3UF5wjknupZP01_-mHmCh09M8f2ud_DOtQ_-fC9L1tPry_0ra5JOtsLSZe4ROXbiNimesKbrs72JXFnFq1d89-rW0QdbBcRa7RsKIkFybYMaGasg0JQqOLcZuCheiCi2iSVfb9zo0-a1vEkYYjD9LovZbp9gOGEsNKC-Wjs1G6DTkv2zr0O5baoUvvOootMnqdKF3WG61k7gm_Su8Ul169Lg',
    },
    {
        title: "Baker's Hearth",
        author: 'by Thorne Forge',
        src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCLIegHdJwe2mTOJJD9MJfGjKUen4IVw7DGFkV-TxNiSiEv-FGn7dp1zTIkCILmSfIGB7Nj0H3D_7Ftoq4Oit8IgHANd7tpkMkLYMwfKdT2WZsuHIaZ4FQBn07mhYOKfIQZONODGuasuKe69NHX0ZN6Yr78kMu1ZxzySkpL2p6dm-y6vsJaLUXdAP-eMRut8Le2suXOncSkV25XOIh4r1vSqTjMVuDyOvlto57RPyG3zHuWdH8A4J1KKhjbrYBGJyr_65qeiC4uB44P',
    },
    {
        title: "The Architect's Attic",
        author: 'by Mira Line',
        src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAk96bpo2JHa2_weSOMwT2EtLjx2mo8Y67hB-HVGN5FCJcG_j87yqOUyXKo9BOMeYlftNp0UVx1zmMU3x9-HLdFg-ecmpnrhH4wqs9D3PTQMZY3ucMNJ59ZssN5fChIbrHkz9e2-oOWgvEsiWMWHDwDpQMImFIk9UyJy3cnNsX-k6jPQXKIW_JIbHCIGd_medzrkWrzJiUTJIqZt1ajSqsi75XIr58hDNazYYqIvZ8NYiLIt0RWidv4C-qVMFwn1oinehcTVSfPBgSP',
    },
    {
        title: 'Glass Conservatory',
        author: 'by Julian Leaf',
        src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBgYLlfej27xFWZZ_Zc_3eOZQ_rmlcljJyneaoffJLLmPzYK0CbocWH0-gz03_40h5UPRyrBMDDnPLG3ZcV86XPAJsq-mPX8-GWBFmMvOdihIikUburgmSq99kRCcghvWVPnyvqwDmXSW68IWK757Pb4b5ThfFKYAIbqyL__6udVY-wV6cXG0gTSxfHpAvjsx-sVJMd0X8M6Hrfve0rxwc5-QG-86ODUSVKx6lYOYnn4G9xgG1Cueyp5wFGiZBu5G2x8gddnBR0ltpP',
    },
];

const AVATARS = [
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAziUuTSLKvZH2tsYJioO_sosU-HYSLn093c4PkPdgmLcoMYqMJMyEXz92V7Ohwno32NC0DaB70kbCj8Lqg0A9RgUvlEDYf4qbcLVjpitQQKwPYyBkMeRneoK_L0X0uzWEC85SIuv9A_-YzpegemusHFo8qKcSFtUCQz-mSadIjtfYZfBWeWQ5bki2JPzGBKnospgU9Y5mLRf8bnS-IpBb5TbTzlqsC6vdfppqITmrNNwgojK1WFTweBYULf4cvWSTmMEwaKI6y0Mpm',
    'https://lh3.googleusercontent.com/aida-public/AB6AXuB6Dm8DqFTJ4cHHStTGESi5gy5ucgAz0QFQePhzBY-m4ck_8TEveaqIBbSB1L0XsqfYpNMIroUEAkRag66fG74L1IsyNcRriD6WL_Lu-4UD2BcBYqjibx4HXlJ4U-0nDoFR81E_SwBF6i6mChi23sJy-OZxYwIBZ5SXR7WjPiWma3tjqpx4P1OMpixqU23SJn9Sp2QFD286rNMSMbcf5fHfVoeVLetTsjnQ-5yYMa9k49vQ-nPjpJDAjFDeFxKelCqeZPpmAp-MtGoA',
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDPX8OLyYs31sZOeuz_cu_XN6qfXiJwMBxlUtcvytBrgCAt0XU_Dn9AorGIQDLMe2Mz78DhCVfmAsYu2haKDOE4ZHdaGUJGvILjFxTKmUxkeH3zXqyb5kSdXGLAHnDhA96R5eTUyVue8kL_GcT03KKip0iXIkADmCjtF41CRU41gIwIWj2AamuAgIQD42_ZJ0mt7BhHM9A8OK1kk2IDnwj7aVqssYJYFkI7T8X50QElYB2L6hhkSoWZutPQtSRr9cK2pRyygWDjxKxp',
    'https://lh3.googleusercontent.com/aida-public/AB6AXuBHS8wGSrjqVUORSfiDjLOuZv7DOzUG7UKaWM6U4xdy7_WdiwJznWXJEeBO8-IaaJ9hXj2KQDzZR98kS44NBLY5l37n8WJCOGsgcaYSsWsRn2ZyrytpFggA5PkLiaz4yyw2Q3z9KLAJe4-dGvDcDumWaFBTWfC_ShuvfnD_PKNBZQAD4aOS-kVJX-yNi7R-E2bvpFPcTeyi62RqYRyeCt6V9YfKPszC1t3AujRjwD9uqyXfnl7KRpTlE49jE-TuZ1joZYwxD_vv4XjA',
];

const HERO_IMG =
    'https://lh3.googleusercontent.com/aida/AP1WRLut9rgQaCUM9MDmKT8OJ_V_bifC7efw3GwyKnIAxxSSM8XMKw2Ub9TyKzjkKT8O2dbPIC8csm5lskEz6xaHLkbZuWVLLvQ_zaDo0udGUE1_PRk6SK65nwWHaiJ5x1plWMSGgjLAd69VyeojxEmAWaoJ0-LlSu_KyXQCURpBJ1dHwFZvszqyjH0gNzZo5hq7hg7ibfPjezfltYph8K8quXK9vCKc-vsrQ5VZO7mSDd7GU88WVc5-Qymrt58I';

export default function HomePage() {
    const [scrolled, setScrolled] = useState(false);

    return (
        <div
            onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 20)}
            className="bg-background text-on-background font-body-md h-screen overflow-y-auto overflow-x-hidden scroll-smooth selection:bg-primary-container/30"
        >
            {/* TopNavBar */}
            <header
                className={`fixed top-0 w-full z-50 bg-background/80 backdrop-blur-xl border-b border-primary/5 transition-all duration-500 ${scrolled ? 'shadow-sm' : ''
                    }`}
            >
                <nav
                    className={`flex justify-between items-center max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop transition-all duration-500 ${scrolled ? 'py-3' : 'py-4'
                        }`}
                >
                    <div className="font-headline-md text-headline-md text-primary tracking-tight">Tiny Home</div>
                    <div className="hidden md:flex items-center gap-8">
                        <a className="font-label-lg text-label-lg text-on-surface-variant hover:text-primary transition-colors relative nav-active-dot" href="#gallery">Gallery</a>
                        <a className="font-label-lg text-label-lg text-on-surface-variant hover:text-primary transition-colors" href="#community">Blueprints</a>
                        <a className="font-label-lg text-label-lg text-on-surface-variant hover:text-primary transition-colors" href="#community">Community</a>
                    </div>
                    <Link
                        to="/projects"
                        className="bg-primary-container text-on-primary-container px-6 py-2 rounded-full font-label-lg text-label-lg hover:shadow-[0_0_15px_rgba(248,180,0,0.3)] transition-all active:scale-95"
                    >
                        Start Building
                    </Link>
                </nav>
            </header>

            <main className="pt-24">
                {/* Hero Section */}
                <section className="relative min-h-[85vh] flex flex-col items-center justify-center text-center px-margin-mobile hero-glow">
                    <div className="max-w-4xl w-full mb-12">
                        <h1 className="font-headline-xl text-headline-xl text-on-background mb-4 opacity-0 translate-y-4 animate-[fadeIn_0.8s_ease-out_forwards]">
                            Build Your Sanctuary
                        </h1>
                        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl mx-auto opacity-0 translate-y-4 animate-[fadeIn_0.8s_ease-out_0.2s_forwards]">
                            Experience the quiet joy of artisanal miniature design in a sun-drenched digital village.
                        </p>
                    </div>
                    <Link
                        to="/projects"
                        className="bg-primary text-on-primary px-10 py-4 rounded-full font-label-lg text-label-lg hover:bg-primary/90 hover:shadow-[0_4px_20px_rgba(124,88,0,0.2)] transition-all active:scale-95 opacity-0 animate-[fadeIn_0.8s_ease-out_0.6s_forwards]"
                    >
                        Start Building
                    </Link>
                </section>

                {/* Philosophy Section */}
                <section className="py-24 px-margin-mobile md:px-margin-desktop max-w-[1280px] mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-16 text-center">
                        <div className="flex flex-col items-center">
                            <span className="material-symbols-outlined text-primary text-4xl mb-6">architecture</span>
                            <h3 className="font-headline-sm text-headline-sm text-on-background mb-3">Tactile Precision</h3>
                            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                                Every joint, texture, and grain is rendered with the care of a master craftsman.
                            </p>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="material-symbols-outlined text-primary text-4xl mb-6">auto_awesome</span>
                            <h3 className="font-headline-sm text-headline-sm text-on-background mb-3">Infinite Curation</h3>
                            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                                A curated selection of hand-painted assets to fulfill your specific aesthetic vision.
                            </p>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="material-symbols-outlined text-primary text-4xl mb-6">diversity_3</span>
                            <h3 className="font-headline-sm text-headline-sm text-on-background mb-3">Village Spirit</h3>
                            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                                Join a community of builders sharing blueprints in our collaborative open market.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Community Stats */}
                <section className="py-12 border-y border-outline-variant/20" id="community">
                    <div className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop flex flex-col md:flex-row justify-center items-center gap-6">
                        <div className="flex -space-x-3 overflow-hidden">
                            {AVATARS.map((src, i) => (
                                <img key={i} alt="Community builder" className="inline-block h-10 w-10 rounded-full ring-2 ring-background object-cover" src={src} />
                            ))}
                        </div>
                        <p className="font-label-lg text-label-lg text-on-surface-variant">
                            Joined by <span className="text-primary font-bold">12,400+</span> active builders creating their sanctuaries today.
                        </p>
                    </div>
                </section>

                {/* Gallery Preview */}
                <section className="py-24 px-margin-mobile md:px-margin-desktop max-w-[1280px] mx-auto" id="gallery">
                    <div className="flex justify-between items-end mb-12">
                        <div>
                            <h2 className="font-headline-lg text-headline-lg text-on-background">Community Masterpieces</h2>
                            <p className="font-body-md text-body-md text-on-surface-variant mt-2">Selected works from our guild members.</p>
                        </div>
                        <a className="font-label-lg text-label-lg text-primary flex items-center gap-2 group" href="#gallery">
                            View Gallery
                            <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
                        </a>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
                        {GALLERY.map((item) => (
                            <div key={item.title} className="group cursor-pointer">
                                <div className="aspect-square bg-surface-container overflow-hidden rounded-lg border border-outline-variant/30 mb-4 transition-all group-hover:border-primary/40">
                                    <img alt={item.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" src={item.src} />
                                </div>
                                <p className="font-label-lg text-label-lg text-on-background">{item.title}</p>
                                <p className="font-label-sm text-label-sm text-on-surface-variant">{item.author}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* CTA Section */}
                <section className="py-32 text-center bg-surface-container-low/50">
                    <div className="max-w-2xl mx-auto px-margin-mobile">
                        <h2 className="font-headline-lg text-headline-lg text-on-background mb-6">Ready to create your own?</h2>
                        <p className="font-body-lg text-body-lg text-on-surface-variant mb-10">
                            Start your journey today with our curated starter kit. Simple, elegant, and entirely yours.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link
                                to="/projects"
                                className="bg-primary text-on-primary px-10 py-4 rounded-full font-label-lg text-label-lg hover:shadow-lg transition-all active:scale-95"
                            >
                                Start Building
                            </Link>
                            <a
                                href="#gallery"
                                className="border border-outline text-on-surface px-10 py-4 rounded-full font-label-lg text-label-lg hover:bg-surface-container transition-all active:scale-95"
                            >
                                Explore Blueprints
                            </a>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="w-full mt-auto bg-surface-container-low border-t border-outline-variant/30">
                <div className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop py-12 flex flex-col md:flex-row justify-between items-center gap-gutter">
                    <div className="flex flex-col items-center md:items-start gap-2">
                        <div className="font-headline-sm text-headline-sm text-primary">Tiny Home</div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">© 2024 Tiny Home. Handcrafted with magic.</p>
                    </div>
                    <div className="flex gap-8">
                        <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-tertiary transition-colors" href="#">Terms of Service</a>
                        <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-tertiary transition-colors" href="#">Privacy Scrolls</a>
                        <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-tertiary transition-colors" href="#">Support Guild</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
