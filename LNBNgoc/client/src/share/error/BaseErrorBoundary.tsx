import React, { ErrorInfo } from "react";
/**
 * BaseErrorBoundary component
 */
class BaseErrorBoundary extends React.Component<any, any> {
    /**
     * Constructor
     * @param {object} props
     * @return {void}
     */
    constructor(props: any) {
        super(props);
        this.state = {
            error: null,
        };
    }

    /**
     * Get derived state from error
     * @param {object} error
     * @return {object} Data
     */
    static getDerivedStateFromError(error: Error): { error: Error } {
        return { error: error };
    }

    /**
     * Lifecycle
     * render when component error
     * @param {object} error
     * @param {object} errorInfo
     * @return {void}
     */
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.log(error);
        console.log(errorInfo);
    }

    /**
     * Lifecycle
     * Render jsx to browser
     * @return {jsx}
     */
    render(): React.ReactNode {
        const { children } = this.props;
        const { error } = this.state;
        if (!error) return children;
        return (
            <div>
            </div>
        );
    }
}

export default BaseErrorBoundary;
