/**
 * useProfile — data-access cho ProfileModal (P3 / 4.3).
 *
 * GET /auth/me khi mở + PATCH /auth/me/profile khi lưu, kèm toast lỗi. Form
 * input (displayName/avatarUrl) là UI state → ở lại component, sync từ `profile`.
 *
 * Hành vi giữ nguyên:
 *   - load khi `open` true, có cancel-guard.
 *   - save trả Promise<boolean> để caller đóng modal khi thành công.
 */
import { useEffect, useState } from "react";
import { getMe, updateProfile, type Profile } from "src/data/auth/authApi";
import { apiErrorMessage } from "src/data/api/client";
import { toast } from "src/app/store/useToastStore";

export type { Profile };

type Status = "loading" | "ready" | "error";

export function useProfile(open: boolean) {
    const [status, setStatus] = useState<Status>("loading");
    const [profile, setProfile] = useState<Profile | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setStatus("loading");
        void (async () => {
            try {
                const me = await getMe();
                if (cancelled) return;
                setProfile(me);
                setStatus("ready");
            } catch (e) {
                if (cancelled) return;
                console.error("[ProfileModal] load failed:", e);
                setStatus("error");
            }
        })();
        return () => { cancelled = true; };
    }, [open]);

    /** Trả true khi lưu thành công (caller đóng modal khi true). */
    const save = async (body: { displayName: string; avatarUrl?: string }): Promise<boolean> => {
        setSaving(true);
        try {
            const updated = await updateProfile(body);
            setProfile(updated);
            toast.success("Đã cập nhật hồ sơ.");
            return true;
        } catch (e) {
            const message = apiErrorMessage(e, "Cập nhật hồ sơ thất bại.");
            toast.error(message);
            return false;
        } finally {
            setSaving(false);
        }
    };

    return { status, profile, saving, save };
}
