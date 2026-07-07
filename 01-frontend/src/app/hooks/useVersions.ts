/**
 * useVersions — data-access cho VersionsPanel (P4 / 4.3).
 *
 * Gom list/create/restore version + toast lỗi vào hook để VersionsPanel không
 * import `data/` trực tiếp. UI state (label input, restoreTarget) ở lại component.
 *
 * Hành vi giữ nguyên:
 *   - refresh khi `open` chuyển true.
 *   - createNewVersion: saveNow(silent) trước (backend snapshot scene đã lưu);
 *     nếu lưu fail → toast + trả false (không tạo version). Trả true khi tạo xong.
 *   - restore: restoreVersion (ghi server) → getVersion → applyScene. Trả true khi xong.
 */
import { useCallback, useEffect, useState } from "react";
import type { SceneDocument } from "src/engine/serialization";
import {
    listVersions,
    createVersion,
    getVersion,
    restoreVersion,
    type VersionSummary,
} from "src/data/versions/versionsApi";
import { apiErrorMessage } from "src/data/api/client";
import { toast } from "src/app/store/useToastStore";

export type { VersionSummary };

type Status = "loading" | "ready" | "error";

export function useVersions(
    projectId: string | undefined,
    saveNow: (opts?: { silent?: boolean }) => Promise<boolean>,
    applyScene: (doc: SceneDocument) => Promise<void>,
    open: boolean,
) {
    const [status, setStatus] = useState<Status>("loading");
    const [versions, setVersions] = useState<VersionSummary[]>([]);
    const [creating, setCreating] = useState(false);
    const [restoring, setRestoring] = useState(false);

    const refresh = useCallback(async () => {
        if (!projectId) return;
        setStatus("loading");
        try {
            const data = await listVersions(projectId);
            setVersions(data);
            setStatus("ready");
        } catch (err) {
            console.error("[VersionsPanel] list failed:", err);
            setStatus("error");
        }
    }, [projectId]);

    useEffect(() => {
        if (open) void refresh();
    }, [open, refresh]);

    /** Trả true khi tạo version thành công (caller clear input khi true). */
    const createNewVersion = async (label: string): Promise<boolean> => {
        if (!projectId || creating) return false;
        setCreating(true);
        try {
            // Lưu scene hiện tại trước (backend snapshot scene đã lưu, không phải engine sống).
            const saved = await saveNow({ silent: true });
            if (!saved) {
                toast.error("Không lưu được scene hiện tại — chưa tạo được phiên bản.");
                return false;
            }
            await createVersion(projectId, label || undefined);
            toast.success("Đã tạo phiên bản mới.");
            await refresh();
            return true;
        } catch (err) {
            const message = apiErrorMessage(err, "Tạo phiên bản thất bại.");
            toast.error(message);
            return false;
        } finally {
            setCreating(false);
        }
    };

    /** Trả true khi khôi phục thành công (caller đóng confirm khi true). */
    const restore = async (versionId: string): Promise<boolean> => {
        if (!projectId || restoring) return false;
        setRestoring(true);
        try {
            await restoreVersion(projectId, versionId);
            const full = await getVersion(projectId, versionId);
            await applyScene(full.sceneData);
            toast.success("Đã khôi phục phiên bản.");
            return true;
        } catch (err) {
            const message = apiErrorMessage(err, "Khôi phục thất bại.");
            toast.error(message);
            return false;
        } finally {
            setRestoring(false);
        }
    };

    return { status, versions, creating, restoring, refresh, createNewVersion, restore };
}
