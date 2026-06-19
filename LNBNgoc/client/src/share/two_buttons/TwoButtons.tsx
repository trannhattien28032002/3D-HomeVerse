import React, { useState } from "react";
import userIcon from "src/assets/images/check.png";
import "src/share/two_buttons/TwoButtons.scss";
type TwoButtonProps = {
    label1: string;
    label2: string;
    onClick?: () => void;
    onDataButton: (dataFromChildButton: number) => void;
};

const TwoButtons: React.FC<TwoButtonProps> = ({ label1, label2, onDataButton }) => {
    const [color1, setColor1] = useState("white");
    const [color2, setColor2] = useState("#337ab7");
    const [color1text, setColor1Text] = useState("#969696");
    const [color2text, setColor2Text] = useState("white");
    const [selectedButton, setSelectedButton] = useState(2);


    const handleButtonClick = (buttonNumber: number) => {
        setSelectedButton(buttonNumber);
        if (buttonNumber === 1) {
            if (color1 === "white") {
                setColor1("#337ab7");
                setColor1Text("white");
                setColor2("white");
                setColor2Text("#969696");
            }
            onDataButton(1);
        } else if (buttonNumber === 2) {
            if (color2 === "white") {
                setColor2("#337ab7");
                setColor2Text("white");
                setColor1("white");
                setColor1Text("#969696");
            }
            onDataButton(2);
        }
    };

    return (
        <div className="comboButton">
            <div className="combo-button1">
                <button className="custom-button1" style={{ backgroundColor: color1, color: color1text }} onClick={() => handleButtonClick(2)}>
                    {label1}
                </button>
                {selectedButton === 1 && <img className="iconButton1" src={userIcon} alt="Selected" />}
            </div>
            <div className="combo-button2">
                <button className="custom-button2" style={{ backgroundColor: color2, color: color2text }} onClick={() => handleButtonClick(1)}>
                    {label2}
                </button>
                {selectedButton === 2 && <img className="iconButton2" src={userIcon} alt="Selected"  />}
            </div>
        </div>
    );
};

export default TwoButtons;
