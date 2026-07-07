/**
 * skills.test — WP5. Verify registry nạp .md qua import.meta.glob + read_skill tool.
 */
import { describe, it, expect } from "vitest";
import { listSkills, getSkill, hasSkill, skillNames } from "src/ai/skills";
import { readSkillTool } from "src/ai/tools/readSkill";

describe("skills registry", () => {
    it("nạp được .md (glob chạy trong vitest)", () => {
        expect(skillNames().length).toBeGreaterThan(0);
        expect(hasSkill("furnish-bedroom")).toBe(true);
    });

    it("mỗi skill có mô tả ngắn (dòng '> ...')", () => {
        for (const s of listSkills()) {
            expect(s.description.length).toBeGreaterThan(0);
        }
    });

    it("getSkill trả full nội dung", () => {
        const c = getSkill("furnish-bedroom");
        expect(c).toContain("Phòng ngủ");
    });
});

describe("read_skill tool", () => {
    it("trả nội dung skill có thật", async () => {
        const raw = await readSkillTool.handler({ name: "furnish-bedroom" }, {} as never);
        const out = JSON.parse(raw);
        expect(out.ok).toBe(true);
        expect(out.content).toContain("giường");
    });

    it("skill không tồn tại → lỗi liệt kê tên có sẵn", async () => {
        await expect(readSkillTool.handler({ name: "khong-co" }, {} as never)).rejects.toThrow(/Có sẵn/);
    });
});
