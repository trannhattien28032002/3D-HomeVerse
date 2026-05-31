import type { EngineApi } from "src/engine/engineTypes";

export type Mode = "3d" | "2d";

export type NavItem = {
  id: string;
  icon: string;
  label: string;
  modes: Mode[];
  /** Called on click. Receives setMode and the engine API (may be null before engine is ready). */
  action?: (setMode: (m: Mode) => void, engine: EngineApi | null) => void;
};

export const BOTTOM_NAV: NavItem[] = [
  { id: "translate", icon: "open_with", label: "Move (Q)", modes: ["3d"] },
  { id: "rotate", icon: "rotate_90_degrees_cw", label: "Rotate (W)", modes: ["3d"] },
  { id: "select", icon: "select_all", label: "Select (V)", modes: ["2d"] },
  { id: "divider-1", icon: "", label: "", modes: ["3d", "2d"] },
  { id: "build", icon: "construction", label: "Build (B)", modes: ["2d"] },
  { id: "decor", icon: "chair", label: "Decor (F)", modes: ["3d", "2d"] },
  { id: "color", icon: "texture", label: "Color (M)", modes: ["3d", "2d"] },
  { id: "divider-2", icon: "", label: "", modes: ["3d", "2d"] },
  {
    id: "rot-left", icon: "rotate_left", label: "Left", modes: ["3d"],
    action: (_setMode, engine) => { engine?.rotateView(45); }
  },
  {
    id: "rot-right", icon: "rotate_right", label: "Right", modes: ["3d"],
    action: (_setMode, engine) => { engine?.rotateView(-45); }
  },
  {
    id: "top", icon: "vertical_align_top", label: "Top", modes: ["3d"],
    action: (_setMode, engine) => { engine?.setView("plan"); }
  },
  {
    id: "view-3d", icon: "3d_rotation", label: "3D View", modes: ["3d"],
    action: (_setMode, engine) => { engine?.setView("perspective"); }
  },
  {
    id: "view-walk", icon: "person", label: "Walk", modes: ["3d"],
    action: (_setMode, engine) => { engine?.setView("eye-level"); }
  },
  { id: "divider-3", icon: "", label: "", modes: ["3d", "2d"] },
  {
    id: "to-2d", icon: "view_quilt", label: "2D", modes: ["3d"],
    action: (setMode) => setMode("2d"),
  },
  {
    id: "to-3d", icon: "view_in_ar", label: "3D", modes: ["2d"],
    action: (setMode) => setMode("3d"),
  },
];
