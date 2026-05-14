const FEATURES = [
    {
        icon: "handyman",
        title: "Tactile Building",
        description: "Experience the satisfying snap of placing tiny timber and laying miniature stones. Every piece feels physical and real.",
    },
    {
        icon: "chair",
        title: "Endless Decor",
        description: "From vintage teacups to hand-woven rugs, discover thousands of items to furnish your perfect tiny sanctuary.",
    },
    {
        icon: "diversity_1",
        title: "Shared Magic",
        description: "Wander through vibrant villages crafted by other builders. Leave tiny gifts and gather inspiration for your next room.",
    },
] as const;

const SHOWCASE_ITEMS = [
    {
        id: 1,
        title: "The Alchemist's Nook",
        image: "https://lh3.googleusercontent.com/aida-public/AB6AXuC8gsAOAl3gnyj8APZq_xiO-ahlQZFbGAuU2cHvrIa4gJWKdZeDV3ENwAYoCN57-1PiVxkyqheZsx7_49rPY-HDRa2GbjzngYUNXftyhIk92t6NLSWWHEHceIfUsJyLRnas0r_MV3qgoLK2mbitq841D8Xw2dwYNpvsIl5hEHR_OXwZESDABbLk3Z9sNltQyaThPjh2CGaFUnSnkBaM9zpngBR3MByPkjMBWh7zssH0yARIhdCWv96pwJTQtni981qEkkBKY7N5ljvd",
    },
    {
        id: 2,
        title: "Sunlit Conservatory",
        image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBbY2N4A4eB9YXHqYX5ONVHQE3NIzwfH3RpbsOpByZ_qZnv6uipvThEov4BPMenAHyWeTuHMzq08zm3csuDPhElwgJhCG4posQikUyx9KNQnr7_MmnLQOW5azB9y-GvT_8x51Hexx0V6cpt4Fm42VpzS5Q30wbUHYIfDSGcEfMG5Z7rYCAZYtD_bkflZMYsxwMwBNIO6MNVWVV8OL6laL1H-ehEaKK6K3M6MhXCbO0nWnMLy1_GsKe9PHpBUA9Fds7VIYO-LsCqqtmO",
    },
    {
        id: 3,
        title: "Scholar's Retreat",
        image: "https://lh3.googleusercontent.com/aida-public/AB6AXuAWs1NZWVADOYJNVG5pISaNFH3VzJZDbkqxZLN7u7LdARMLpQ6K2phs4CORHSuoVY7M3U2bgZjs2UQKd7boBUwGpyfGk3_uEp8dxevuxvHsWx9aXwZlSsQgeXL-HRPe9eTOZae9niFqA5BojOPKzGAd1MYNQxXpGNvbvJYsWChMzuRgWwjCgSLVQZH0qhrhaOUPosk1fkm-bUmWsIfoFg8h_v4B4Y37CIy9t4vlOs1ZB2XM-llw2SlP-QN2aOpa11WHbGvMtJ5G7Z7P",
    },
    {
        id: 4,
        title: "Morning Kitchen",
        image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCGa0a-FUzZnlzKSo2C9cnwbmGQb7i6qJ1WQ_FHkHiWcLG2Kt_0NU6y9H9MqICsU3tFVve7MEu9UdAPUo2aSc2TWm8dRXgEVTYFIZGKGtB5wueQ_WysQ9u7X3bmzXWzkU6EmcDcIYRrcPpkMR6uxzeWtsRy_VwKSPXZhILdqoRPJ538cjMvf79Hc9GjdUeRFtSPmfcSE42lKBNBnZk3MSPdOjwn4fjppUnn8FPcad_8T7b0AsziRfohQfgeenskZdSfnAtmf9fkFXdr",
    },
] as const;

function FeatureCard({ icon, title, description }: typeof FEATURES[number]) {
    return (
        <div className="bg-surface rounded-xl p-8 shadow-[0_4px_20px_rgba(124,88,0,0.05)] text-center border border-outline-variant/20">
            <div className="w-16 h-16 mx-auto bg-primary-container/20 rounded-full flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-primary text-3xl">{icon}</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-primary mb-4">{title}</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">{description}</p>
        </div>
    );
}

function ShowcaseCard({ title, image }: { title: string; image: string }) {
    return (
        <div className="group relative rounded-xl overflow-hidden shadow-lg aspect-square cursor-pointer">
            <img
                src={image}
                alt="Miniature room preview"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-on-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                <p className="text-on-primary font-label-lg text-label-lg">{title}</p>
            </div>
        </div>
    );
}

