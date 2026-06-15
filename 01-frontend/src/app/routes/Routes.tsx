/**
 * Cấu hình routing toàn app.
 * Routes:
 *   /                → HomePage (landing page)
 *   /project/:id     → EditorPage (editor 3D/2D)
 *   /projects        → ProjectsPage (danh sách dự án)
 */
import { BrowserRouter, Route, Routes as RouterRoutes } from "react-router-dom";
import HomePage from "src/app/pages/HomePage/HomePage";
import EditorPage from "src/app/pages/EditorPage/EditorPage";
import ProjectsPage from "src/app/pages/ProjectPage/ProjectsPage";

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <RouterRoutes>
        <Route path="/" element={<HomePage />} />
        <Route path="/project/:id" element={<EditorPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        {/* <Route path="/projects/:id" element={<EditorPage />} /> */}
      </RouterRoutes>
    </BrowserRouter>
  );
}
