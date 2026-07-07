/**
 * GLTFModelLoader.test.ts — regression test cho GPU memory leak (BAO-CAO-REVIEW-DA-CHIEU.md #1).
 *
 * Trước fix: dispose() chỉ gọi dracoLoader.dispose(), không đụng tới `cache` — mọi
 * geometry/material/texture của GLB đã load rò rỉ vĩnh viễn mỗi lần rời editor.
 *
 * Test seed thẳng `cache` (private, truy cập qua bracket-access — cùng cỡ dữ liệu
 * thật GLTFLoader.load tạo ra) để không phải mock network/GLB thật.
 */
import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";

import { GLTFModelLoader, type ModelTemplate } from "src/engine/rendering/GLTFModelLoader";

type LoaderInternals = { cache: Map<string, ModelTemplate> };

function buildTemplate(): {
    template: ModelTemplate;
    sharedGeometry: THREE.BufferGeometry;
    sharedMaterial: THREE.MeshStandardMaterial;
    texture: THREE.Texture;
} {
    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
    const texture = new THREE.Texture();
    const sharedMaterial = new THREE.MeshStandardMaterial({ map: texture });

    const scene = new THREE.Group();
    // Hai mesh dùng CHUNG geometry/material — mô phỏng GLTFLoader dedupe primitive
    // trỏ về cùng 1 material index trong glTF.
    const meshA = new THREE.Mesh(sharedGeometry, sharedMaterial);
    const meshB = new THREE.Mesh(sharedGeometry, sharedMaterial);
    scene.add(meshA, meshB);

    const template: ModelTemplate = {
        scene,
        bbox: new THREE.Box3(),
        size: new THREE.Vector3(1, 1, 1),
    };

    return { template, sharedGeometry, sharedMaterial, texture };
}

describe("GLTFModelLoader.dispose", () => {
    it("disposes geometry, material, and texture of every cached template, then clears the cache", () => {
        const loader = new GLTFModelLoader();
        const { template, sharedGeometry, sharedMaterial, texture } = buildTemplate();

        (loader as unknown as LoaderInternals).cache.set("furniture/chair.glb", template);

        const geoSpy = vi.spyOn(sharedGeometry, "dispose");
        const matSpy = vi.spyOn(sharedMaterial, "dispose");
        const texSpy = vi.spyOn(texture, "dispose");

        loader.dispose();

        // Geometry/material dùng chung giữa 2 mesh chỉ được dispose ĐÚNG MỘT LẦN (khử trùng lặp).
        expect(geoSpy).toHaveBeenCalledTimes(1);
        expect(matSpy).toHaveBeenCalledTimes(1);
        expect(texSpy).toHaveBeenCalledTimes(1);

        expect((loader as unknown as LoaderInternals).cache.size).toBe(0);
    });

    it("disposes every entry when multiple GLB templates are cached", () => {
        const loader = new GLTFModelLoader();
        const first = buildTemplate();
        const second = buildTemplate();

        const internals = (loader as unknown as LoaderInternals).cache;
        internals.set("furniture/chair.glb", first.template);
        internals.set("furniture/table.glb", second.template);

        const spies = [first, second].map((t) => ({
            geo: vi.spyOn(t.sharedGeometry, "dispose"),
            mat: vi.spyOn(t.sharedMaterial, "dispose"),
            tex: vi.spyOn(t.texture, "dispose"),
        }));

        loader.dispose();

        for (const spy of spies) {
            expect(spy.geo).toHaveBeenCalledTimes(1);
            expect(spy.mat).toHaveBeenCalledTimes(1);
            expect(spy.tex).toHaveBeenCalledTimes(1);
        }
        expect(internals.size).toBe(0);
    });

    it("is a no-op-safe call when the cache is empty (e.g. leaving editor before any GLB loaded)", () => {
        const loader = new GLTFModelLoader();
        expect(() => loader.dispose()).not.toThrow();
        expect((loader as unknown as LoaderInternals).cache.size).toBe(0);
    });
});
