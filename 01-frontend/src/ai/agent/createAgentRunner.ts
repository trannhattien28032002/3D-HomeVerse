/**
 * createAgentRunner — ráp toàn bộ trục AI thành 1 hàm run(message) (WP1b).
 *
 * Wiring: describeScene (mắt) + ToolRegistry (placeFurniture) + BackendTransport
 * (kênh 5a) + runAgent (vòng lặp + 1 transaction/undo). UI chỉ cần gọi run(text).
 */
import type { EngineApi } from "src/app/hooks/useEngineApi";
import type { ScenePerceptionSource } from "src/ai/perception/describeScene";
import type { AgentRunResult } from "src/ai/agent/agentTypes";
import { describeScene } from "src/ai/perception/describeScene";
import { ToolRegistry } from "src/ai/agent/toolRegistry";
import { searchCatalogTool } from "src/ai/tools/searchCatalog";
import { createRoomTool } from "src/ai/tools/createRoom";
import { placeFurnitureTool } from "src/ai/tools/placeFurniture";
import { addOpeningTool } from "src/ai/tools/addOpening";
import { resizeRoomTool } from "src/ai/tools/resizeRoom";
import { runAgent } from "src/ai/agent/AgentClient";
import { BackendTransport } from "src/ai/transport/backendTransport";
import { buildSystemPrompt } from "src/ai/agent/systemPrompt";
import { listCategories } from "src/ai/catalog/catalogSummary";

const DEFAULT_BASE_URL =
    (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";

export type AgentRunner = {
    run(message: string): Promise<AgentRunResult>;
};

export function createAgentRunner(opts: {
    api: EngineApi;
    perception: ScenePerceptionSource;
    baseUrl?: string;
}): AgentRunner {
    const registry = new ToolRegistry([
        searchCatalogTool,
        createRoomTool,
        placeFurnitureTool,
        addOpeningTool,
        resizeRoomTool,
    ]);
    const system = buildSystemPrompt(listCategories());
    const transport = new BackendTransport({ baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL, system });

    return {
        async run(message: string): Promise<AgentRunResult> {
            // Re-perceive mỗi lượt → agent luôn thấy scene mới nhất.
            const scene = describeScene(opts.perception);
            return runAgent(transport, registry, { api: opts.api, perception: opts.perception }, { message, scene });
        },
    };
}
