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
import { RequireAuth, RedirectIfAuthed } from "src/app/routes/PrivateRoute";

const EditorPage = lazy(() => import("src/app/pages/EditorPage/EditorPage"));
const ProjectsPage = lazy(() => import("src/app/pages/ProjectPage/ProjectsPage"));
const LoginPage = lazy(() => import("src/app/pages/LoginPage/LoginPage"));
const RegisterPage = lazy(() => import("src/app/pages/RegisterPage/RegisterPage"));

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <RouterRoutes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <LoginPage />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/register"
            element={
              <RedirectIfAuthed>
                <RegisterPage />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/project/:id"
            element={
              <RequireAuth>
                <EditorPage />
              </RequireAuth>
            }
          />
          <Route
            path="/projects"
            element={
              <RequireAuth>
                <ProjectsPage />
              </RequireAuth>
            }
          />
          {/* <Route path="/projects/:id" element={<EditorPage />} /> */}
        </RouterRoutes>
      </Suspense>
    </BrowserRouter>
  );
}
