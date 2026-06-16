/**
 * Kiểm tra hợp lệ nhẹ cho JSON SceneDocument thô (không tin cậy).
 * Chạy trước khi deserialize để bắt sớm file hỏng.
 *
 * Kiểm tra:
 *  - version === 1
 *  - nodes và walls là mảng
 *  - mỗi node có id (string uuid không rỗng), x, z dạng số
 *  - mỗi wall có wallId, startNodeId, endNodeId (string uuid không rỗng), thickness, height dạng số
 *  - mọi tham chiếu node của wall đều tồn tại trong tập node
 *  - không trùng id node hay wall
 *  - toạ độ/kích thước hợp lý (hữu hạn, thickness/height > 0)
 *  - furniture (nếu có) có modelId hợp lệ, x/z/rotY hữu hạn
 */

import { getCatalogItem } from "src/engine/catalog/FurnitureCatalog";

export type ValidationResult =
    | { ok: true }
    | { ok: false; error: string };

/**
 * Type predicate thu hẹp ValidationResult về nhánh thất bại.
 *
 * Dùng cái này thay vì `!result.ok` tại call-site — narrowing theo property của
 * TypeScript có thể hỏng trong callback lồng sâu (ví dụ FileReader.onload bên
 * trong onChange của JSX), còn predicate `is` tường minh thì luôn đúng.
 *
 * @example
 * if (validationFailed(result)) {
 *     console.error(result.error); // ← được type đúng là string
 * }
 */
export function validationFailed(
    result: ValidationResult,
): result is { ok: false; error: string } {
    return !result.ok;
}

/** Trả về true nếu `n` là số hữu hạn (không NaN, không Infinity). */
function isFiniteNumber(n: unknown): n is number {
    return typeof n === "number" && Number.isFinite(n);
}

/** Trả về true nếu `s` là string không rỗng (dùng cho id uuid). */
function isNonEmptyString(s: unknown): s is string {
    return typeof s === "string" && s.length > 0;
}

/**
 * Kiểm tra field `materials` (optional): phải là record string→string (slotId→materialId).
 * Trả về null nếu hợp lệ (hoặc vắng mặt), hoặc chuỗi lỗi.
 */
function validateMaterials(materials: unknown, label: string): string | null {
    if (materials === undefined) return null;
    if (typeof materials !== "object" || materials === null || Array.isArray(materials)) {
        return `${label}.materials must be an object if present.`;
    }
    for (const [k, v] of Object.entries(materials)) {
        if (typeof v !== "string" || v === "") {
            return `${label}.materials["${k}"] must be a non-empty string.`;
        }
    }
    return null;
}

