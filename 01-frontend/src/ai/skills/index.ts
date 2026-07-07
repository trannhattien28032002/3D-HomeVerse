/**
 * skills/index — registry skills (WP5, progressive disclosure).
 *
 * Mỗi skill là 1 file .md trong thư mục này. System prompt CHỈ nhúng tên + mô tả
 * ngắn (dòng "> ..." đầu file); LLM gọi tool read_skill(name) để nạp full nội dung
 * khi task cần → prompt cố định không phình theo số skill.
 *
 * Nạp bằng import.meta.glob (Vite bundle mọi .md; vitest hỗ trợ). Tên skill =
 * tên file không đuôi.
 */
const modules = import.meta.glob("./*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const SKILLS: Record<string, string> = {};
for (const [path, content] of Object.entries(modules)) {
    const name = path.replace(/^\.\//, "").replace(/\.md$/, "");
    SKILLS[name] = content;
}

/** Mô tả ngắn = dòng đầu dạng "> ..." trong .md (fallback = dòng tiêu đề). */
function descriptionOf(content: string): string {
    const quote = content.match(/^>\s*(.+)$/m);
    if (quote) return quote[1].trim();
    const title = content.match(/^#\s*(.+)$/m);
    return title ? title[1].trim() : "";
}

export type SkillInfo = { name: string; description: string };

/** Danh mục skill (tên + mô tả) — nhúng vào system prompt. */
export function listSkills(): SkillInfo[] {
    return Object.entries(SKILLS)
        .map(([name, content]) => ({ name, description: descriptionOf(content) }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function hasSkill(name: string): boolean {
    return name in SKILLS;
}

/** Nội dung đầy đủ của 1 skill (undefined nếu không có). */
export function getSkill(name: string): string | undefined {
    return SKILLS[name];
}

export function skillNames(): string[] {
    return Object.keys(SKILLS).sort();
}
