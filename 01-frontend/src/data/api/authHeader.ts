/**
 * authHeader — logic gắn Authorization: Bearer <token> dùng chung giữa `apiFetch`
 * (client.ts) và `authedFetch` (authedFetch.ts). Trước đây hai wrapper tự cài lại
 * cùng một logic đọc session Supabase — tách ra đây để tránh duplicate (A5 trong
 * BAO-CAO-REVIEW-DA-CHIEU.md).
 */
import { supabase } from "src/data/auth/supabaseClient";

/** Lấy access_token của session Supabase hiện tại (null nếu chưa đăng nhập). */
export async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}

/**
 * Gắn Authorization: Bearer <token> vào một `Headers` mutable, nếu có session hiện
 * tại. No-op nếu chưa đăng nhập (không set header).
 */
export async function attachAuthHeader(headers: Headers): Promise<void> {
    const token = await getAccessToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
}
