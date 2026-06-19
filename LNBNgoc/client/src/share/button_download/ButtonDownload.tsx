import React, { useState, useEffect } from "react";
import "src/share/button_download/ButtonDownload.scss";
import { getHM, getNextDay } from "src/util/DateUtil";
type ButtonProps = {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    dataTable: DataTable;
    dataType: number;
};

interface DataItem {
    datetime: string;
    value_actual: number;
    value_rain: number;
    value_temp: number;
}

interface DataTable {
    timeSelectChart: string;
    dataMainMsm: DataItem[];
    dataMainGsm: DataItem[];
}

const Button: React.FC<ButtonProps> = ({ label, dataTable, dataType }) => {
    const [isTitle, setTitle] = useState<string>(``);
    const [dataDown, setDataDown] = useState<string>(``);
    const [dataDownNext, setDataDownNext] = useState<string>(``);
    const [isDown, setDown] = useState(false);
    const dataMainMsm = dataTable.dataMainMsm;
    const dataMainGsm = dataTable.dataMainGsm;
    const timeSelectChart = dataTable.timeSelectChart;

    const formatNumber = (number: number) => {
        if (typeof number !== "number" || number === null) {
            return "XXX";
        }
        const absoluteNumber = Math.floor(number);
        const formattedDecimal =absoluteNumber.toString().padStart(3, "0");
        return `${formattedDecimal}`;
    };

    const formatNumberTemp = (number: number) => {
        if (typeof number !== "number"|| number === null) {
            return "XX.X";
        }
        const isNegative = number < 0;
        const absoluteNumber = Math.abs(number);
        const formattedDecimal = absoluteNumber.toFixed(1).toString().padStart(4, "0");
        return isNegative ? `-${formattedDecimal}` : formattedDecimal;
    };

    const csvData = `${isTitle}\n時間, 降雨量(予測), 降雨量(実績), 気温(予測)\n${timeSelectChart}, mm, mm, °C\n${dataDown}\n時間, 降雨量(予測), 降雨量(実績), 気温(予測)\n${getNextDay(timeSelectChart)}, mm, mm, °C\n${dataDownNext}`;

    useEffect(() => {
        if (dataType === 2) {
            setTitle(`MSM`);
            setDataDown(
                dataMainMsm
                    .slice(0, 24)
                    .map((item) => `${getHM(item.datetime)}, ${formatNumber(item.value_actual)}, ${formatNumber(Math.floor(item.value_rain))}, ${formatNumberTemp(item.value_temp)}`)
                    .join("\n")
            );
            setDataDownNext(
                dataMainMsm
                    .slice(24, 48)
                    .map((item) => `${getHM(item.datetime)}, ${formatNumber(item.value_actual)}, ${formatNumber(Math.floor(item.value_rain))}, ${formatNumberTemp(item.value_temp)}`)
                    .join("\n")
            );
        } else {
            if (dataType === 1) {
                setTitle(`GSM`);
                setDataDown(
                    dataMainGsm
                        .slice(0, 24)
                        .map((item) => `${getHM(item.datetime)}, ${formatNumber(item.value_actual)},  ${formatNumber(Math.floor(item.value_rain))}, ${formatNumberTemp(item.value_temp)}`)
                        .join("\n")
                );
                setDataDownNext(
                    dataMainGsm
                        .slice(24, 48)
                        .map((item) => `${getHM(item.datetime)}, ${formatNumber(item.value_actual)}, ${formatNumber(Math.floor(item.value_rain))}, ${formatNumberTemp(item.value_temp)}`)
                        .join("\n")
                );
            }
        }
        setDown(false);
    }, [dataMainMsm, dataMainGsm, dataType]);

    const handleDownloadCSV = () => {
        console.log(isDown);
        setDown(true);
        const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "" + isTitle + "データ.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <button className={"btn-download"} onClick={handleDownloadCSV} disabled={isDown}>
            {label}
        </button>
    );
};

export default Button;
