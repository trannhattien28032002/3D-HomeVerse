/**
 * authApi — gọi các endpoint /auth/* của backend (A3).
 * Khớp contract trong AUTH-WIRING-PLAN.md §2 "Backend auth contract".
 */
import { apiFetch } from "src/data/api/client";

export type RegisterPayload = {
    email: string;
    password: string;
    displayName?: string;
};

export type RegisterResult = {
    id: string;
    email: string;
    displayName: string | null;
};

export type Profile = {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    plan: string;
    storageUsed: number;
    createdAt: string;
};

export type UpdateProfilePayload = {
    displayName?: string;
    avatarUrl?: string;
};

/** POST /auth/register (public) — tạo user ở backend. KHÔNG trả token; gọi xong phải signInWithPassword riêng. */
export function register(payload: RegisterPayload): Promise<RegisterResult> {
    return apiFetch<RegisterResult>("/auth/register", { method: "POST", body: payload });
}

/** GET /auth/me (JWT) — lấy profile của user đang đăng nhập. */
export function getMe(): Promise<Profile> {
    return apiFetch<Profile>("/auth/me", { method: "GET" });
}

/** PATCH /auth/me/profile (JWT) — cập nhật profile. */
export function updateProfile(payload: UpdateProfilePayload): Promise<Profile> {
    return apiFetch<Profile>("/auth/me/profile", { method: "PATCH", body: payload });
}
