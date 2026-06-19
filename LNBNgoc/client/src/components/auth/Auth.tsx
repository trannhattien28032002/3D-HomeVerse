import React, { useState } from "react";
import { createPortal } from "react-dom";
import "src/components/auth/Auth.scss";
import "src/components/login/Login.scss";

interface AuthProps {}

/**
 * Auth component
 * @param {object} props
 * @return {jsx}
 */
const Auth: React.FC<AuthProps> = () => {
    const [isShowing, setIsShowing] = useState(false);

    const toggle = () => {
        setIsShowing(!isShowing);
    };

    return (
        <React.Fragment>
            
        </React.Fragment>
    );
};

export default Auth;
