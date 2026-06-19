import React from "react";
import "src/share/modal_success/ModalSuccess.scss";
import userIcon from "src/assets/images/tick.png";
import { getDMYHM } from "src/util/DateUtil";


interface ModalSuccessProps {
    isShow: boolean;
    title: string;
    onClose: () => void;
}

const ModalSuccess: React.FC<ModalSuccessProps> = ({ isShow, title, onClose}) => {
    return (
        <>
            {isShow && (
                <div className="overlay-modal2">
                    <div className="wrapper-modal2">
                        <div className="content-modal2">
                            <div className="icon-warning2">
                                
                                <img src={userIcon} className="iconWn" alt="warning" />
                                
                            </div>
                            <div className="content-title-modal2">
                                <span className="span-title-value2">{title}</span>
                            </div>
                            <div className="content-time-modal2">
                                <span className="span-time2"> 時間：</span>
                                    <span className="span-time-value2">{getDMYHM(new Date(Date.now()))}</span>
                                
                            </div>
                            <div className="div_btn_close2">
                                <button className="btn_close2" onClick={onClose}>
                                    クローズ
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ModalSuccess;
