import React from "react";
import "src/share/loading/Loading.scss";

interface LoadingProps {
    isShow: boolean;
    isLoadingBlock: boolean;
}
/**
 * Loading component
 * @return {jsx}
 */
const Loading: React.FC<LoadingProps> = ({ isShow, isLoadingBlock }) => {
    return (
        <div
            style={{
                backgroundColor: !isLoadingBlock ? "#ffffff" : "none",
                ...(isShow
                    ? { opacity: 1, transition: "opacity 0.2s ease-in" }
                    : {
                          opacity: 0,
                          transition: "opacity 0.2s ease-out",
                          zIndex: -1,
                          display: "none",
                      }),
            }}
        ></div>
    );
};

export default Loading;
