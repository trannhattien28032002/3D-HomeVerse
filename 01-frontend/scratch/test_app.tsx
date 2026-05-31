import React, { useEffect } from "react";
import Router from "./routes/Routes";
import Cookies from "js-cookie";
import "./App.css";
import { useSockets } from "src/util/Socket";
import { socket } from "src";
import { useAppSelector } from "src/app/hooks";
import { RootState } from "src/app/store";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { userActions } from "./redux/reducer/user/UserReducer";
import { ROOT_URL } from "./config/ApiConstants";

function App() {
    const currentUser = useAppSelector((state: RootState) => state.userReducer.currentUser);
    const dispatch = useDispatch();

    useEffect(() => {
        const token = Cookies.get("token");
        console.log("Connect to socket");
        console.log(ROOT_URL);

        if (token && currentUser) {

            socket.auth = {
                token: token,
                userInfo: currentUser,
                type: "Web"
            };

            socket.connect();
        }
        return;
    }, [currentUser]);

    useSockets()

    return (
        <>
            <Router></Router>
        </>
    );
}

export default App;
