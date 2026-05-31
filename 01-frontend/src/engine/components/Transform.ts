import { Component } from "src/engine/ecs/Component";

export class Transform extends Component {
    x: number;
    y: number;
    z: number;
    // Quaternion as source of truth (x,y,z,w — same convention as Three.js and cannon-es).
    qx = 0;
    qy = 0;
    qz = 0;
    qw = 1;

    constructor(x = 0, y = 0, z = 0, rotY = 0) {
        super();
        this.x = x;
        this.y = y;
        this.z = z;
        // Field initializers above run before this line, so qx/qy/qz/qw are 0/0/0/1.
        this.rotY = rotY;
    }

    /** Yaw around world-Y extracted from quaternion. Same formula as GizmoSystem used before. */
    get rotY(): number {
        return Math.atan2(
            2 * (this.qw * this.qy + this.qx * this.qz),
            1 - 2 * (this.qy * this.qy + this.qx * this.qx),
        );
    }

    /** Set a pure-yaw quaternion, clearing any pitch/roll. Used by walls and 2D placement. */
    set rotY(rad: number) {
        const half = rad / 2;
        this.qx = 0;
        this.qy = Math.sin(half);
        this.qz = 0;
        this.qw = Math.cos(half);
    }

    /** Set full 3-axis rotation. Used by Gizmo for pitch/roll support. */
    setQuaternion(x: number, y: number, z: number, w: number): void {
        this.qx = x;
        this.qy = y;
        this.qz = z;
        this.qw = w;
    }
}
