/**
 * Route guards dựa trên useAuthStore (A5).
 *
 * RequireAuth: bọc route cần đăng nhập (D3: /projects, /project/:id). Khi
 * status === "anon" → redirect sang /login, giữ lại path hiện tại trong
 * location.state.returnTo để LoginPage điều hướng lại sau khi đăng nhập xong.
 * status === "loading" không xảy ra ở đây vì App chỉ render Router sau khi
 * status đã resolve (xem App.tsx).
 *
 * RedirectIfAuthed: bọc /login, /register — user đã đăng nhập rồi thì không
 * cần thấy lại form, đưa thẳng về /projects.
 */
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "src/app/store/useAuthStore";

export function RequireAuth({ children }: { children: ReactNode }) {
    const status = useAuthStore((s) => s.status);
    const location = useLocation();

    if (status === "anon") {
        return <Navigate to="/login" state={{ returnTo: location.pathname }} replace />;
    }
    return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
    const status = useAuthStore((s) => s.status);

    if (status === "authed") {
        return <Navigate to="/projects" replace />;
    }
    return <>{children}</>;
}