export function validateSceneDocument(raw: unknown): ValidationResult {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return { ok: false, error: "Document root must be a JSON object." };
    }

    const doc = raw as Record<string, unknown>;

    // ── Version ───────────────────────────────────────────────────────────────
    if (doc["version"] !== 1) {
        return {
            ok: false,
            error: `Unsupported or missing document version: ${JSON.stringify(doc["version"])}. Expected 1.`,
        };
    }

    // ── Nodes ─────────────────────────────────────────────────────────────────
    if (!Array.isArray(doc["nodes"])) {
        return { ok: false, error: '"nodes" must be an array.' };
    }
    const nodeIds = new Set<string>();
    for (let i = 0; i < doc["nodes"].length; i++) {
        const n = doc["nodes"][i] as Record<string, unknown>;
        if (!isNonEmptyString(n["id"])) {
            return { ok: false, error: `nodes[${i}].id must be a non-empty string.` };
        }
        if (!isFiniteNumber(n["x"])) {
            return { ok: false, error: `nodes[${i}].x must be a finite number.` };
        }
        if (!isFiniteNumber(n["z"])) {
            return { ok: false, error: `nodes[${i}].z must be a finite number.` };
        }
        if (nodeIds.has(n["id"])) {
            return { ok: false, error: `Duplicate node id: ${n["id"]}.` };
        }
        nodeIds.add(n["id"]);
    }

    // ── Walls ─────────────────────────────────────────────────────────────────
    if (!Array.isArray(doc["walls"])) {
        return { ok: false, error: '"walls" must be an array.' };
    }
    const wallIds = new Set<string>();
    for (let i = 0; i < doc["walls"].length; i++) {
        const w = doc["walls"][i] as Record<string, unknown>;

        if (!isNonEmptyString(w["wallId"])) {
            return { ok: false, error: `walls[${i}].wallId must be a non-empty string.` };
        }
        if (!isNonEmptyString(w["startNodeId"])) {
            return { ok: false, error: `walls[${i}].startNodeId must be a non-empty string.` };
        }
        if (!isNonEmptyString(w["endNodeId"])) {
            return { ok: false, error: `walls[${i}].endNodeId must be a non-empty string.` };
        }
        if (!isFiniteNumber(w["thickness"]) || (w["thickness"] as number) <= 0) {
            return { ok: false, error: `walls[${i}].thickness must be a positive finite number.` };
        }
        if (!isFiniteNumber(w["height"]) || (w["height"] as number) <= 0) {
            return { ok: false, error: `walls[${i}].height must be a positive finite number.` };
        }

        // Toàn vẹn tham chiếu: cả hai node đầu/cuối phải tồn tại trong document.
        if (!nodeIds.has(w["startNodeId"] as string)) {
            return {
                ok: false,
                error: `walls[${i}] (wallId ${w["wallId"]}) references unknown startNodeId: ${w["startNodeId"]}.`,
            };
        }
        if (!nodeIds.has(w["endNodeId"] as string)) {
            return {
                ok: false,
                error: `walls[${i}] (wallId ${w["wallId"]}) references unknown endNodeId: ${w["endNodeId"]}.`,
            };
        }

        // Chặn self-loop (tường nối node với chính nó).
        if (w["startNodeId"] === w["endNodeId"]) {
            return {
                ok: false,
                error: `walls[${i}] (wallId ${w["wallId"]}) has startNodeId === endNodeId (self-loop not allowed).`,
            };
        }

        if (wallIds.has(w["wallId"] as string)) {
            return { ok: false, error: `Duplicate wallId: ${w["wallId"]}.` };
        }
        wallIds.add(w["wallId"] as string);

        // Material bề mặt tường (optional). `material` = file cũ (1 material), `materialFaces`
        // = mới (left/right). Cả 2 đều optional.
        if (w["material"] !== undefined && (typeof w["material"] !== "string" || w["material"] === "")) {
            return { ok: false, error: `walls[${i}].material must be a non-empty string if present.` };
        }
        const mf = w["materialFaces"];
        if (mf !== undefined) {
            if (typeof mf !== "object" || mf === null || Array.isArray(mf)) {
                return { ok: false, error: `walls[${i}].materialFaces must be an object if present.` };
            }
            for (const k of ["left", "right"] as const) {
                const v = (mf as Record<string, unknown>)[k];
                if (v !== undefined && (typeof v !== "string" || v === "")) {
                    return { ok: false, error: `walls[${i}].materialFaces.${k} must be a non-empty string if present.` };
                }
            }
        }
    }

    // ── Furniture (optional) ──────────────────────────────────────────────────
    if (doc["furniture"] !== undefined) {
        if (!Array.isArray(doc["furniture"])) {
            return { ok: false, error: '"furniture" must be an array if present.' };
        }
        for (let i = 0; i < doc["furniture"].length; i++) {
            const f = doc["furniture"][i] as Record<string, unknown>;
            if (typeof f["modelId"] !== "string" || f["modelId"] === "") {
                return { ok: false, error: `furniture[${i}].modelId must be a non-empty string.` };
            }
            if (!getCatalogItem(f["modelId"] as string)) {
                return { ok: false, error: `furniture[${i}].modelId "${f["modelId"]}" is not a known catalog item.` };
            }
            if (!isFiniteNumber(f["x"])) {
                return { ok: false, error: `furniture[${i}].x must be a finite number.` };
            }
            if (!isFiniteNumber(f["z"])) {
                return { ok: false, error: `furniture[${i}].z must be a finite number.` };
            }
            // y là optional (file cũ không có); chỉ kiểm khi hiện diện.
            if (f["y"] !== undefined && !isFiniteNumber(f["y"])) {
                return { ok: false, error: `furniture[${i}].y must be a finite number if present.` };
            }
            if (!isFiniteNumber(f["rotY"])) {
                return { ok: false, error: `furniture[${i}].rotY must be a finite number.` };
            }
            const matErr = validateMaterials(f["materials"], `furniture[${i}]`);
            if (matErr) return { ok: false, error: matErr };
        }
    }

    // ── Wall items (optional) ─────────────────────────────────────────────────
    if (doc["wallItems"] !== undefined) {
        if (!Array.isArray(doc["wallItems"])) {
            return { ok: false, error: '"wallItems" must be an array if present.' };
        }
        for (let i = 0; i < doc["wallItems"].length; i++) {
            const w = doc["wallItems"][i] as Record<string, unknown>;
            if (typeof w["modelId"] !== "string" || w["modelId"] === "") {
                return { ok: false, error: `wallItems[${i}].modelId must be a non-empty string.` };
            }
            if (!getCatalogItem(w["modelId"] as string)) {
                return { ok: false, error: `wallItems[${i}].modelId "${w["modelId"]}" is not a known catalog item.` };
            }
            if (!isNonEmptyString(w["hostWallId"])) {
                return { ok: false, error: `wallItems[${i}].hostWallId must be a non-empty string.` };
            }
            if (!wallIds.has(w["hostWallId"] as string)) {
                return { ok: false, error: `wallItems[${i}] references unknown hostWallId: ${w["hostWallId"]}.` };
            }
            if (!isFiniteNumber(w["t"]) || (w["t"] as number) < 0 || (w["t"] as number) > 1) {
                return { ok: false, error: `wallItems[${i}].t must be a number in [0,1].` };
            }
            if (w["side"] !== 1 && w["side"] !== -1) {
                return { ok: false, error: `wallItems[${i}].side must be +1 or -1.` };
            }
            const matErr = validateMaterials(w["materials"], `wallItems[${i}]`);
            if (matErr) return { ok: false, error: matErr };
        }
    }

    // ── Floors (optional) — record roomKey→materialId ─────────────────────────
    if (doc["floors"] !== undefined) {
        const floors = doc["floors"];
        if (typeof floors !== "object" || floors === null || Array.isArray(floors)) {
            return { ok: false, error: '"floors" must be an object if present.' };
        }
        for (const [k, v] of Object.entries(floors)) {
            if (typeof v !== "string" || v === "") {
                return { ok: false, error: `floors["${k}"] must be a non-empty string.` };
            }
        }
    }

    return { ok: true };
}
