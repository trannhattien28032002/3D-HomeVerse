/**
 * readSkill — tool nạp full nội dung 1 skill (WP5, progressive disclosure).
 *
 * System prompt chỉ có tên + mô tả ngắn; LLM gọi tool này khi cần lời khuyên chi
 * tiết (vd "bày phòng ngủ" → read_skill("furnish-bedroom")). Read-only, không
 * dispatch gì → an toàn tuyệt đối.
 */
import type { ToolDef } from "src/ai/agent/agentTypes";
import { ToolInputError } from "src/ai/tools/dispatchBridge";
import { getSkill, skillNames } from "src/ai/skills";

export const readSkillTool: ToolDef = {
    schema: {
        name: "read_skill",
        description:
            "Đọc hướng dẫn thiết kế chi tiết theo tên (progressive disclosure). Gọi TRƯỚC khi " +
            "bày phòng / phối màu theo phong cách để áp đúng luật. name lấy từ danh mục skill " +
            "trong system prompt (vd 'furnish-bedroom', 'style-scandinavian').",
        input_schema: {
            type: "object",
            properties: {
                name: { type: "string", description: "tên skill (không đuôi .md) từ danh mục" },
            },
            required: ["name"],
        },
    },
    handler: async (input) => {
        if (!input || typeof input !== "object") throw new ToolInputError("input phải là object.");
        const name = (input as Record<string, unknown>).name;
        if (typeof name !== "string") throw new ToolInputError("name phải là string.");
        const content = getSkill(name);
        if (content === undefined) {
            throw new ToolInputError(`Không có skill "${name}". Có sẵn: ${skillNames().join(", ")}.`);
        }
        return JSON.stringify({ ok: true, name, content });
    },
};
