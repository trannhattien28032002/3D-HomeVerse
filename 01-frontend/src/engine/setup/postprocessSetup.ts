/**
 * postprocessSetup — dựng EffectComposer cho khung nhìn 3D (thay renderer.render trực tiếp).
 *
 * Pipeline:
 *   RenderPass(scene, camera)  → render cảnh vào render target (linear, CHƯA tone-map)
 *   OutlinePass                → vẽ viền cho selectedObjects (highlight vật đang chọn)
 *   OutputPass                 → áp ACES tone mapping + sRGB ở bước CUỐI
 *
 * Vì render target không tone-map (chỉ output ra canvas mới tone-map), OutputPass là
 * nơi DUY NHẤT tone-map → màu khớp tuyệt đối với renderer.render() trước đây (không
 * bị tone-map 2 lần). Render target bật MSAA (samples:4, WebGL2) để giữ chất lượng
 * cạnh tương đương antialias:true vốn bị EffectComposer vô hiệu hoá.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export type PostprocessBundle = {
    composer: EffectComposer;
    outlinePass: OutlinePass;
};

export function createPostprocessing(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
): PostprocessBundle {
    const size = renderer.getSize(new THREE.Vector2());

    // Render target đa mẫu (MSAA) — giữ cạnh mượt như antialias:true.
    const renderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
        type: THREE.HalfFloatType,
        samples: 4,
    });

    const composer = new EffectComposer(renderer, renderTarget);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);

    composer.addPass(new RenderPass(scene, camera));

    const outlinePass = new OutlinePass(new THREE.Vector2(size.x, size.y), scene, camera);
    outlinePass.edgeStrength = 4;
    outlinePass.edgeThickness = 1;
    outlinePass.edgeGlow = 0.3;
    outlinePass.pulsePeriod = 0; // viền tĩnh, không nhấp nháy
    composer.addPass(outlinePass);

    composer.addPass(new OutputPass());

    return { composer, outlinePass };
}
