/**
 * True khi focus đang ở một ô nhập liệu (input / textarea / contentEditable).
 * Dùng để bỏ qua keyboard shortcut khi người dùng đang gõ chữ.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}
