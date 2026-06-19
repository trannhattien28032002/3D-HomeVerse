import React, { useState, useEffect } from "react";
import "src/share/table/Table.scss";
import { getYMDString, getNextDay} from "src/util/DateUtil";

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

interface DataTableProps {
    dataTable: DataTable;
    dataType: number;
}

const Table: React.FC<DataTableProps> = ({ dataTable, dataType }) => {
    const dataMainMsm = dataTable.dataMainMsm;
    const dataMainGsm = dataTable.dataMainGsm;

    const renderHeader = (timeSelect: string, isTopHeader: boolean) => {
        if (isTopHeader) {
            return (
                <>
                    <tr>
                        <th colSpan={2} rowSpan={2}></th>
                        <th colSpan={12}>{timeSelect}</th>
                    </tr>
                    <tr>
                        {/* {timeHeadersTop} */}
                        <th>0:00</th>
                        <th>1:00</th>
                        <th>2:00</th>
                        <th>3:00</th>
                        <th>4:00</th>
                        <th>5:00</th>
                        <th>6:00</th>
                        <th>7:00</th>
                        <th>8:00</th>
                        <th>9:00</th>
                        <th>10:00</th>
                        <th>11:00</th>
                    </tr>
                </>
            );
        } else {
            return (
                <>
                    <tr>
                        <th colSpan={2}></th>
                        {/* {timeHeadersBottom} */}
                        <th>12:00</th>
                        <th>13:00</th>
                        <th>14:00</th>
                        <th>15:00</th>
                        <th>16:00</th>
                        <th>17:00</th>
                        <th>18:00</th>
                        <th>19:00</th>
                        <th>20:00</th>
                        <th>21:00</th>
                        <th>22:00</th>
                        <th>23:00</th>
                    </tr>
                </>
            );
        }
    };

    const renderDataRows = (data: DataItem[], timeSelect: string, isTopData: boolean) => {
        const dataLength = data.filter((item, index) => getYMDString(item.datetime.split("/")[0]) === timeSelect).length;
        if (isTopData) {
            return (
                <>
                    <tr key={1}>
                        <td rowSpan={2}>降雨量</td>
                        <td>予測</td>
                        {data
                            .filter((item, index) => getYMDString(item.datetime.split("/")[0]) === timeSelect)
                            .slice(0, 12)
                            .map((item, index) => (
                                <td key={index} className="tr-right">{item.value_actual?.toFixed(2)}</td>
                            ))}
                        {Array.from({ length: 12 - dataLength }).map((_, index) => (
                            <td key={index}></td>
                        ))}
                    </tr>
                    <tr key={2}>
                        <td>実績</td>
                        {data
                            .filter((item, index) => getYMDString(item.datetime.split("/")[0])=== timeSelect)
                            .slice(0, 12)
                            .map((item, index) => (
                                <td key={index} className="tr-right">{item.value_rain?.toFixed(2)}</td>
                            ))}
                        {Array.from({ length: 12 - dataLength }).map((_, index) => (
                            <td key={index}></td>
                        ))}
                    </tr>
                    <tr key={3}>
                        <td>気温</td>
                        <td>予測</td>
                        {data
                            .filter((item, index) => getYMDString(item.datetime.split("/")[0]) === timeSelect)
                            .slice(0, 12)
                            .map((item, index) => (
                                <td key={index} className="tr-right">{item.value_temp?.toFixed(2)}</td>
                            ))}
                        {Array.from({ length: 12 - dataLength }).map((_, index) => (
                            <td key={index}></td>
                        ))}
                    </tr>
                </>
            );
        } else {
            return (
                <>
                    <tr key={1}>
                        <td rowSpan={2}>降雨量</td>
                        <td>予測</td>
                        {data
                            .filter((item, index) => getYMDString(item.datetime.split("/")[0]) === timeSelect)
                            .slice(12, 24)
                            .map((item, index) => (
                                <td key={index} className="tr-right">{item.value_actual?.toFixed(2)}</td>
                            ))}
                        {Array.from({ length: 12 - dataLength }).map((_, index) => (
                            <td key={index}></td>
                        ))}
                    </tr>
                    <tr key={2}>
                        <td>実績</td>
                        {data
                            .filter((item, index) => getYMDString(item.datetime.split("/")[0]) === timeSelect)
                            .slice(12, 24)
                            .map((item, index) => (
                                <td key={index} className="tr-right">{item.value_rain?.toFixed(2)}</td>
                            ))}
                        {Array.from({ length: 12 - dataLength }).map((_, index) => (
                            <td key={index}></td>
                        ))}
                    </tr>
                    <tr key={3}>
                        <td>気温</td>
                        <td>予測</td>
                        {data
                            .filter((item, index) => getYMDString(item.datetime.split("/")[0]) === timeSelect)
                            .slice(12, 24)
                            .map((item, index) => (
                                <td key={index} className="tr-right">{item.value_temp?.toFixed(2)}</td>
                            ))}
                        {Array.from({ length: 12 - dataLength }).map((_, index) => (
                            <td key={index}></td>
                        ))}
                    </tr>
                </>
            );
        }
    };

    const renderTable = (dataMain: DataItem[], timeSelect: string) => {
        return (
            <table className="forecast-table">
                {renderHeader(timeSelect, true)}
                {renderDataRows(dataMain, timeSelect, true)}
                {renderHeader(timeSelect, false)}
                {renderDataRows(dataMain, timeSelect, false)}
            </table>
        );
    };


    if (dataType === 2) {
        return (
            <>
                {renderTable(dataMainMsm, getYMDString(dataTable.timeSelectChart))}
                {renderTable(dataMainMsm, getNextDay(dataTable.timeSelectChart))}
            </>
        );
    } else if (dataType === 1) {
        return (
            <>
                {renderTable(dataMainGsm, getYMDString(dataTable.timeSelectChart))}
                {renderTable(dataMainGsm, getNextDay(dataTable.timeSelectChart))}
            </>
        );
    }
    return null;
};

const ForecastTable: React.FC<DataTableProps> = ({ dataTable, dataType }) => {
    const [currentDataType, setCurrentDataType] = useState(dataType);
    const [currentDataTable, setCurrentDataTable] = useState(dataTable);

    useEffect(() => {
        setCurrentDataType(dataType);
    }, [dataType]);

    useEffect(() => {
        setCurrentDataTable(dataTable);
    }, [dataTable]);

    return (
        <div className="table-container">
            {dataTable != null && currentDataType != null ? <Table dataTable={currentDataTable} dataType={currentDataType} /> : <p>Loading data...</p>}
        </div>
    );
};

export default ForecastTable;
