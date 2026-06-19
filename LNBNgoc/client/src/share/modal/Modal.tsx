import React from "react";
import "src/share/modal/Modal.scss";
import userIcon from "src/assets/images/warning.png";
import { getDMYHM } from "src/util/DateUtil";

interface ModalProps {
    isShow: boolean;
    title: string;
    timeSetTwoHour: Date;
    onClose: () => void;
}

const Modal: React.FC<ModalProps> = ({ isShow, title, timeSetTwoHour, onClose }) => {
    return (
        <>
            {isShow && (
                <div className="overlay-modal">
                    <div className="wrapper-modal">
                        <div className="content-modal">
                            <div className="icon-warning">
                                <img src={userIcon} className="iconWn" alt="warning" />
                            </div>
                            <div className="content-title-modal">
                                <span className="span-title-value">{title}</span>
                            </div>
                            <div className="content-time-modal">
                                <span className="span-time"> 時間：</span>
                                {timeSetTwoHour &&(
                                    <span className="span-time-value">{getDMYHM(timeSetTwoHour)}</span>
                                )}
                            </div>
                            <div className="div_btn_close">
                                <button className="btn_close" onClick={onClose}>
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

export default Modal;
