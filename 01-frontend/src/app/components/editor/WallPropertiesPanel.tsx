/**
 * WallPropertiesPanel — panel chỉnh sửa thông số tường được chọn.
 *
 * Hiển thị khi có ≥ 1 tường được select trong SelectTool.
 * Input: thickness (75–300mm), height (2700–4500mm) — mỗi cái có slider + number input.
 * Output: onApply(thicknessWorld, heightWorld) → host dispatch UPDATE_WALL.
 *
 * State: local useState cho thickness/height — sync với initialThickness/Height khi prop đổi.
 * Đơn vị: UI hiển thị mm, onApply chuyển sang world units (metres) trước khi gọi.
 * Hỗ trợ chọn nhiều tường: countLabel hiển thị số lượng, Apply áp dụng cho tất cả.
 */
import { useEffect, useState } from "react";

/** 1 world unit = 1 m = 1000 mm */
const MM_PER_WORLD = 1000;

type Props = {
    wallIds: Set<number>;
    initialThickness?: number; // mm, pre-filled from selected wall
    initialHeight?: number;    // mm, pre-filled from selected wall
    onApply: (thicknessWorld: number, heightWorld: number) => void;
};

export default function WallPropertiesPanel({ wallIds, initialThickness, initialHeight, onApply }: Props) {
    const [thickness, setThickness] = useState(initialThickness ?? 150);
    const [height, setHeight] = useState(initialHeight ?? 3200);

    useEffect(() => {
        if (initialThickness !== undefined) setThickness(initialThickness);
    }, [initialThickness]);

    useEffect(() => {
        if (initialHeight !== undefined) setHeight(initialHeight);
    }, [initialHeight]);

    const countLabel = wallIds.size === 1
        ? `Wall #${[...wallIds][0]}`
        : `${wallIds.size} walls selected`;

    return (
        <aside className="fixed right-10 top-1/2 -translate-y-1/2 z-40 w-72 bg-surface-container/90 backdrop-blur-2xl border border-primary-container/30 shadow-[0_8px_32px_rgba(124,88,0,0.15)] rounded-2xl p-6 flex flex-col gap-6">
            <div className="border-b border-primary-container/20 pb-3">
                <h2 className="font-headline-sm text-headline-sm text-primary leading-none">Wall Properties</h2>
                <span className="block mt-1 text-body-sm text-on-surface-variant/70">{countLabel}</span>
            </div>

            {/* Thickness */}
            <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                    <label className="font-label-lg text-label-lg text-on-surface-variant uppercase tracking-wider">
                        Thickness
                    </label>
                    <input
                        type="number"
                        value={thickness}
                        min={75}
                        max={300}
                        onChange={e => setThickness(Math.min(300, Math.max(75, Number(e.target.value))))}
                        className="w-16 bg-surface-container-low border border-outline-variant/30 rounded px-2 py-1 text-label-sm text-on-surface focus:ring-1 focus:ring-primary-container focus:border-primary-container outline-none"
                    />
                </div>
                <input
                    type="range"
                    min={75}
                    max={300}
                    step={5}
                    value={thickness}
                    onChange={e => setThickness(Number(e.target.value))}
                    className="w-full h-1.5 bg-surface-variant rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-on-surface-variant/60 font-label-sm uppercase">
                    <span>75mm</span>
                    <span>300mm</span>
                </div>
            </div>

            {/* Height */}
            <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                    <label className="font-label-lg text-label-lg text-on-surface-variant uppercase tracking-wider">
                        Height
                    </label>
                    <input
                        type="number"
                        value={height}
                        min={2700}
                        max={4500}
                        onChange={e => setHeight(Math.min(4500, Math.max(2700, Number(e.target.value))))}
                        className="w-20 bg-surface-container-low border border-outline-variant/30 rounded px-2 py-1 text-label-sm text-on-surface focus:ring-1 focus:ring-primary-container focus:border-primary-container outline-none"
                    />
                </div>
                <input
                    type="range"
                    min={2700}
                    max={4500}
                    step={50}
                    value={height}
                    onChange={e => setHeight(Number(e.target.value))}
                    className="w-full h-1.5 bg-surface-variant rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-on-surface-variant/60 font-label-sm uppercase">
                    <span>2700mm</span>
                    <span>4500mm</span>
                </div>
            </div>

            <button
                onClick={() => onApply(thickness / MM_PER_WORLD, height / MM_PER_WORLD)}
                className="mt-2 w-full py-3 bg-primary text-on-primary rounded-xl font-label-lg text-label-lg uppercase tracking-widest hover:bg-primary/90 transition-colors shadow-sm"
            >
                Apply Specs
            </button>
        </aside>
    );
}
