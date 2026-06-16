import { Component } from "src/engine/ecs/Component";

/**
 * WorldSpaceMesh — marker: mesh của entity đã được dựng sẵn theo toạ độ world-space
 * (XZ nằm ngay trong geometry), KHÔNG dùng X/Z của Transform.
 *
 * RenderSystem thấy component này thì đặt position.set(0, y, 0) thay vì áp full
 * transform — dùng cho tường (đỉnh tường đã chứa toạ độ tuyệt đối trong WallPolygon).
 */
export class WorldSpaceMesh extends Component {}
