import React from "react";
import { Navigate } from "react-router-dom";
import Cookies from "js-cookie";
interface PrivateRouteProps {
    component: React.FC<any>;
}
/**
 * Private router
 * @param {object} props
 * @return {jsx}
 */
const PrivateRoute: React.FC<PrivateRouteProps> = ({ component: Component }) => {
    const token = Cookies.get("token");

    if (!token) {
        return <Navigate to={"/login"} />;
    } else {
        return <Component />;
    }
};

export default PrivateRoute;
