/**
 * Cấu hình routing toàn app.
 * Routes:
 *   /                → HomePage (landing page)
 *   /project/:id     → EditorPage (editor 3D/2D)
 *   /projects        → ProjectsPage (danh sách dự án)
 *
 * Code-splitting (CR-02): HomePage là landing nên import tĩnh để paint ngay.
 * EditorPage (kéo three + three/addons + konva + cannon-es) và ProjectsPage được
 * lazy-load để landing page không phải tải nguyên stack 3D trước khi mở editor.
 */
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes as RouterRoutes } from "react-router-dom";
import HomePage from "src/app/pages/HomePage/HomePage";
import RouteFallback from "src/app/routes/RouteFallback";

const EditorPage = lazy(() => import("src/app/pages/EditorPage/EditorPage"));
const ProjectsPage = lazy(() => import("src/app/pages/ProjectPage/ProjectsPage"));

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <RouterRoutes>
          <Route path="/" element={<HomePage />} />
          <Route path="/project/:id" element={<EditorPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          {/* <Route path="/projects/:id" element={<EditorPage />} /> */}
        </RouterRoutes>
      </Suspense>
    </BrowserRouter>
  );
}