export default function HomePage() {
    return (
        <div className="bg-background text-on-background font-body-md min-h-screen flex flex-col overflow-y-auto">
            {/* TopNavBar */}
            <nav className="fixed top-0 w-full z-50 bg-surface-container/60 backdrop-blur-xl border-b border-primary/10 shadow-[0_4px_20px_rgba(124,88,0,0.1)]">
                <div className="flex justify-between items-center max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop py-4">
                    <div className="font-headline-md text-headline-md text-primary tracking-tight">
                        Tiny Home
                    </div>
                    <div className="hidden md:flex gap-8 items-center">
                        <a href="#" className="text-on-surface-variant hover:text-primary transition-colors duration-300 font-label-lg text-label-lg">Gallery</a>
                        <a href="#" className="text-on-surface-variant hover:text-primary transition-colors duration-300 font-label-lg text-label-lg">Blueprints</a>
                        <a href="#" className="text-on-surface-variant hover:text-primary transition-colors duration-300 font-label-lg text-label-lg">Community</a>
                    </div>
                    <button className="bg-primary text-on-primary font-label-lg text-label-lg px-6 py-2 rounded-full active:scale-90 transition-transform glow-hover hidden md:block">
                        Start Building
                    </button>
                    <button className="md:hidden text-primary">
                        <span className="material-symbols-outlined">menu</span>
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="flex-grow pt-24 pb-12">
                {/* Hero Section */}
                <section className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop flex flex-col items-center justify-center text-center py-16 md:py-24">
                    <img
                        src="https://lh3.googleusercontent.com/aida/ADBb0ujaz4B9-gBbwvFcGmZLngX1tCHpI2DCOwp_U-BqAJ9Uf55zTZySSjgdFtDea5Gm7kh1S7umrpI0c-RhVWBusN28_-F9WKmC8PYU_gJMzx1JHMTVyPfrJp0FFM_AECCJGcfAwgjhXP7ZM4NVIk23OfaD55FOP5oKmEBxRDSZLbMSn6t07k8guPk3hO0ZvfTKGRB585iDV7I63DW60yefimH-hcp-AbqMPGI_zYiJQrQTh1iAKYpWFOYKakQjq4exDRbomNKq_cLv_Dw"
                        alt="Tiny Home Logo"
                        className="w-64 h-64 md:w-96 md:h-96 object-contain mb-8 rounded-full shadow-[0_0_30px_rgba(248,180,0,0.2)]"
                    />
                    <h1 className="font-headline-xl text-headline-xl text-primary mb-6 max-w-3xl">
                        Build Your Own Cozy Miniature World
                    </h1>
                    <p className="font-body-lg text-body-lg text-on-surface-variant mb-10 max-w-2xl">
                        Escape into a peaceful sandbox where every brick and bloom is placed by hand.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <button className="bg-primary text-on-primary font-label-lg text-label-lg px-8 py-3 rounded-full glow-hover transition-all">
                            Start Building
                        </button>
                        <button className="bg-surface-container text-primary border border-outline font-label-lg text-label-lg px-8 py-3 rounded-full hover:bg-surface-variant transition-colors">
                            Explore Gallery
                        </button>
                    </div>
                </section>

                {/* Features Section */}
                <section className="bg-surface-container-low py-16 md:py-24 border-y border-outline-variant/30">
                    <div className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {FEATURES.map(f => <FeatureCard key={f.title} {...f} />)}
                        </div>
                    </div>
                </section>

                {/* Community Showcase */}
                <section className="max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop py-16 md:py-24">
                    <div className="text-center mb-12">
                        <h2 className="font-headline-lg text-headline-lg text-primary mb-4">Miniature Masterpieces</h2>
                        <p className="font-body-md text-body-md text-on-surface-variant">A glimpse into the Inspiration Realm.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {SHOWCASE_ITEMS.map(item => (
                            <ShowcaseCard key={item.id} title={item.title} image={item.image} />
                        ))}
                    </div>
                    <div className="mt-10 text-center">
                        <button className="text-primary font-label-lg text-label-lg flex items-center justify-center gap-2 mx-auto hover:text-primary-container transition-colors">
                            View More Magic
                            <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </button>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="w-full mt-auto bg-surface-container-low border-t border-outline-variant/30">
                <div className="flex flex-col md:flex-row justify-between items-center max-w-[1280px] mx-auto px-margin-mobile md:px-margin-desktop py-12 gap-gutter">
                    <div className="font-headline-sm text-headline-sm text-primary mb-4 md:mb-0">
                        Tiny Home
                    </div>
                    <div className="flex gap-6 mb-4 md:mb-0">
                        <a href="#" className="text-on-surface-variant hover:text-tertiary transition-colors opacity-80 hover:opacity-100 font-label-sm text-label-sm">Terms of Service</a>
                        <a href="#" className="text-on-surface-variant hover:text-tertiary transition-colors opacity-80 hover:opacity-100 font-label-sm text-label-sm">Privacy Scrolls</a>
                        <a href="#" className="text-on-surface-variant hover:text-tertiary transition-colors opacity-80 hover:opacity-100 font-label-sm text-label-sm">Support Guild</a>
                    </div>
                    <div className="text-on-surface-variant font-body-sm text-body-sm">
                        © 2024 Tiny Home. Handcrafted with magic.
                    </div>
                </div>
            </footer>
        </div>
    );
}
