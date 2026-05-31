import { Component } from "src/engine/ecs/Component";

/**
 * Marker component — entity's mesh is positioned in world-space XZ
 * rather than using the Transform component's X and Z directly.
 * RenderSystem checks for this component to apply the special wall
 * positioning (position.set(0, y, 0)) instead of the default full-transform path.
 */
export class WorldSpaceMesh extends Component {}
