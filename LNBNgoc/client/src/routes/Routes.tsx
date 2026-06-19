import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
// import Auth from "src/components/auth/Auth";
import Login from "src/components/login/Login";
import MainClient from "src/components/mainClient/MainClient";
import PrivateRouter from "./PrivateRoute";
interface MyRoutesProps {}
/**
 * Routes
 * @return {jsx}
 */
const MyRoutes: React.FC<MyRoutesProps> = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<PrivateRouter component={MainClient} />} />
                {/* <Route path="/auth" element={<PrivateRouter component={Auth} />} /> */}
                <Route path="/login" element={<Login />} />
            </Routes>
        </BrowserRouter>
    );
};

export default MyRoutes;
