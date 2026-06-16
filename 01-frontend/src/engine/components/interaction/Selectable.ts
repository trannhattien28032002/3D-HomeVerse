import { Component } from "src/engine/ecs/Component";

/**
 * Selectable — entity có thể được người dùng chọn; `selected` lưu trạng thái hiện tại.
 * GizmoSystem/SelectTool đọc cờ này để hiện handle và highlight.
 */
export class Selectable extends Component {
    selected: boolean;

    constructor(selected = false) {
        super();
        this.selected = selected;
    }
}