import React from "react";
import "src/share/system_error/SystemError";
/**
 * SystemError component
 */
class SystemError extends React.Component<any, any> {
    /**
     * Lifecycle
     * render jsx to browser
     * @return {jsx}
     */
    render() {
        return (
            <React.Fragment>
                <div className="div-sys-err">
                    <h6
                        className="content2-sys-err"
                        style={{
                            wordWrap: "break-word",
                            wordBreak: "break-all",
                            whiteSpace: "pre-line",
                        }}
                    >
                        {"System Error"}
                    </h6>
                </div>
            </React.Fragment>
        );
    }
}

export default SystemError;
