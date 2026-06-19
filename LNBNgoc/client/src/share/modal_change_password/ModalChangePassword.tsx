import React, {  useState } from "react";
import {createPortal} from "react-dom";
import Cookies from "js-cookie";
import "src/share/modal_change_password/ModalChangePassword.scss";
import { commonAction } from "src/redux/reducer/common/CommonReducer";
import { useAppDispatch, useAppSelector } from "src/app/hooks";
import { RootState } from "src/app/store";
import { userActions } from "src/redux/reducer/user/UserReducer";
import { authActions } from "src/redux/reducer/auth/AuthReducer";
import Modal from "src/share/modal/Modal";
import ModalSuccess from "src/share/modal_success/ModalSuccess";
import "src/share/modal_change_password/ModalChangePassword.scss";

interface ModalProps {
  account: string;
  username: string;
  isShow: boolean;
  title: string;

  onClose: () => void;
  handleLogOut: (e: { preventDefault: () => void }) => void;
}

const ModalChangePass: React.FC<ModalProps> = ({ account, username, isShow, title, onClose, handleLogOut }) => {
  const number_failed = useAppSelector((state: RootState) => state.commonReducer.number_failed);
  const errMsg = useAppSelector((state: RootState) => state.commonReducer.errMsg);
  const time_fail = useAppSelector((state: RootState) => state.commonReducer.time_fail);
  const isLoadingErr = useAppSelector((state: RootState) => state.commonReducer.isLoadingErr);
  const isDisplay = useAppSelector((state: RootState) => state.userReducer.isDisplay);
  const msg = useAppSelector((state: RootState) => state.userReducer.msg);
  const dispatch = useAppDispatch();
  const accountId = username;
  const token = Cookies.get("token");
  const refreshToken= Cookies.get("refreshToken");
  const [password, setPassword] = useState('');
  const [passwordNew, setPasswordNew] = useState('');
  const [passwordCheckNew, setPasswordCheckNew] = useState('');
  const timeSetTwoHour = new Date(time_fail);
  const dateTime = new Date(time_fail);
  timeSetTwoHour.setTime(dateTime.getTime());

  const [onModal, setOnModal] = useState(false);

  const modalRoot = document.getElementById("root-modal");
  const toggle = () => {
    setOnModal(!onModal);
  };

  const handleCloseModal = () => {
    if (isLoadingErr)
      dispatch(commonAction.setDisplayError({}));
    if (isDisplay)
      dispatch(userActions.setDisplaySuccess({}));
  };

  const modalPortalChangePasswordFail = modalRoot ? createPortal(<Modal isShow={isLoadingErr} title={errMsg} timeSetTwoHour={timeSetTwoHour} onClose={handleCloseModal} />, modalRoot) : null;
  const modalPortalChangePasswordManyIncorrect = modalRoot ? createPortal(<Modal isShow={onModal} title={"再度ログインするには上記の時間までお待ちください"} timeSetTwoHour={timeSetTwoHour} onClose={toggle} />, modalRoot) : null;
  const modalPortalSuccess = modalRoot ? createPortal(<ModalSuccess isShow={isDisplay} title={msg} onClose={handleCloseModal} />, modalRoot) : null;

  const handleAccept = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const currentTime = new Date(Date.now());
    if (number_failed === 10) {
      timeSetTwoHour.setTime(dateTime.getTime() + 2 * 60 * 60 * 1000);
      if (timeSetTwoHour.getTime() > currentTime.getTime()) {
        setOnModal(true);
        dispatch(authActions.reqDataLogOut({ accountId, token }));
      } else {
        setOnModal(false);
        dispatch(userActions.reqGetDataChangePassword({ account, username, password, passwordNew, passwordCheckNew ,token, refreshToken}));
      }
    } else {
      setOnModal(false);
      dispatch(userActions.reqGetDataChangePassword({ account, username, password, passwordNew, passwordCheckNew ,token, refreshToken}));
    }
  }

  return (
    <>
      {isShow && (
        <>
          {modalPortalChangePasswordFail}
          {modalPortalChangePasswordManyIncorrect}
          {modalPortalSuccess}
          <div className="overlay-modal">
            <div id="root-modal"></div>
            <div className="wrapper-modal">
              <div className="content-modal1">
                <div className='content-title-modal1'>
                  <span className='span-title-value1'>{title}</span>
                </div>

                <div className="div-hr">
                  <hr className='custom-hr' />
                </div>

                <div className='contain-input'>
                  <div className='input-view'>
                    <span>現在のパスワード</span>
                    <input type="password" className="input-password" placeholder="パスワードを入力してください" onChange={(e) => setPassword(e.target.value)}></input>
                  </div>
                  <div className='input-view'>
                    <span>新しいのパスワード</span>
                    <input type="password" className="input-password" placeholder="パスワードを入力してください" onChange={(e) => setPasswordNew(e.target.value)}></input>
                  </div>
                  <div className='input-view'>
                    <span>新しいのパスワード(確認用)</span>
                    <input type="password" className="input-password" placeholder="パスワードを入力してください" onChange={(e) => setPasswordCheckNew(e.target.value)}></input>
                  </div>
                </div>
                <div className="combo-btn-cancel-accept">
                  <div className='div_btn'>
                    <div>
                      <button className='btn_cancel' onClick={onClose}>キャンセル</button>
                    </div>
                    <div>
                      <button className='btn_accept' onClick={handleAccept}>登録</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default ModalChangePass;
