/**
 * Zustand store quản lý trạng thái xác thực toàn app (A2).
 *
 * status:
 *   "loading" — chưa biết có session hay không (đang chờ getSession() lần đầu).
 *               Router KHÔNG nên render trong lúc này để tránh flash redirect sai.
 *   "authed"  — có session hợp lệ (session != null).
 *   "anon"    — đã xác định KHÔNG có session.
 *
 * initAuth() được gọi đúng 1 lần ở App root: đọc session hiện tại qua
 * supabase.auth.getSession(), rồi subscribe onAuthStateChange để tự đồng bộ khi
 * login/logout/refresh token xảy ra ở bất kỳ đâu (kể cả tab khác). Trả về hàm
 * unsubscribe để App cleanup trong useEffect — tránh leak listener khi
 * React StrictMode mount/unmount/mount lại (double-invoke ở dev).
 */
import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "src/data/auth/supabaseClient";
import { getMe } from "src/data/auth/authApi";

type AuthStatus = "loading" | "authed" | "anon";

/**
 * Đảm bảo user có row trong public.profiles trước khi thao tác cần FK tới profiles
 * (vd: POST /projects → projects.owner_id REFERENCES profiles.id).
 *
 * Đăng nhập qua Google/OAuth đi thẳng Supabase, KHÔNG qua backend /auth/register
 * (chỗ duy nhất tạo sẵn profiles cho luồng email/password), nên user OAuth mới
 * chưa có profiles → tạo project lỗi FK. GET /auth/me tự upsert profiles, nên ta
 * gọi nó 1 lần ngay khi có session. Best-effort: lỗi mạng không chặn login, lần
 * gọi /auth/me kế (mở ProfileModal) hoặc trigger DB sẽ bù.
 *
 * Dedupe theo userId để không spam mỗi lần TOKEN_REFRESHED/INITIAL_SESSION.
 */
let ensuredProfileForUser: string | null = null;
function ensureProfile(userId: string): void {
    if (ensuredProfileForUser === userId) return;
    ensuredProfileForUser = userId;
    void getMe().catch((err) => {
        // Không chặn login — reset cờ để lần auth-state-change sau thử lại.
        ensuredProfileForUser = null;
        console.warn("Đồng bộ profile (/auth/me) thất bại, sẽ thử lại sau:", err);
    });
}

type AuthState = {
    session: Session | null;
    user: User | null;
    status: AuthStatus;
    /** Khởi tạo session bootstrap + subscribe auth state change. Gọi 1 lần ở App root. */
    initAuth: () => () => void;
    /** Đăng xuất — xoá session ở Supabase, listener sẽ tự cập nhật store về "anon". */
    signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
    session: null,
    user: null,
    status: "loading",

    initAuth: () => {
        let cancelled = false; // Tránh rò rỉ bộ nhớ (memory leak)

        // Bước 1: Lấy trạng thái đăng nhập hiện tại ngay lập tức
        supabase.auth.getSession().then(({ data }) => {
            if (cancelled) return; // Nếu component đã unmount thì bỏ qua
            set({
                session: data.session,
                user: data.session?.user ?? null,
                status: data.session ? "authed" : "anon", // Cập nhật trạng thái
            });
            if (data.session?.user) ensureProfile(data.session.user.id);
        });

        // Bước 2: Lắng nghe các sự kiện thay đổi đăng nhập
        const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
            if (cancelled) return;
            set({
                session,
                user: session?.user ?? null,
                status: session ? "authed" : "anon",
            });
            if (session?.user) ensureProfile(session.user.id);
            else ensuredProfileForUser = null; // Logout → reset để lần đăng nhập sau sync lại.
        });

        // 3. Hàm dọn dẹp (Cleanup function)
        return () => {
            cancelled = true;
            subscription.subscription.unsubscribe();
        };
    },

    signOut: async () => {
        await supabase.auth.signOut();
    },
}));
