import React, { useEffect, useState } from "react";
import { Provider, defaultTheme } from "@adobe/react-spectrum";
import Header, { TABS, hashForTab, tabForHash } from "./Header";
import SkuCompilation from "./SkuCompilation/SkuCompilation";
import SkuPersonalization from "./SkuPersonalization/SkuPersonalization";

const COLOR_SCHEME_KEY = "ulta-color-scheme";

export default function App() {
  // Route sync (no router library — just two tabs, a hash fragment is plenty):
  // "" is UC1, "#/uc4" is UC4. See Header.js for why it's a hash and not a
  // real path segment. Initialized from whatever hash the page loaded on,
  // kept in sync on browser back/forward.
  const [activeTab, setActiveTab] = useState(() => tabForHash(window.location.hash));
  const [colorScheme, setColorScheme] = useState(() => localStorage.getItem(COLOR_SCHEME_KEY) || "light");

  useEffect(() => {
    function onHashChange () {
      setActiveTab(tabForHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // On <html>, not a wrapper div — Spectrum's Dialog/Popover/Menu etc. render
  // via a portal to document.body, a *sibling* of any div we render here, so
  // a data-theme attribute scoped to our own tree never reaches them (this was
  // the actual cause of the dark-mode hover/selected-row color bug in CSV
  // preview popups — ulta-theme.css's [data-theme="dark"] override was simply
  // never in effect for portaled content). <html> is an ancestor of
  // document.body too, so this reaches everything.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", colorScheme);
  }, [colorScheme]);

  function handleTabChange (tab) {
    setActiveTab(tab);
    const hash = hashForTab(tab);
    if (window.location.hash === hash) return;
    if (hash) {
      window.location.hash = hash;
    } else {
      // Clears the hash without a "#" left dangling in the address bar.
      window.history.pushState(null, "", window.location.pathname + window.location.search);
    }
  }

  function toggleColorScheme () {
    setColorScheme((s) => {
      const next = s === "light" ? "dark" : "light";
      localStorage.setItem(COLOR_SCHEME_KEY, next);
      return next;
    });
  }

  return (
    <Provider theme={defaultTheme} colorScheme={colorScheme}>
      <div className="ulta-shell">
        <Header
          activeTab={activeTab}
          onTabChange={handleTabChange}
          colorScheme={colorScheme}
          onToggleColorScheme={toggleColorScheme}
        />
        {activeTab === TABS.COMPILATION && <SkuCompilation />}
        {activeTab === TABS.PERSONALIZATION && <SkuPersonalization />}
      </div>
    </Provider>
  );
}
