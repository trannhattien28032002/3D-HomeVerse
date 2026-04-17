// import { create } from "zustand";

// type InspectorTransform = {
//     x: number;
//     y: number;
//     z: number;
//     rotY: number;
// };

// type EditorState = {
//     selectedEntityId: number | null;
//     isDragging: boolean;
//     inspectorTransform: InspectorTransform | null;

//     setSelectedEntityId: (id: number | null) => void;
//     setDragging: (dragging: boolean) => void;
//     setInspectorTransform: (t: InspectorTransform | null) => void;
// };

// export const useEditorStore = create<EditorState>((set) => ({
//     selectedEntityId: null,
//     isDragging: false,
//     inspectorTransform: null,

//     setSelectedEntityId: (id) => set({ selectedEntityId: id }),
//     setDragging: (dragging) => set({ isDragging: dragging }),
//     setInspectorTransform: (t) => set({ inspectorTransform: t })
// }));

