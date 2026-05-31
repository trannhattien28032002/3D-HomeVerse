/**
 * Lightweight validation for raw (untrusted) SceneDocument JSON.
 * Runs before deserialization to catch corrupt files early.
 *
 * Validates:
 *  - version === 1
 *  - nodes and walls are arrays
 *  - each node has numeric id, x, z
 *  - each wall has numeric wallId, startNodeId, endNodeId, thickness, height
 *  - all wall node references exist in the node set
 *  - no duplicate node or wall IDs
 *  - coordinate and dimension sanity (finite, thickness/height > 0)
 *  - furniture entries (if present) have valid modelId, finite x/z/rotY
 */

import { getCatalogItem } from "src/engine/game/FurnitureCatalog";

export type ValidationResult =
    | { ok: true }
    | { ok: false; error: string };

/**
 * Type predicate that narrows a ValidationResult to its failure member.
 *
 * Use this instead of `!result.ok` at call sites — TypeScript's property-based
 * narrowing can fail inside deeply nested callbacks (e.g. FileReader.onload
 * inside a JSX onChange), but explicit `is` predicates always work correctly.
 *
 * @example
 * if (validationFailed(result)) {
 *     console.error(result.error); // ← correctly typed as string
 * }
 */
export function validationFailed(
    result: ValidationResult,
): result is { ok: false; error: string } {
    return !result.ok;
}

/** Returns true if `n` is a finite number (not NaN, not Infinity). */
function isFiniteNumber(n: unknown): n is number {
    return typeof n === "number" && Number.isFinite(n);
}

/** Returns true if `n` is a positive integer. */
function isPositiveInt(n: unknown): n is number {
    return typeof n === "number" && Number.isInteger(n) && n > 0;
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
    const nodeIds = new Set<number>();
    for (let i = 0; i < doc["nodes"].length; i++) {
        const n = doc["nodes"][i] as Record<string, unknown>;
        if (!isPositiveInt(n["id"])) {
            return { ok: false, error: `nodes[${i}].id must be a positive integer.` };
        }
        if (!isFiniteNumber(n["x"])) {
            return { ok: false, error: `nodes[${i}].x must be a finite number.` };
        }
        if (!isFiniteNumber(n["z"])) {
            return { ok: false, error: `nodes[${i}].z must be a finite number.` };
        }
        if (nodeIds.has(n["id"] as number)) {
            return { ok: false, error: `Duplicate node id: ${n["id"]}.` };
        }
        nodeIds.add(n["id"] as number);
    }

    // ── Walls ─────────────────────────────────────────────────────────────────
    if (!Array.isArray(doc["walls"])) {
        return { ok: false, error: '"walls" must be an array.' };
    }
    const wallIds = new Set<number>();
    for (let i = 0; i < doc["walls"].length; i++) {
        const w = doc["walls"][i] as Record<string, unknown>;

        if (!isPositiveInt(w["wallId"])) {
            return { ok: false, error: `walls[${i}].wallId must be a positive integer.` };
        }
        if (!isPositiveInt(w["startNodeId"])) {
            return { ok: false, error: `walls[${i}].startNodeId must be a positive integer.` };
        }
        if (!isPositiveInt(w["endNodeId"])) {
            return { ok: false, error: `walls[${i}].endNodeId must be a positive integer.` };
        }
        if (!isFiniteNumber(w["thickness"]) || (w["thickness"] as number) <= 0) {
            return { ok: false, error: `walls[${i}].thickness must be a positive finite number.` };
        }
        if (!isFiniteNumber(w["height"]) || (w["height"] as number) <= 0) {
            return { ok: false, error: `walls[${i}].height must be a positive finite number.` };
        }

        // Referential integrity: both endpoint nodes must exist in the document.
        if (!nodeIds.has(w["startNodeId"] as number)) {
            return {
                ok: false,
                error: `walls[${i}] (wallId ${w["wallId"]}) references unknown startNodeId: ${w["startNodeId"]}.`,
            };
        }
        if (!nodeIds.has(w["endNodeId"] as number)) {
            return {
                ok: false,
                error: `walls[${i}] (wallId ${w["wallId"]}) references unknown endNodeId: ${w["endNodeId"]}.`,
            };
        }

        // Self-loop guard.
        if (w["startNodeId"] === w["endNodeId"]) {
            return {
                ok: false,
                error: `walls[${i}] (wallId ${w["wallId"]}) has startNodeId === endNodeId (self-loop not allowed).`,
            };
        }

        if (wallIds.has(w["wallId"] as number)) {
            return { ok: false, error: `Duplicate wallId: ${w["wallId"]}.` };
        }
        wallIds.add(w["wallId"] as number);
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
            if (!isFiniteNumber(f["rotY"])) {
                return { ok: false, error: `furniture[${i}].rotY must be a finite number.` };
            }
        }
    }

    return { ok: true };
}
