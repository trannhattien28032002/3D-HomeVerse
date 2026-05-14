Two causes for the camera going underground:

1. The custom zoom code does camera.position.addScaledVector(camToTarget, zoomStep) — if zooming toward a low-angle hit point, the camera Y can go negative.
2. controls.target can drift below y=0 during zoom, then OrbitControls recomputes camera position relative to that now-underground target.

The clamp must come after controls.update() because OrbitControls recalculates camera position from its internal spherical coordinates on every update — any Y fix applied before the call gets overwritten.

● Update(src\engine\systems\OrbitControlSystem.ts)
Added 3 lines

import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Camera never descends below this height — prevents falling through the floor plane.
const MIN_CAMERA_Y = 0.5;

export class OrbitControlSy
de
        // before this call gets overwritten. Clamping here is the only reliable guard.
        if (this.camera.position.y < MIN_CAMERA_Y) {
            this.camera.position.y = MIN_CAMERA_Y;
        }
    }
}

  Ran 1 shell command

Clean. Two fixes applied:

Root cause 1 — controls.target.y < 0 after zoom: The zoom loop moves controls.target toward the hit point. If the hit point is near the floor at a steep angle, the target drifts underground. OrbitControls then recalculates the camera's spherical position relative to this underground pivot and drags the camera down with it. Fix: clamp controls.target.y = 0 immediately after each zoom step.

Root cause 2 — camera still slips below despite the target clamp: OrbitControls' update() internally recomputes camera.position from its spherical coordinate state every frame. Any Y correction applied before update() gets overwritten. Fix: the MIN_CAMERA_Y = 0.5 clamp runs after controls.update() where it can't be undone, ensuring the camera never drops below 0.5m above the floor regardless of orbit angle or zoom speed.