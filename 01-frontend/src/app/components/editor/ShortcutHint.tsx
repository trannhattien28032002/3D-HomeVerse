import { Fragment } from "react";

const SHORTCUTS = [
    { key: "V",   label: "Select"       },
    { key: "B",   label: "Build"        },
    { key: "F",   label: "Decor"        },
    { key: "M",   label: "Material"     },
    { key: "R",   label: "Rotate"       },
    { key: "Tab", label: "Toggle 2D/3D" },
] as const;

export default function ShortcutHint() {
    return (
        <div
            className="fixed bottom-6 right-6 z-[60] p-4 rounded-2xl bg-surface/60 backdrop-blur-md border border-primary-container/40 shadow-lg pointer-events-auto flex flex-col gap-2 min-w-[180px] select-none"
            style={{ fontFamily: "'Alegreya', serif" }}
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-1 border-b border-primary-container/20 pb-1">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>keyboard</span>
                <h3 className="text-primary font-bold text-sm tracking-wide uppercase">Shortcuts</h3>
            </div>

            {/* Key → Label grid */}
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-on-surface-variant">
                {SHORTCUTS.map(({ key, label }) => (
                    <Fragment key={key}>
                        <kbd className="bg-primary-container/20 px-1.5 py-0.5 rounded text-[10px] font-bold border border-primary-container/30 text-primary min-w-[20px] text-center self-center">
                            {key}
                        </kbd>
                        <span className="text-xs self-center">{label}</span>
                    </Fragment>
                ))}
            </div>
        </div>
    );
}
