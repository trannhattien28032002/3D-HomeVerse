import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import App from "src/App";
// import reportWebVitals from "src/reportWebVitals";
import reportWebVitals from "src/reportWebVitals";
import SystemError from "src/share/system_error/SystemError";
import BaseErrorBoundary from "src/share/error/BaseErrorBoundary";
import { store } from "src/app/store";

const container = document.getElementById("root")!;
const root = createRoot(container);

try {
    root.render(
        <React.StrictMode>
            <BaseErrorBoundary>
                <Provider store={store}>
                    <React.Suspense>
                        <App />
                    </React.Suspense>
                </Provider>
            </BaseErrorBoundary>
        </React.StrictMode>
    );
} catch (error) {
    root.render(
        <React.StrictMode>
            <SystemError />
        </React.StrictMode>
    );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
