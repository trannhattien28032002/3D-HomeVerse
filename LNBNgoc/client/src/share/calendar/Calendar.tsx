import React, { useState } from "react";
import userIcon from "src/assets/images/calendar.png";
import "src/share/calendar/Calendar.scss";
import { getYMD } from "src/util/DateUtil";

interface CalendarProps {
    onDataSentCalendar: (data: string) => void;
}
/**
 * Loading component
 * @return {jsx}
 */
const Calendar: React.FC<CalendarProps> = (props) => {
    const now = new Date(Date.now());
    const timeSet = getYMD(now);
    const [selectedTime, setSelectedTime] = useState(timeSet);
    const [selectedDate, setSelectedDate] = useState(now.toString());

    const handleUpDate = () => {
        const time = new Date(selectedDate);
        time.setTime(time.getTime() + 24 * 60 * 60 * 1000);
        setSelectedTime(getYMD(time));
        setSelectedDate(time.toString());
        props.onDataSentCalendar(getYMD(time).toString());
    };

    const handleDownDay = () => {
        const time = new Date(selectedDate);
        time.setTime(time.getTime() - 24 * 60 * 60 * 1000);
        setSelectedTime(getYMD(time));
        setSelectedDate(time.toString());
        props.onDataSentCalendar(getYMD(time).toString());
    };

    const handleNow = () => {
        const time = new Date(Date.now());
        setSelectedTime(getYMD(time));
        setSelectedDate(time.toString());
        props.onDataSentCalendar(getYMD(time).toString());
    };

    const handleChange = (e: string) => {
        const time = new Date(e);
        setSelectedTime(getYMD(time));
        setSelectedDate(time.toString());
        props.onDataSentCalendar(getYMD(time).toString());
    };

    return (
        <div className="calendar-btn">
            <button className="btn-time-down" onClick={handleDownDay}>
                {" "}
                &lt;{" "}
            </button>
            <span className="time-span">{selectedTime}</span>
            <span className="datePicker-toggle">
                <img src={userIcon} className="datePicker-toggle-button" alt="" />
                <input type="date" placeholder="time" className="datePicker-input" onChange={(e) => handleChange(e.target.value)} />
            </span>
            <button className="btn-time-up" onClick={handleUpDate}>
                {" "}
                &gt;{" "}
            </button>
            <button className="btn-time-now" onClick={handleNow}>
                今日
            </button>
        </div>
    );
};

export default Calendar;
