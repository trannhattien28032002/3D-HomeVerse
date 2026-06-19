import { FC, useEffect, useRef, useState } from "react";
import ChartLib from "chart.js/auto";
import "src/share/chart/Chart.scss";
import { getHM } from "src/util/DateUtil";
import { setLabel } from "./ValueChart";

type ChartProps = {
    dataTable: DataTable;
    dataType: number;
    dataSetting: DataSetting;
};

interface DataItem {
    datetime: string;
    value_actual: number;
    value_rain: number;
    value_temp: number;
}

interface DataSettingItem {
    left_max_y: number;
    left_min_y: number;
    right_max_y: number;
    right_min_y: number;
}

interface DataSetting {
    chartSettingGsm: DataSettingItem[];
    chartSettingMsm: DataSettingItem[];
}

interface DataTable {
    timeSelectChart: string;
    dataMainMsm: DataItem[];
    dataMainGsm: DataItem[];
}

const ChartComponent: FC<ChartProps> = ({ dataTable, dataType, dataSetting }) => {
    const refChart = useRef<ChartLib | null>(null);
    const canvasCallback = useRef<HTMLCanvasElement | null>(null);
    const dataMainMsm = dataTable.dataMainMsm;
    const dataMainGsm = dataTable.dataMainGsm;
    const chartSettingGsm = dataSetting.chartSettingGsm;
    const chartSettingMsm = dataSetting.chartSettingMsm;
    const [valueRain, setValueRain] = useState<(number | null)[]>([]);
    const [valueActual, setValueActual] = useState<(number | null)[]>([]);
    const [valueTemp, setValueTemp] = useState<(number | null)[]>([]);
    const [valueTime, setValueTime] = useState<(string | null)[]>([]);
    // const [settingTime, setSettingTime] = useState<number>(23);
    const [valueLeftMax, setValueLeftMax] = useState<number | undefined>(undefined);
    const [valueLeftMin, setValueLeftMin] = useState<number | undefined>(undefined);
    const [valueRightMax, setValueRightMax] = useState<number | undefined>(undefined);
    const [valueRightMin, setValueRightMin] = useState<number | undefined>(undefined);

    useEffect(() => {
        if (dataType === 2) {
            if (dataMainMsm.length === 0 || dataMainMsm.length === 24) {
                setValueTime(setLabel.map((item) => item.datetime));
                setValueRain(setLabel.map((item) => item.value_rain));
                setValueActual(setLabel.map((item) => item.value_actual));
                setValueTemp(setLabel.map((item) => item.value_temp));
                setValueLeftMax(10);
                setValueLeftMin(chartSettingMsm[0].left_min_y);
                setValueRightMax(10);
                setValueRightMin(-10);
            } else {
                setValueRain(dataMainMsm.map((item) => item.value_rain));
                setValueActual(dataMainMsm.map((item) => item.value_actual));
                setValueTemp(dataMainMsm.map((item) => item.value_temp));
                setValueTime(dataMainMsm.map((item) => getHM(item.datetime)));
                setValueLeftMax(chartSettingMsm[0].left_max_y);
                setValueLeftMin(chartSettingMsm[0].left_min_y);
                setValueRightMax(chartSettingMsm[0].right_max_y);
                setValueRightMin(chartSettingMsm[0].right_min_y - 1);
            }
        } else {
            if (dataType === 1) {
                if (dataMainGsm.length === 0 || dataMainGsm.length === 24) {
                    setValueTime(setLabel.map((item) => item.datetime));
                    setValueRain(setLabel.map((item) => item.value_rain));
                    setValueActual(setLabel.map((item) => item.value_actual));
                    setValueTemp(setLabel.map((item) => item.value_temp));
                    setValueLeftMax(10);
                    setValueLeftMin(chartSettingMsm[0].left_min_y);
                    setValueRightMax(10);
                    setValueRightMin(-10);
                } else {
                    setValueRain(dataMainGsm.map((item) => item.value_rain));
                    setValueActual(dataMainGsm.map((item) => item.value_actual));
                    setValueTemp(dataMainGsm.map((item) => item.value_temp));
                    setValueTime(dataMainGsm.map((item) => getHM(item.datetime)));
                    setValueLeftMax(chartSettingGsm[0].left_max_y);
                    setValueLeftMin(chartSettingGsm[0].left_min_y);
                    setValueRightMax(chartSettingGsm[0].right_max_y);
                    setValueRightMin(chartSettingGsm[0].right_min_y - 1);
                }
            }
        }
    }, [dataMainMsm, dataMainGsm, dataType, chartSettingGsm, chartSettingMsm]);

    useEffect(() => {
        const plugins = {
            id: "customCanvasBackgroundColor",
            beforeDraw: (chart: any, args: any, options: { color: string }) => {
                const { ctx } = chart;
                ctx.save();
                ctx.globalCompositeOperation = "destination-over";
                ctx.fillStyle = options.color || "#ffffff";
                ctx.fillRect(chart.chartArea.left, chart.chartArea.top, chart.chartArea.width, chart.chartArea.height);
                ctx.restore();
            },
        };
       

        if (refChart.current) {
            refChart.current.destroy();
            refChart.current = null;
        }
        if (canvasCallback.current === null) {
            return;
        } else {
            const ctx = canvasCallback.current?.getContext("2d");
            if (!ctx) {
                return;
            } else {
                refChart.current = new ChartLib(ctx, {
                    type: "bar",
                    data: {
                        datasets: [],
                        labels: valueTime,
                    },
                    options: {
                        layout: {
                            padding: {
                                left: 0,
                            },
                        },
                        responsive: true,
                        plugins: {
                            legend: {
                                position: "bottom",
                                align: "center",
                                labels: {
                                    usePointStyle: true,
                                    font: {
                                        size: 18,
                                    },
                                    textAlign: "left",
                                    padding: 30,
                                },
                            },
                        },
                        elements: {
                            point: {
                                radius: 0,
                            },
                        },
                        scales: {
                            x: {
                                offset: true,
                                beginAtZero: true,
                                display: true,
                                position: "bottom",
                                border: {
                                    width: 3,
                                },
                                grid: {
                                    drawOnChartArea: true,
                                    display: true,
                                    drawTicks: false,
                                    color: "#969696",
                                },
                                ticks: {
                                    minRotation: 0,
                                    maxRotation: 0,
                                    autoSkip: false,
                                    callback: function (value: any, ticks: any) {
                                        const labelValues: any = this.getLabelForValue(value);
                                        const hourArr = labelValues.split(":")[0];
                                        if (+hourArr % 3 === 0) {
                                            return labelValues;
                                        } else {
                                            return "";
                                        }
                                    },
                                    maxTicksLimit: 23,
                                    align: "end",
                                },
                            },
                            y: {
                                beginAtZero: false,
                                suggestedMin: valueLeftMin,
                                suggestedMax: valueLeftMax,
                                grid: {
                                    drawOnChartArea: true,
                                    display: true,
                                    drawTicks: false,
                                    color: "#969696",
                                },
                                type: "linear",
                                display: true,
                                position: "left",
                                min: valueLeftMin,
                                max: valueLeftMax,
                                ticks: {
                                    backdropColor: "rgb(255, 99, 132)",
                                    autoSkip: false,
                                    callback: function (value) {
                                        return formatNumber(value);
                                    },
                                },
                            },
                            y1: {
                                beginAtZero: false,
                                display: true,
                                type: "linear",
                                position: "right",
                                min: valueRightMin,
                                max: valueRightMax,
                                ticks: {
                                    backdropColor: "rgb(255, 99, 132)",
                                    autoSkip: false,
                                    callback: function (value) {
                                        return formatNumberTemp(value);
                                    },
                                },
                                grid: {
                                    drawOnChartArea: false,
                                    display: true,
                                    drawTicks: false,
                                },
                            },
                        },
                    },
                    plugins: [plugins],
                });
                refChart.current.data.datasets.push(
                    {
                        label: "降雨量 (予測)",
                        data: valueActual,
                        borderColor: "#5b9bd5",
                        backgroundColor: "#5b9bd5",
                        order: 1,
                        barPercentage: 1,
                        categoryPercentage: 1,
                        parsing: {
                            yAxisKey: "1",
                        },
                        yAxisID: "y",
                        pointStyle: "rect",
                    },
                    {
                        label: "降雨量 (実績)",
                        data: valueRain,
                        borderColor: "#c5e0b4",
                        backgroundColor: "#c5e0b4",
                        order: 2,
                        barPercentage: 1,
                        categoryPercentage: 1,
                        parsing: {
                            yAxisKey: "1",
                        },
                        yAxisID: "y",
                        pointStyle: "rect",
                    },

                    {
                        label: "気温 (予測)",
                        data: valueTemp,
                        borderColor: "#ffc000",
                        backgroundColor: "#ffc000",
                        type: "line",
                        order: 3,
                        pointStyle: "line",
                    },
                    {
                        label: "                       ",
                        data: [0],
                        borderColor: "transparent",
                        backgroundColor: "transparent",
                        order: 4,
                        barPercentage: 1,
                        categoryPercentage: 1,
                        parsing: {
                            yAxisKey: "1",
                        },
                        yAxisID: "y",
                    },

                    {
                        label: "                       ",
                        data: [0],
                        borderColor: "transparent",
                        backgroundColor: "transparent",
                        order: 5,
                        barPercentage: 1,
                        categoryPercentage: 1,
                        parsing: {
                            yAxisKey: "1",
                        },
                        yAxisID: "y",
                    }
                );

                refChart.current.update();
            }
        }
    }, [valueRain, valueActual, valueTemp, valueTime, valueLeftMin, valueRightMin, valueRightMax, valueLeftMax]);

    const formatNumber = (number: number | string) => {
        if (typeof number !== "number") {
            return "X.XX";
        }
        const absoluteNumber = Math.abs(number);
        const formattedDecimal = absoluteNumber.toFixed(2).toString().padStart(5, "0");
        return formattedDecimal;
    };

    const formatNumberTemp = (number: number | string) => {
        if (typeof number !== "number") {
            return "XX.X";
        }
        const isNegative = number < 0;
        const absoluteNumber = Math.abs(number);
        const formattedDecimal = absoluteNumber.toFixed(1).toString().padStart(3, "0");

        return isNegative ? `-${formattedDecimal}` : formattedDecimal;
    };

    return (
        <div className="self-center w-1/2">
            <div className="overflow-hidden">
                <canvas className="MyChart" ref={canvasCallback}></canvas>
            </div>
        </div>
    );
};

export default ChartComponent;
