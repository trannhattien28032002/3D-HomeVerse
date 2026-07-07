/**
 * apiFetch — client gọi backend HTTP API (A3).
 *
 * Tự động:
 *   - Prefix VITE_API_URL trước path.
 *   - Gắn Authorization: Bearer <access_token> từ session Supabase hiện tại
 *     (nếu có) — đọc qua supabase.auth.getSession() mỗi lần gọi để luôn có
 *     token mới nhất (supabase-js tự refresh trong nền).
 *   - Set Content-Type: application/json khi có body.
 *   - Parse lỗi theo format backend { error: { code, message } } → ném ApiError
 *     (Error con, có .code + .status) để UI bắt theo status/code.
 */
import { getAccessToken } from "src/data/api/authHeader";

const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export class ApiError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
    }
}

export type ApiFetchOptions = Omit<RequestInit, "body"> & {
    body?: unknown;
};

/**
 * Lấy message thân thiện từ một lỗi bắt được: dùng message của {@link ApiError}
 * (đã được backend chuẩn hoá), ngược lại trả `fallback`.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
    return err instanceof ApiError ? err.message : fallback;
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
    const { body, headers, ...rest } = opts;
    const token = await getAccessToken();

    const finalHeaders: Record<string, string> = {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(headers as Record<string, string> | undefined),
    };

    const res = await fetch(`${BASE_URL}${path}`, {
        ...rest,
        headers: finalHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) {
        return undefined as T;
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
        const code = data?.error?.code ?? "UNKNOWN_ERROR";
        const message = data?.error?.message ?? `Request failed with status ${res.status}`;
        throw new ApiError(res.status, code, message);
    }

    return data as T;
}
