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

type AuthStatus = "loading" | "authed" | "anon";

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
        let cancelled = false;

        supabase.auth.getSession().then(({ data }) => {
            if (cancelled) return;
            set({
                session: data.session,
                user: data.session?.user ?? null,
                status: data.session ? "authed" : "anon",
            });
        });

        const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
            if (cancelled) return;
            set({
                session,
                user: session?.user ?? null,
                status: session ? "authed" : "anon",
            });
        });

        return () => {
            cancelled = true;
            subscription.subscription.unsubscribe();
        };
    },

    signOut: async () => {
        await supabase.auth.signOut();
    },
}));
