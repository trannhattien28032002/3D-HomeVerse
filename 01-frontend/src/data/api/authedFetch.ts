/**
 * authedFetch — fetch() trần (typeof fetch) có gắn sẵn Authorization: Bearer
 * từ session Supabase hiện tại, nếu có. Khác với apiFetch (src/data/api/client.ts)
 * vốn parse JSON + ném ApiError — chỗ này cần giữ nguyên contract `fetch` thuần
 * để cắm vào các seam đã có sẵn (vd BackendTransport.fetchImpl) mà không đổi
 * logic xử lý response của nơi gọi.
 *
 * Dùng cho /ai/chat (A6 sẽ chuyển devOnly → requireAuth): header có sẵn ngay từ
 * bây giờ nên không cần sửa gì thêm ở FE khi backend bật guard.
 */
import { supabase } from "src/data/auth/supabaseClient";

export const authedFetch: typeof fetch = async (input, init) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    const headers = new Headers(init?.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);

    return fetch(input, { ...init, headers });
};
