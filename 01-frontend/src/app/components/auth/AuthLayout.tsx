/**
 * Khung layout chia đôi màn hình dùng chung cho các trang xác thực.
 *   - Bên trái: ảnh nền immersive + branding (ẩn trên mobile, thu gọn còn 40vh).
 *   - Bên phải: thẻ form kính mờ, nhận nội dung qua `children`.
 *
 * Tách riêng để LoginPage và RegisterPage tái sử dụng, chỉ khác phần form.
 *
 * Cuộn: trên desktop khung vừa khít viewport, KHÔNG cuộn cả trang. Nếu form
 * cao hơn màn hình (vd: đăng ký trên laptop thấp) thì chỉ NỬA form cuộn riêng,
 * ảnh bên trái đứng yên. Trên mobile (xếp dọc) thì cả trang cuộn bình thường.
 */
import type { ReactNode } from "react";
import "src/app/components/auth/auth.css";

const HERO_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBkUvBeS6DezNSp_RBLfL6XYJZCSn3iX0iGeSF-UGzGfwWjPPBEg_GcI51Qlo-WYPev2gR5Z5L_sxCUZiAif0qfa9TGxdXCQEsPuu-kprYGzd8oURyDNmktJ7Zc6q8Gjkpf1VT81jpJ6Zl4poi_833ZNrhYlmgim3jGvyO0bAHBlWjutredDavCRQ6Z4V-W1-Dwm3itBWJps-JDObOBBImjcFy3JXbWpgmIPJBaQBFqO3by4oTP7gz9HVQ-fCMMvJLV7KCXjXI1oikS";

interface AuthLayoutProps {
  /** Icon Material Symbols hiển thị trong huy hiệu tròn trên đầu form. */
  badgeIcon: string;
  /** Tiêu đề lớn của form (vd: "Welcome Home"). */
  title: string;
  /** Dòng mô tả phụ dưới tiêu đề. */
  subtitle: string;
  /** Nội dung form (input, nút, link...). */
  children: ReactNode;
}

export default function AuthLayout({ badgeIcon, title, subtitle, children }: AuthLayoutProps) {
  return (
    // Mobile: cho cuộn cả trang (xếp dọc). Desktop: khóa cao bằng viewport, không cuộn trang.
    <div className="bg-background text-on-background font-body-md min-h-screen overflow-y-auto md:h-screen md:overflow-hidden">
      <div className="flex flex-col md:flex-row w-full md:h-full">
        {/* === Bên trái: ảnh nền immersive === */}
        <div className="relative w-full md:w-1/2 h-[40vh] md:h-full overflow-hidden group shrink-0">
          <img
            alt="Sun-drenched medieval village street with honey-colored stone walls and golden sunlight"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
            src={HERO_IMAGE}
          />
          {/* Lớp gradient hòa vào nền của phần form */}
          <div className="absolute inset-0 bg-gradient-to-b md:bg-gradient-to-r from-transparent via-transparent to-background/20 pointer-events-none" />
          {/* Lớp hạt giấy trang trí */}
          <div className="absolute inset-0 paper-grain opacity-[0.05] pointer-events-none" />
          {/* Branding/cảm hứng */}
          <div className="absolute bottom-10 left-10 right-10 z-20 text-white drop-shadow-lg hidden md:block">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-white/20 ethereal-blur rounded-full flex items-center justify-center border border-white/30">
                <span className="material-symbols-outlined text-white">auto_awesome</span>
              </div>
              <span className="font-headline-sm text-headline-sm uppercase tracking-widest text-white/90">
                Tiny Home Heritage
              </span>
            </div>
            <h2 className="font-headline-xl text-headline-xl max-w-md leading-tight">
              Every threshold is the start of a story.
            </h2>
          </div>
          {/* Vignette mờ */}
          <div className="absolute inset-0 bg-black/10" />
        </div>

        {/* === Bên phải: thẻ form (chỉ nửa này cuộn khi form quá cao) === */}
        <div className="relative w-full md:w-1/2 md:h-full bg-background md:overflow-y-auto">
          {/* min-h-full + items-center: canh giữa khi vừa, cuộn từ đỉnh khi tràn */}
          <div className="relative min-h-full flex items-center justify-center p-6 md:p-8 lg:p-12">
            <div className="absolute inset-0 paper-grain opacity-[0.03] pointer-events-none" />
            <main className="z-10 w-full max-w-md">
              <div className="bg-surface/60 backdrop-blur-xl border border-primary/10 rounded-xl shadow-[0_20px_50px_rgba(124,88,0,0.08)] p-6 md:p-8 relative overflow-hidden ring-1 ring-white/20">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary-container/40 to-transparent" />
                {/* Header form */}
                <div className="flex flex-col items-center mb-8">
                  <div className="w-14 h-14 bg-primary-container rounded-full flex items-center justify-center mb-3 shadow-[0_4px_15px_rgba(248,180,0,0.25)] ring-4 ring-primary-container/20">
                    <span className="material-symbols-outlined text-on-primary-container text-[28px]">
                      {badgeIcon}
                    </span>
                  </div>
                  <h1 className="font-headline-lg text-headline-lg text-primary tracking-widest text-center">
                    {title}
                  </h1>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 text-center">
                    {subtitle}
                  </p>
                </div>

                {children}
              </div>

              <footer className="mt-6 text-center opacity-40">
                <p className="font-label-sm text-label-sm text-outline uppercase tracking-widest">
                  © Tiny Home MMXXIV
                </p>
              </footer>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
