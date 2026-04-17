import { useState } from "react";
import "./App.css";
import EditorPage from "./app/pages/EditorPage";
import Plan2DPage from "./app/pages/Plan2DPage";

function App() {
  const [mode, setMode] = useState<"3d" | "2d">("3d");

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {mode === "3d" ? <EditorPage /> : <Plan2DPage />}

      <button
        type="button"
        onClick={() => setMode((prev) => (prev === "3d" ? "2d" : "3d"))}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 20,
          border: "1px solid #334155",
          background: "rgba(15, 23, 42, 0.9)",
          color: "#e2e8f0",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer"
        }}
      >
        Switch to {mode === "3d" ? "2D" : "3D"}
      </button>
    </div>
  )
}

export default App
