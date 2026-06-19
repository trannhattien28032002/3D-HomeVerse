/**
 * oauth — khởi tạo đăng nhập OAuth qua Supabase (P5, D2).
 *
 * signInWithOAuth redirect browser sang provider rồi quay lại `redirectTo`;
 * supabaseClient (detectSessionInUrl) tự nuốt session khi quay về → onAuthStateChange
 * cập nhật useAuthStore. Nếu provider CHƯA bật trên Supabase dashboard, Supabase trả
 * error đồng bộ (trước khi redirect) → caller hiển thị thông báo, không crash.
 */
import { supabase } from "src/data/auth/supabaseClient";

/**
 * Bắt đầu flow Google OAuth. Trả `{ error }` — null nếu redirect đã khởi tạo,
 * hoặc message nếu provider chưa bật / lỗi khác. Khi thành công, trình duyệt điều
 * hướng đi nên hàm không "return" theo nghĩa thông thường.
 */
export async function signInWithGoogle(redirectTo?: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: redirectTo ?? `${window.location.origin}/projects`,
        },
    });
    return { error: error?.message ?? null };
}
