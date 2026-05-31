import { BrowserRouter, Route, Routes as RouterRoutes } from "react-router-dom";
import HomePage from "src/app/pages/HomePage";
import EditorPage from "src/app/pages/EditorPage";
import ProjectsPage from "src/app/pages/ProjectsPage";

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
