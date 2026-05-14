import { System } from "src/engine/ecs/System";
import type { World } from "src/engine/ecs/World";

// ── Custom DOM event types ────────────────────────────────────────────
export type TinyHomeNavEvent      = CustomEvent<{ id: string }>;
export type TinyHomeToggleModeEvent = CustomEvent<Record<never, never>>;

declare global {
    interface WindowEventMap {
        "tinyhome:nav":        TinyHomeNavEvent;
        "tinyhome:toggleMode": TinyHomeToggleModeEvent;
    }
}

// ── Shortcut table ───────────────────────────────────────────────────
type Shortcut = {
    key: string;                                         // lowercase, matched against e.key.toLowerCase()
    event: "tinyhome:nav" | "tinyhome:toggleMode";
    detail?: Record<string, unknown>;
    preventDefault?: boolean;
};

const SHORTCUTS: Shortcut[] = [
    { key: "v",   event: "tinyhome:nav",        detail: { id: "select"    } },
    { key: "b",   event: "tinyhome:nav",        detail: { id: "build"     } },
    { key: "f",   event: "tinyhome:nav",        detail: { id: "decor"     } },
    { key: "m",   event: "tinyhome:nav",        detail: { id: "color"     } },
    { key: "r",   event: "tinyhome:nav",        detail: { id: "rot-right" } },
    { key: "tab", event: "tinyhome:toggleMode", preventDefault: true         },
];

// ── System ───────────────────────────────────────────────────────────
/**
 * Lắng nghe phím tắt toàn cục và fire custom DOM events.
 * React layer (EditorPage) sẽ subscribe để cập nhật UI state.
 *
 * Phím tắt:
 *   V   → Select
 *   B   → Build / vẽ tường (chuyển sang 2D)
 *   F   → Decor
 *   M   → Material / Color
 *   R   → Rotate right
 *   Tab → Toggle 3D ↔ 2D
 */
export class InputSystem extends System {
    private readonly handler: (e: KeyboardEvent) => void;

    constructor() {
        super();

        this.handler = (e: KeyboardEvent) => {
            // Bỏ qua khi đang nhập liệu trong form
            const target = e.target as HTMLElement;
            if (
                target.tagName === "INPUT"    ||
                target.tagName === "TEXTAREA" ||
                target.isContentEditable
            ) return;

            const key = e.key.toLowerCase();
            const shortcut = SHORTCUTS.find(s => s.key === key);
            if (!shortcut) return;

            if (shortcut.preventDefault) e.preventDefault();

            window.dispatchEvent(
                new CustomEvent(shortcut.event, { detail: shortcut.detail ?? {} })
            );
        };

        window.addEventListener("keydown", this.handler);
    }

    // Keyboard là event-driven, không cần frame loop.
    override update(_world: World, _dt: number): void {}

    dispose(): void {
        window.removeEventListener("keydown", this.handler);
    }
}
