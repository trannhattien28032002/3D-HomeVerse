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
import { attachAuthHeader } from "src/data/api/authHeader";

export const authedFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    await attachAuthHeader(headers);

    return fetch(input, { ...init, headers });
};
