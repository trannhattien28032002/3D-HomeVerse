import { useEffect, useRef } from 'react';
import './HomePage.css';
import { Link } from 'react-router-dom';

export default function HomePage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const galleryRef = useRef<HTMLDivElement>(null);
    const sparkleContainerRef = useRef<HTMLDivElement>(null);

    // Reveal animations
    useEffect(() => {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                }
            });
        }, observerOptions);

        if (containerRef.current) {
            const elements = containerRef.current.querySelectorAll('.reveal');
            elements.forEach(el => observer.observe(el));
        }

        return () => observer.disconnect();
    }, []);

    // Particle/Sparkle effect
    useEffect(() => {
        const container = sparkleContainerRef.current;
        if (!container) return;

        let intervalId: any;

        const createParticle = () => {
            const p = document.createElement('div');
            p.classList.add('particle');
            const size = Math.random() * 4 + 1;
            p.style.width = `${size}px`;
            p.style.height = `${size}px`;
            p.style.left = `${Math.random() * 100}vw`;
            p.style.top = `${Math.random() * 100 + 100}vh`;
            p.style.animation = `drift ${Math.random() * 10 + 15}s linear forwards`;

            container.appendChild(p);
            setTimeout(() => {
                if (container.contains(p)) {
                    p.remove();
                }
            }, 25000);
        };

        intervalId = setInterval(createParticle, 300);

        return () => clearInterval(intervalId);
    }, []);

    // Carousel Scroll
    const scrollGallery = (amount: number) => {
        if (galleryRef.current) {
            galleryRef.current.scrollBy({ left: amount, behavior: 'smooth' });
        }
    };

    // Parallax
    const handleScroll = () => {
        if (!containerRef.current) return;
        const scrolled = containerRef.current.scrollTop;
        const elements = containerRef.current.querySelectorAll('.parallax-bg') as NodeListOf<HTMLElement>;
        elements.forEach(el => {
            const speed = parseFloat(el.dataset.speed || '0.5');
            el.style.transform = `translateY(${scrolled * speed}px)`;
        });
    };

    return (
        <div
            ref={containerRef}
            onScroll={handleScroll}
            className="bg-background text-on-background font-body-md h-screen overflow-y-auto overflow-x-hidden selection:bg-primary-container/30 scroll-smooth"
        >
            {/* Sparkle Canvas */}
            <div ref={sparkleContainerRef} className="fixed inset-0 z-0 pointer-events-none"></div>

            {/* TopNavBar */}
            <nav className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-md border-b border-primary/5">
                <div className="flex justify-between items-center max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop py-4">
                    <div className="flex items-center gap-3">
                        <img alt="Tiny Home Logo" className="w-10 h-10 rounded-full" src="https://lh3.googleusercontent.com/aida/AP1WRLvEi2oAra0WtaOFX5TC0Znd2OV6NaQbf_8G-x2BTD6KHhVm5XYfpXN0_RP05Q77529EleEpDHtHH-ufLgoBZo7O_N8Yclzuy7jRGsE4Q0i9RaUlaYWc26sYwiQj-J_KfTsbsJrJ7wYlOk54dTQi_UaepK2tvEt5g_bCVDg_3lOgXeBwqyUVj99UW5M4fAP05cuiJb4kvhj30hd9SY230Ee1XIKIDIkdCyhM8tIA43few7FKfVZ3gDppufIK" />
                        <span className="font-headline-md text-primary tracking-tight">Tiny Home</span>
                    </div>
                    <div className="hidden md:flex gap-10 items-center">
                        <a className="text-on-surface-variant hover:text-primary transition-colors font-label-lg" href="#gallery">Gallery</a>
                        <a className="text-on-surface-variant hover:text-primary transition-colors font-label-lg" href="#blueprints">Blueprints</a>
                        <a className="text-on-surface-variant hover:text-primary transition-colors font-label-lg" href="#community">Community</a>
                        <Link
                            to="/projects"
                            className="bg-primary text-on-primary font-label-lg px-6 py-2.5 rounded-full hover:shadow-lg hover:shadow-primary/20 active:scale-95 transition-all"
                        >
                            Start Building
                        </Link>
                    </div>
                    <button className="md:hidden text-primary">
                        <span className="material-symbols-outlined">menu</span>
                    </button>
                </div>
            </nav>

            <main className="relative z-10">
                {/* Hero Section */}
                <section className="relative min-h-[90vh] flex flex-col items-center justify-center pt-32 pb-20 overflow-hidden">
                    <div className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop grid lg:grid-cols-2 gap-12 items-center">
                        <div className="text-center lg:text-left reveal active">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-container/10 text-primary rounded-full mb-6 font-label-lg border border-primary/10">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                </span>
                                1,240 Architects currently building
                            </div>
                            <h1 className="font-headline-xl text-5xl md:text-7xl text-primary mb-8 leading-tight">
                                Build Your Own <br /><span className="italic">Cozy World</span>
                            </h1>
                            <p className="font-body-lg text-xl text-on-surface-variant mb-10 max-w-xl mx-auto lg:mx-0">
                                Escape into a peaceful sanctuary where every timber, teacup, and blossom is placed by your hand. A digital diorama for the soul.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                                <Link to="/projects" className="bg-primary text-on-primary font-label-lg px-10 py-4 rounded-full shadow-xl shadow-primary/20 hover:-translate-y-1 transition-all">
                                    Start Your Project
                                </Link>
                                <button className="bg-surface-container text-primary border border-outline/20 font-label-lg px-10 py-4 rounded-full hover:bg-surface-variant transition-all">
                                    Tour the Realm
                                </button>
                            </div>
                        </div>
                        <div className="relative reveal delay-200 active">
                            <div className="animate-float relative z-10">
                                <img alt="Hero Miniature Room" className="w-full h-auto drop-shadow-[0_35px_35px_rgba(0,0,0,0.15)] rounded-2xl transform hover:scale-105 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida/AP1WRLu849iW26NYX22DKtR8TRhW2Yvdj8J8zvgKjN3UaP5w2j7UcYRCBn5guO4SF3yHW7NhhVstPdIr6_6EbWmrGlnpvw_vo7iBBwV2gdwZQ7FiBFlZ5rsWQFj7eytM2AWPlJIEGXwqnL4iRqtsAXBQ_U3svBSaat0gBKfptM2a5gMHZQVIx_B-A7wXoR5h6_uRO_QDNYK92-b7m7IExi8Rgh5DFC_HEvjzBDmN08M5WAxyHds1UVn68ywSbxuL" />
                            </div>
                            {/* Floating Decorative Elements */}
                            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary-container/20 rounded-full blur-3xl animate-pulse"></div>
                            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-secondary-container/20 rounded-full blur-3xl animate-pulse delay-700"></div>
                        </div>
                    </div>
                </section>

                {/* Live Builders Section */}
                <section className="bg-surface-container-low py-12 border-y border-outline-variant/30 overflow-hidden">
                    <div className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                            <div className="flex -space-x-4">
                                <img alt="Builder" className="w-12 h-12 rounded-full border-2 border-surface shadow-sm hover:translate-y-[-4px] transition-transform cursor-pointer" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC3Isp-bbJE32Qu9OXpir22pVwmFb7KfMgsKylYngXV7enemr68kajL3EjoKmBUpgf_Rs983V9wrEwxJeB6IB9hqMuDElQ5AAIuHXi1p8467Y9sIZIBoTNQ4M7o3Sm-2CDoCJFz5hWd5cp6Je7mv8zje7n75sQDXeVfARgpD8XQ3hEtUwcVh3vs7Kas2mg3rH8VFuwVO3TGVvDEs_tXwdaZuvIMI_MAMLU4xprOiTljKuxu-agQQiWX5o9rKpgC5Nr0VDLF3IGOs2H8" />
                                <img alt="Builder" className="w-12 h-12 rounded-full border-2 border-surface shadow-sm hover:translate-y-[-4px] transition-transform cursor-pointer" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAt_ddWu1ocnwoJBz9wgzQuWnbgEcNT88C7BCxVyHXksSWrZtps2NUsSiMBmXv7CdCovn_tTYC1q-Xqd-UmeYKqj8lwS-8nLJiGA095CBI1Zm9H4ZKfb3xSJvm2TnVqOr1NxsZ3dsjHJfFpYgeMUzQXJmNIeQbrRAGkS9PbnNWb02Qpl_pIH3hUrI9aScz9l8p1P2kcSBEddztL5vLYTZQPdlDB5u0x-xEWVwnB2rMpgna5m-JRE6kXin7O-0OQ0-omar6cmNNGokun" />
                                <img alt="Builder" className="w-12 h-12 rounded-full border-2 border-surface shadow-sm hover:translate-y-[-4px] transition-transform cursor-pointer" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBqAODCDTWHNTe2AepJZFCMZnJAyPBG5xKrF4drl035kjIEZXQthTEzTK-F1smT2tz_sGEGAvC3C9rUR1PMzgLV8t5f6b24GHRQ_MR45Plsch8XCHsDY0SNUNbATrYcQ-9JxRjUAQe-iGtoqu9reqdpOx-M7qTLvH-cnh4ai9fFR2_ONAXR8jYagBPtVVTaPEv-oHzK53uB9ecUJaGQGLKZjYv8jsDyYyxEgXrwwYQD0x54Xm4r0HyfYTu6jnAbo5KNMXgrDt-1cYUD" />
                                <img alt="Builder" className="w-12 h-12 rounded-full border-2 border-surface shadow-sm hover:translate-y-[-4px] transition-transform cursor-pointer" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCVSecCI3wf7nHwkcoh5_H2aaXI0bnNeRvNYJiiH071KtqWl_cIKYUfpf3i-AeUrLPoTNWlUFG6e7KFNrT9lCnaicQKU7RZ98X02s7NZZEy9W8KnLGVd7nyK7ZXutR4HuyyoPVhIOZaMaM77ta1EkCZHLUXTfDvjSuaQKy-OYgJbCzjg4jPBBkPAYihjN_0THnQIwamkxrYnIc_jBC8TOMaGohwQbIvOlK6wensYlK3OdWVsR_VNQo1J3RQmPp7KIokvMEVG3VVsWTm" />
                                <div className="w-12 h-12 rounded-full border-2 border-surface bg-primary-container/20 flex items-center justify-center text-primary font-bold text-sm">+8k</div>
                            </div>
                            <div className="flex-1 max-w-lg">
                                <div className="flex items-center gap-4 animate-pulse">
                                    <div className="h-2 flex-1 bg-primary/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary w-3/4 rounded-full"></div>
                                    </div>
                                    <span className="text-sm font-label-lg text-primary">Global Creation Rate: High</span>
                                </div>
                            </div>
                            <div className="text-center md:text-right">
                                <p className="font-headline-sm text-primary">Active Now</p>
                                <p className="text-sm text-on-surface-variant">Building across 42 digital villages</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Features Section */}
                <section className="py-24 bg-white/30 backdrop-blur-sm">
                    <div className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop">
                        <div className="text-center mb-16 reveal active">
                            <h2 className="font-headline-lg text-primary text-4xl mb-4">The Craft of Miniatures</h2>
                            <p className="text-on-surface-variant max-w-2xl mx-auto">Physical sensations in a digital world. Every interaction designed to soothe.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                            {/* Feature 1 */}
                            <div className="tactile-card rounded-xl p-10 text-center reveal active">
                                <div className="w-20 h-20 mx-auto bg-primary-container/10 rounded-2xl flex items-center justify-center mb-8 rotate-3 hover:rotate-0 transition-transform">
                                    <span className="material-symbols-outlined text-primary text-4xl">architecture</span>
                                </div>
                                <h3 className="font-headline-md text-primary mb-4">Tactile Precision</h3>
                                <p className="text-on-surface-variant leading-relaxed">
                                    The "snap-to-soul" system ensures every tiny timber feels physically weighted and satisfying to place.
                                </p>
                            </div>
                            {/* Feature 2 */}
                            <div className="tactile-card rounded-xl p-10 text-center reveal delay-100 active">
                                <div className="w-20 h-20 mx-auto bg-secondary-container/20 rounded-2xl flex items-center justify-center mb-8 -rotate-3 hover:rotate-0 transition-transform">
                                    <span className="material-symbols-outlined text-secondary text-4xl">temp_preferences_custom</span>
                                </div>
                                <h3 className="font-headline-md text-primary mb-4">Infinite Curation</h3>
                                <p className="text-on-surface-variant leading-relaxed">
                                    Access a library of over 10,000 artisan-crafted assets, from Victorian teapots to blooming moss.
                                </p>
                            </div>
                            {/* Feature 3 */}
                            <div className="tactile-card rounded-xl p-10 text-center reveal delay-200 active">
                                <div className="w-20 h-20 mx-auto bg-tertiary/10 rounded-2xl flex items-center justify-center mb-8 rotate-1 hover:rotate-0 transition-transform">
                                    <span className="material-symbols-outlined text-tertiary text-4xl">celebration</span>
                                </div>
                                <h3 className="font-headline-md text-primary mb-4">Village Spirit</h3>
                                <p className="text-on-surface-variant leading-relaxed">
                                    Participate in monthly "Tiny Fests." Share your rooms and wander through collaborative community builds.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Community Showcase Carousel */}
                <section className="py-24 bg-surface-container-low/50 relative overflow-hidden" id="gallery">
                    <div className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop mb-12 flex justify-between items-end">
                        <div className="reveal active">
                            <h2 className="font-headline-lg text-primary text-4xl mb-2">Community Masterpieces</h2>
                            <p className="text-on-surface-variant">Real rooms built by our incredible architects.</p>
                        </div>
                        <div className="flex gap-2">
                            <button className="w-12 h-12 rounded-full border border-outline/20 flex items-center justify-center hover:bg-primary hover:text-white transition-all" onClick={() => scrollGallery(-400)}>
                                <span className="material-symbols-outlined">chevron_left</span>
                            </button>
                            <button className="w-12 h-12 rounded-full border border-outline/20 flex items-center justify-center hover:bg-primary hover:text-white transition-all" onClick={() => scrollGallery(400)}>
                                <span className="material-symbols-outlined">chevron_right</span>
                            </button>
                        </div>
                    </div>
                    <div ref={galleryRef} className="flex gap-6 px-margin-mobile md:px-margin-desktop overflow-x-auto hide-scrollbar scroll-smooth pb-8" id="gallery-container">
                        {/* Project 1 */}
                        <div className="min-w-[320px] md:min-w-[400px] group reveal active">
                            <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl">
                                <img alt="Alchemy Lab" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC8gsAOAl3gnyj8APZq_xiO-ahlQZFbGAuU2cHvrIa4gJWKdZeDV3ENwAYoCN57-1PiVxkyqheZsx7_49rPY-HDRa2GbjzngYUNXftyhIk92t6NLSWWHEHceIfUsJyLRnas0r_MV3qgoLK2mbitq841D8Xw2dwYNpvsIl5hEHR_OXwZESDABbLk3Z9sNltQyaThPjh2CGaFUnSnkBaM9zpngBR3MByPkjMBWh7zssH0yARIhdCWv96pwJTQtni981qEkkBKY7N5ljvd" />
                                <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                                    <p className="text-white font-headline-sm">The Alchemist's Nook</p>
                                    <p className="text-white/80 text-sm">by MasterBuilder_Elowen</p>
                                </div>
                            </div>
                        </div>
                        {/* Project 2 */}
                        <div className="min-w-[320px] md:min-w-[400px] group reveal delay-100 active">
                            <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl">
                                <img alt="Conservatory" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBbY2N4A4eB9YXHqYX5ONVHQE3NIzwfH3RpbsOpByZ_qZnv6uipvThEov4BPMenAHyWeTuHMzq08zm3csuDPhElwgJhCG4posQikUyx9KNQnr7_MmnLQOW5azB9y-GvT_8x51Hexx0V6cpt4Fm42VpzS5Q30wbUHYIfDSGcEfMG5Z7rYCAZYtD_bkflZMYsxwMwBNIO6MNVWVV8OL6laL1H-ehEaKK6K3M6MhXCbO0nWnMLy1_GsKe9PHpBUA9Fds7VIYO-LsCqqtmO" />
                                <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                                    <p className="text-white font-headline-sm">Sunlit Conservatory</p>
                                    <p className="text-white/80 text-sm">by GreenThumb_Mini</p>
                                </div>
                            </div>
                        </div>
                        {/* Project 3 */}
                        <div className="min-w-[320px] md:min-w-[400px] group reveal delay-200 active">
                            <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl">
                                <img alt="Library" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAWs1NZWVADOYJNVG5pISaNFH3VzJZDbkqxZLN7u7LdARMLpQ6K2phs4CORHSuoVY7M3U2bgZjs2UQKd7boBUwGpyfGk3_uEp8dxevuxvHsWx9aXwZlSsQgeXL-HRPe9eTOZae9niFqA5BojOPKzGAd1MYNQxXpGNvbvJYsWChMzuRgWwjCgSLVQZH0qhrhaOUPosk1fkm-bUmWsIfoFg8h_v4B4Y37CIy9t4vlOs1ZB2XM-llw2SlP-QN2aOpa11WHbGvMtJ5G7Z7P" />
                                <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                                    <p className="text-white font-headline-sm">Scholar's Retreat</p>
                                    <p className="text-white/80 text-sm">by AncientInk</p>
                                </div>
                            </div>
                        </div>
                        {/* Project 4 */}
                        <div className="min-w-[320px] md:min-w-[400px] group reveal delay-300">
                            <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl">
                                <img alt="Kitchen" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCGa0a-FUzZnlzKSo2C9cnwbmGQb7i6qJ1WQ_FHkHiWcLG2Kt_0NU6y9H9MqICsU3tFVve7MEu9UdAPUo2aSc2TWm8dRXgEVTYFIZGKGtB5wueQ_WysQ9u7X3bmzXWzkU6EmcDcIYRrcPpkMR6uxzeWtsRy_VwKSPXZhILdqoRPJ538cjMvf79Hc9GjdUeRFtSPmfcSE42lKBNBnZk3MSPdOjwn4fjppUnn8FPcad_8T7b0AsziRfohQfgeenskZdSfnAtmf9fkFXdr" />
                                <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                                    <p className="text-white font-headline-sm">Morning Kitchen</p>
                                    <p className="text-white/80 text-sm">by HearthWatcher</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="bg-surface-container-low border-t border-outline-variant/30 py-16">
                <div className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop flex flex-col md:flex-row justify-between items-center gap-12">
                    <div className="text-center md:text-left">
                        <div className="flex items-center gap-3 justify-center md:justify-start mb-4">
                            <img alt="Logo" className="w-8 h-8 opacity-60" src="https://lh3.googleusercontent.com/aida/AP1WRLvEi2oAra0WtaOFX5TC0Znd2OV6NaQbf_8G-x2BTD6KHhVm5XYfpXN0_RP05Q77529EleEpDHtHH-ufLgoBZo7O_N8Yclzuy7jRGsE4Q0i9RaUlaYWc26sYwiQj-J_KfTsbsJrJ7wYlOk54dTQi_UaepK2tvEt5g_bCVDg_3lOgXeBwqyUVj99UW5M4fAP05cuiJb4kvhj30hd9SY230Ee1XIKIDIkdCyhM8tIA43few7FKfVZ3gDppufIK" />
                            <span className="font-headline-sm text-primary">Tiny Home</span>
                        </div>
                        <p className="text-on-surface-variant text-sm max-w-xs">A digital sanctuary for those who appreciate the small things. Handcrafted with magic since 2023.</p>
                    </div>
                    <div className="flex gap-12 text-sm font-label-lg text-on-surface-variant">
                        <div className="flex flex-col gap-3">
                            <p className="text-primary font-bold mb-1">Guild</p>
                            <a className="hover:text-primary transition-colors" href="#">Discord</a>
                            <a className="hover:text-primary transition-colors" href="#">Blueprints</a>
                            <a className="hover:text-primary transition-colors" href="#">Showcase</a>
                        </div>
                        <div className="flex flex-col gap-3">
                            <p className="text-primary font-bold mb-1">Scrolls</p>
                            <a className="hover:text-primary transition-colors" href="#">Terms</a>
                            <a className="hover:text-primary transition-colors" href="#">Privacy</a>
                            <a className="hover:text-primary transition-colors" href="#">Support</a>
                        </div>
                    </div>
                </div>
                <div className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop mt-16 pt-8 border-t border-outline-variant/10 text-center text-xs text-on-surface-variant/60">
                    © 2024 Tiny Home. All miniature rights reserved.
                </div>
            </footer>
        </div>
    );
}
