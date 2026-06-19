import React, { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { useNavigate } from "react-router";
import { RootState } from "src/app/store";
import { useAppSelector, useAppDispatch } from "src/app/hooks";
import { userActions } from "src/redux/reducer/user/UserReducer";
import { enginesAction } from "src/redux/reducer/engines/EnginesReducer";
import ModalChangePass from "src/share/modal_change_password/ModalChangePassword";
import TreeMenu from "src/share/tree_menu/TreeMenu";
import userIcon from "src/assets/images/iconUser.png";
import ForecastTable from "src/share/table/Table";
import Calendar from "src/share/calendar/Calendar";
import ChartComponent from "src/share/chart/Chart";
import ButtonDownload from "src/share/button_download/ButtonDownload";
import TwoButtons from "src/share/two_buttons/TwoButtons";
import { getYMD } from "src/util/DateUtil";
import { createPortal } from "react-dom";
import { authActions } from "src/redux/reducer/auth/AuthReducer";
import "src/components/mainClient/MainClient.scss";

interface AuthProps {
    dataFromChildCalendar: string;
    dataFromChildMenu: number;
    dataFromChildButton: number;
}
/**
 * Auth component
 * @param {object} props
 * @return {jsx}
 */
const Auth: React.FC<AuthProps> = (props) => {
    const isTokenErr = useAppSelector((state: RootState) => state.commonReducer.isTokenErr);
    const TokenNew = useAppSelector((state: RootState) => state.userReducer.accessTokenNew);
    const accountId = useAppSelector((state: RootState) => state.userReducer.user.id);
    const name = useAppSelector((state: RootState) => state.userReducer.user.name);
    const dbName = useAppSelector((state: RootState) => state.userReducer.user.username);
    const damMenu = useAppSelector((state: RootState) => state.enginesReducer.damMenu);
    const isLoggedOut = useAppSelector((state: RootState) => state.authReducer.isLoggedOut);
    const timeSelectChart = useAppSelector((state: RootState) => state.enginesReducer.timeSelectChart);
    const dataMainGsm = useAppSelector((state: RootState) => state.enginesReducer.dataMainGsm[0].dataChart);
    const dataMainMsm = useAppSelector((state: RootState) => state.enginesReducer.dataMainMsm[0].dataChart);
    const chartSettingGsm = useAppSelector((state: RootState) => state.enginesReducer.dataMainGsm[0].chartSetting);
    const chartSettingMsm = useAppSelector((state: RootState) => state.enginesReducer.dataMainMsm[0].chartSetting);

    const token = Cookies.get("token");
    const refreshToken = Cookies.get("refreshToken");
    const dispatch = useAppDispatch();
    const dataTable = { timeSelectChart, dataMainMsm, dataMainGsm };
    const chartSetting = { chartSettingGsm, chartSettingMsm };
    const navigate = useNavigate();
    const now = new Date(Date.now());
    const [damId, setId] = useState(1);
    const [time, setSelectedTime] = useState(getYMD(now).toString());
    const [isButton, setButton] = useState(2);
    const [isMG, setIsMG] = useState(2);
    const [onModal, setOnModal] = useState(false);
    const type = 1;

    const handleLogOut = (e: { preventDefault: () => void }) => {
        e.preventDefault();
        dispatch(authActions.reqDataLogOut({ accountId, refreshToken }));
    };

    const toggle = () => {
        setOnModal(!onModal);
    };

    const handleChangePass = (e: { preventDefault: () => void }) => {
        e.preventDefault();
        setOnModal(true);
    };

    const handleDataReceived = (dataFromChildCalendar: string) => {
        setSelectedTime(dataFromChildCalendar);
    };
    const handleDataButton = (dataFromChildButton: number) => {
        setButton(dataFromChildButton);
    };
    const handleDataMG = (dataFromChildButton: number) => {
        setIsMG(dataFromChildButton);
    };

    const handleDataReceivedMenu = (dataFromChildMenu: number) => {
        setId(dataFromChildMenu);
    };

    useEffect(() => {
        if (isTokenErr) {
            Cookies.remove("token", { path: "/" });
            Cookies.remove("refreshToken", { path: "/" });
            dispatch(authActions.reqDataLogOut({ accountId, refreshToken }));
        }
    }, [isTokenErr, accountId, dispatch, refreshToken]);

    useEffect(() => {
        if (!isLoggedOut) {
            if (token && refreshToken) {
                dispatch(userActions.reqDataUser({ token, refreshToken }));
                if (dbName) {
                    dispatch(enginesAction.reqGetDataEngines({ dbName, token, refreshToken }));
                    dispatch(enginesAction.reqGetDataEnginesDam({ dbName, type, damId, time, token, refreshToken }));
                }
            }
        } else {
            Cookies.remove("token", { path: "/" });
            Cookies.remove("refreshToken", { path: "/" });
            navigate("/login");
        }
    }, [isLoggedOut, dispatch, navigate, token, refreshToken, dbName, type, damId, time]);

    useEffect(() => {
        if (TokenNew) {
            Cookies.set("token", TokenNew, { path: "/", expires: 7 });
        }
    }, [TokenNew]);

    const modalRoot = document.getElementById("root-modal");
    const modalPortalChangePass = modalRoot ? createPortal(<ModalChangePass account={dbName} username={accountId} isShow={onModal} title={"パスワード変更"} onClose={toggle} handleLogOut={handleLogOut} />, modalRoot) : null;
    return (
        <React.Fragment>
            {modalPortalChangePass}
            <div id="root-modal"></div>
            <body>
                <header>
                    <div className="header-top">
                        <nav>
                            <div className="navbar">
                                <div className="navbar-toggle">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>
                                <div className="header-account">
                                    <div className="login-icon">
                                        <img className="img-login-icon" src={userIcon} alt="" />
                                    </div>
                                    <div>
                                        <span className="account_id">{name}</span>
                                        <span className="username">{accountId}</span>
                                    </div>

                                    <div className="menu-user">
                                        <button className="change-pass-btn" onClick={handleChangePass}>
                                            パスワード変更
                                        </button>
                                        <hr className="hr-menu-user"></hr>
                                        <button className="logout-btn" onClick={handleLogOut}>
                                            ログアウト
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </nav>
                    </div>
                    <div className="header-bot">
                        <p className="p-blu">運転計画支援</p>
                        <p className="p-white"> {">"} 天気予測 </p>
                    </div>
                    <div className="header-title">
                        <div className="item-header-title">
                            <div className="black-bar"></div>
                            <p>天気予測</p>
                        </div>
                    </div>
                </header>

                <main>
                    <div className="container">
                        <div className="menu-left">{damMenu !== null && damMenu !== undefined && <TreeMenu dataTree={damMenu} onDataSentMenu={handleDataReceivedMenu} />}</div>
                        {damId !== null && damId !== undefined && (
                            <div className="chart-all">
                                <Calendar onDataSentCalendar={handleDataReceived} />
                                <div className="switchTable_Chart">
                                    <TwoButtons label1={"グラフ"} label2={"表"} onDataButton={handleDataButton} />
                                </div>
                                <div className="switchGSM_MSM">
                                    <TwoButtons label1={"MSM"} label2={"GSM"} onDataButton={handleDataMG} />
                                </div>
                                {isButton === 1 && (
                                    <div className="chart-table-1">
                                        {dataTable.dataMainGsm !== null && dataTable.dataMainGsm !== undefined && dataTable.dataMainMsm !== null && dataTable.dataMainMsm !== undefined && <ForecastTable dataTable={dataTable} dataType={isMG} />}
                                        <div className="table-p">
                                            <p>降雨量[mm]気温[℃]</p>
                                        </div>
                                    </div>
                                )}
                                {isButton === 2 && (
                                    <div className="chart-table-2">
                                        <div className="combo-chart-p">
                                            <div className="chart-p1">
                                                <p>[mm]</p>
                                            </div>
                                            <div className="chart-p2">
                                                <p>[℃]</p>
                                            </div>
                                        </div>
                                        {dataTable.dataMainGsm !== null && dataTable.dataMainGsm !== undefined && dataTable.dataMainMsm !== null && dataTable.dataMainMsm !== undefined && <ChartComponent dataTable={dataTable} dataType={isMG} dataSetting={chartSetting} />}
                                    </div>
                                )}
                                <div>{dataTable.dataMainGsm !== null && dataTable.dataMainGsm !== undefined && dataTable.dataMainMsm !== null && dataTable.dataMainMsm !== undefined && <ButtonDownload label={"ダウンロード"} className="btn-download" dataType={isMG} dataTable={dataTable} />}</div>
                            </div>
                        )}
                    </div>
                </main>
                <footer>
                    <p>Copyright(c) MEIDENSHA CORPORATION All Rights Reserved.</p>
                </footer>
                <script src="./index.js"></script>
            </body>
        </React.Fragment>
    );
};
export default Auth;
