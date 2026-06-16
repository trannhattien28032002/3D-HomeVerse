/**
 * backendTransport.test.ts — toTurn (ChatResponse chuẩn hoá → LlmTurn) + round-trip
 * với fetch giả lập. Wire trung lập (provider-agnostic).
 */
import { describe, it, expect, vi } from "vitest";
import { toTurn, BackendTransport } from "src/ai/transport/backendTransport";
import type { SceneSummary } from "src/ai/perception/describeScene";

describe("toTurn", () => {
    it("có toolCalls → kind tool_use", () => {
        const turn = toTurn({
            text: "",
            toolCalls: [{ id: "c0", name: "placeFurniture", input: { modelId: "x", x: 0, z: 0 } }],
            finishReason: "tool_use",
        });
        expect(turn.kind).toBe("tool_use");
        if (turn.kind === "tool_use") {
            expect(turn.calls).toHaveLength(1);
            expect(turn.calls[0].name).toBe("placeFurniture");
        }
    });

    it("không toolCalls + stop → kind final", () => {
        const turn = toTurn({ text: "Đã xong.", toolCalls: [], finishReason: "stop" });
        expect(turn).toEqual({ kind: "final", text: "Đã xong." });
    });

    it("toolCalls kèm text → tool_use giữ text", () => {
        const turn = toTurn({ text: "Đang đặt...", toolCalls: [{ id: "c", name: "placeFurniture", input: {} }], finishReason: "tool_use" });
        expect(turn.kind).toBe("tool_use");
        if (turn.kind === "tool_use") expect(turn.text).toBe("Đang đặt...");
    });
});

const EMPTY_SCENE: SceneSummary = { rooms: [], walls: [], furniture: [], wallItems: [], empty: true };

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("BackendTransport", () => {
    it("start() POST đúng /ai/chat với turns + parse turn", async () => {
        const fetchImpl = vi.fn(async () =>
            jsonResponse({ text: "hi", toolCalls: [], finishReason: "stop" }),
        ) as unknown as typeof fetch;

        const t = new BackendTransport({ baseUrl: "http://x:3000/", system: "sys", fetchImpl });
        const turn = await t.start({ message: "đặt sofa", scene: EMPTY_SCENE, tools: [] });

        expect(turn).toEqual({ kind: "final", text: "hi" });
        const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(call[0]).toBe("http://x:3000/ai/chat");
        const body = JSON.parse((call[1] as RequestInit).body as string);
        expect(body.system).toBe("sys");
        expect(body.turns[0]).toMatchObject({ role: "user" });
        expect(body.turns[0].content === undefined).toBe(true); // dùng `text`, không `content`
        expect(body.turns[0].text).toContain("đặt sofa");
    });

    it("next() gắn name cho tool result theo id của lượt trước", async () => {
        const responses = [
            jsonResponse({ text: "", toolCalls: [{ id: "c0", name: "placeFurniture", input: { modelId: "bed-single-01", x: 2, z: 1.5 } }], finishReason: "tool_use" }),
            jsonResponse({ text: "Đã đặt.", toolCalls: [], finishReason: "stop" }),
        ];
        let i = 0;
        const fetchImpl = vi.fn(async () => responses[i++]) as unknown as typeof fetch;

        const t = new BackendTransport({ baseUrl: "http://x:3000", system: "s", fetchImpl });
        await t.start({ message: "đặt giường", scene: EMPTY_SCENE, tools: [] });
        const turn2 = await t.next([{ id: "c0", content: '{"ok":true}', isError: false }]);

        expect(turn2).toEqual({ kind: "final", text: "Đã đặt." });
        // Body của request thứ 2: có assistant turn (functionCall) rồi tool turn gắn name.
        const body2 = JSON.parse(((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1] as RequestInit).body as string);
        const toolTurn = body2.turns.find((x: { role: string }) => x.role === "tool");
        expect(toolTurn.results[0]).toMatchObject({ id: "c0", name: "placeFurniture", content: '{"ok":true}' });
        const asstTurn = body2.turns.find((x: { role: string }) => x.role === "assistant");
        expect(asstTurn.toolCalls[0].name).toBe("placeFurniture");
    });

    it("ném lỗi khi backend trả non-2xx", async () => {
        const fetchImpl = vi.fn(async () => new Response("boom", { status: 503 })) as unknown as typeof fetch;
        const t = new BackendTransport({ baseUrl: "http://x:3000", system: "s", fetchImpl });
        await expect(t.start({ message: "x", scene: EMPTY_SCENE, tools: [] })).rejects.toThrow(/503/);
    });
});
