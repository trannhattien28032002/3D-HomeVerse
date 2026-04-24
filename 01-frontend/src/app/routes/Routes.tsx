import { BrowserRouter, Route, Routes as RouterRoutes } from "react-router-dom";
import EditorPage from "@/app/pages/EditorPage";
import Plan2DPage from "@/app/pages/Plan2DPage";

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <RouterRoutes>
        <Route path="/" element={<EditorPage />} />
        <Route path="/plan-2d" element={<Plan2DPage />} />
      </RouterRoutes>
    </BrowserRouter>
  );
}
