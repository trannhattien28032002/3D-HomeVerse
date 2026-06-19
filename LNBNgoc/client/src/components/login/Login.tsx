import React, { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { useNavigate } from "react-router";
import { createPortal } from "react-dom";

import { RootState } from "src/app/store";
import { useAppSelector, useAppDispatch } from "src/app/hooks";
import { authActions } from "src/redux/reducer/auth/AuthReducer";
import { commonAction } from "src/redux/reducer/common/CommonReducer";
import Loading from "src/share/loading/Loading";
import Modal from "src/share/modal/Modal";

import "src/components/login/Login.scss";

interface LoginProps { }

/**
 * Login
 * @param {object} props
 * @return {jsx}
 */

const Login: React.FC<LoginProps> = (props) => {
    const isLoggedIn = useAppSelector((state: RootState) => state.authReducer.isLoggedIn);
    const isLoading = useAppSelector((state: RootState) => state.authReducer.isLoading);
    const isLoadingBlock = useAppSelector((state: RootState) => state.authReducer.isLoading);
    const refreshToken = useAppSelector((state: RootState) => state.authReducer.refreshToken);
    const token = useAppSelector((state: RootState) => state.authReducer.token);
    const isLoadingErr = useAppSelector((state: RootState) => state.commonReducer.isLoadingErr);
    const number_failed = useAppSelector((state: RootState) => state.commonReducer.number_failed);
    const errMsg = useAppSelector((state: RootState) => state.commonReducer.errMsg);
    const time_fail = useAppSelector((state: RootState) => state.commonReducer.time_fail);
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const dateTime = new Date(time_fail);
    const timeSetTwoHour = new Date(time_fail);
    timeSetTwoHour.setTime(dateTime.getTime() + 2 * 60 * 60 * 1000);

    const [onModal, setOnModal] = useState(false);
    const toggle = () => {
        setOnModal(!onModal);
    };

    useEffect(() => {
        if (isLoggedIn) {
            dispatch(commonAction.setDisplayFailToken({}));
            Cookies.set("token", token, { path: "/" , expires: 7});
            Cookies.set("refreshToken", refreshToken, { path: "/" , expires: 7});
            navigate("/");
        }
    }, [isLoggedIn, isLoadingErr, navigate, refreshToken,dispatch,token]);

    const [account, setAccount] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const handleSubmit = (e: { preventDefault: () => void }) => {
        e.preventDefault();
        const currentTime = new Date(Date.now());
        if (number_failed === 10) {
            timeSetTwoHour.setTime(dateTime.getTime() + 2 * 60 * 60 * 1000);
            if (timeSetTwoHour.getTime() > currentTime.getTime()) {
                setOnModal(true);
            } else {
                setOnModal(false);
                dispatch(authActions.reqGetDataLogin({ account, username, password }));
            }
        } else {
            setOnModal(false);
            dispatch(authActions.reqGetDataLogin({ account, username, password }));
        }
    };

    const handleCloseModal = () => {
        dispatch(commonAction.setDisplayError({}));
    };
    const modalRoot = document.getElementById("root-modal");

    const modalPortalLoginFail = modalRoot ? createPortal(<Modal isShow={onModal} title={"再度ログインするには上記の時間までお待ちください"} timeSetTwoHour={timeSetTwoHour} onClose={toggle} />, modalRoot) : null;

    const modalPortal = modalRoot ? createPortal(<Modal isShow={isLoadingErr} title={errMsg} timeSetTwoHour={dateTime} onClose={handleCloseModal} />, modalRoot) : null;

    return (
        <React.Fragment>
            {modalPortalLoginFail}
            {modalPortal}
            <div id="root-modal"></div>
            <Loading isShow={isLoading} isLoadingBlock={isLoadingBlock} />
            <form onSubmit={handleSubmit}>
                <div className="App">
                    <div className="form-group">
                        <input className="id" placeholder="アカウント名" onChange={(e) => setAccount(e.target.value)}></input>
                        <label className="lb-messageLogin">アカウントIDは筆者です。</label>

                        <input className="account" placeholder="ユーザー名" onChange={(e) => setUsername(e.target.value)}></input>
                        <label className="lb-messageLogin">ユーザー名は筆者です。</label>

                        <input className="password" type="password" placeholder="パスワード" onChange={(e) => setPassword(e.target.value)}></input>
                        <label className="lb-messageLogin">パスワードは筆者です。</label>

                        <label className="remember-me">
                            <input type="checkbox" name="remember-me" value="1"></input>
                            <span className="checkmark"></span>
                            ログイン情報を記憶する
                        </label>
                    </div>
                    <button className="btn-style1">ログイン</button>
                    <div className="group-brand">
                        <label className="brand big-size">MEIDEN</label>
                        <label className="copyright ">Copyright @2018-2021, MEIDENSHA CORPORATION, ALL Rights Reserved</label>
                    </div>
                </div>
            </form>
        </React.Fragment>
    );
};

export default Login;
