/* App — router, theme tweaks, mount. */
(function () {
  const { Header } = window.UI;
  const { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor } = window;

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "glacier",
    "accent": "#2c6d8f",
    "headline": "Newsreader"
  }/*EDITMODE-END*/;

  const ACCENTS = ["#2c6d8f", "#2f7d76", "#3a5f9e", "#5a6b7a"];

  function App() {
    const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
    const [route, setRoute] = React.useState(() => {
      try { return JSON.parse(localStorage.getItem("cirque.route")) || { name: "dashboard", params: {} }; }
      catch (e) { return { name: "dashboard", params: {} }; }
    });

    const go = React.useCallback((name, params = {}) => {
      const r = { name, params };
      setRoute(r);
      try { localStorage.setItem("cirque.route", JSON.stringify(r)); } catch (e) {}
      window.scrollTo(0, 0);
    }, []);

    // apply theme tweaks
    React.useEffect(() => {
      const root = document.documentElement;
      root.setAttribute("data-theme", t.theme === "slate" ? "slate" : "glacier");
      root.style.setProperty("--accent", t.accent);
      root.style.setProperty("--serif", t.headline === "Newsreader" ? '"Newsreader", Georgia, serif' : '"Hanken Grotesk", system-ui, sans-serif');
    }, [t.theme, t.accent, t.headline]);

    const project = route.params.id ? window.MWX.getProject(route.params.id) : null;
    let screen;
    if (route.name === "dashboard") screen = <window.Dashboard go={go} />;
    else if (route.name === "mountains") screen = <window.Dashboard go={go} />;
    else if (route.name === "create") screen = <window.Create go={go} />;
    else if (route.name === "detail" && project) screen = <window.Detail project={project} go={go} />;
    else if (route.name === "lab" && project) screen = <window.ModelLab project={project} go={go} />;
    else screen = <window.Dashboard go={go} />;

    return (
      <>
        <Header route={route} go={go} />
        {screen}
        <TweaksPanel>
          <TweakSection label="Theme" />
          <TweakRadio label="Mode" value={t.theme} options={["glacier", "slate"]}
            onChange={(v) => setTweak("theme", v)} />
          <TweakColor label="Accent" value={t.accent} options={ACCENTS}
            onChange={(v) => setTweak("accent", v)} />
          <TweakSection label="Typography" />
          <TweakRadio label="Headlines" value={t.headline} options={["Newsreader", "Hanken Grotesk"]}
            onChange={(v) => setTweak("headline", v)} />
        </TweaksPanel>
      </>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(<App />);
})();
