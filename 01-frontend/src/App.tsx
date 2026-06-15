import Router from "src/app/routes/Routes";

/** Root component — mount Router duy nhất, không chứa state hay layout. */
function App() {
    return <>
        <Router></Router>
    </>;
}

export default App;
