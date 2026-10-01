import React, { useEffect, useState } from "react";
import {
  View,
  Flex,
  Text,
  Tabs,
  TabList,
  Item,
  ActionButton,
  Tooltip,
  TooltipTrigger,
} from "@adobe/react-spectrum";
import Light from "@spectrum-icons/workflow/Light";
import Moon from "@spectrum-icons/workflow/Moon";
import ZoomIn from "@spectrum-icons/workflow/ZoomIn";
import ZoomOut from "@spectrum-icons/workflow/ZoomOut";
import Refresh from "@spectrum-icons/workflow/Refresh";
// Inlined as a base64 data URI (not a file path or bundler import) so it renders
// correctly regardless of how the dev/prod server handles static asset requests —
// a plain <img src="./ulta_logo.png"> and a webpack file import both rendered broken
// in this project's build setup.
import { ULTA_LOGO_DATA_URI } from "../assets/ultaLogo";
import BatchHistory from "./BatchHistory/BatchHistory";

export const TABS = {
  COMPILATION: "compilation",
  PERSONALIZATION: "personalization",
  BANNER: "banner",
};

// No router library for three tabs — a hash fragment (#/uc4, #/uc2b), not a
// real path segment. A real pushState path (e.g. plain "/uc4") 404s ("Cannot
// GET /uc4") on refresh/direct-navigation unless the host server rewrites
// unknown paths back to index.html, which isn't something this app's dev/
// deploy setup does. A hash fragment is never sent to the server at all, so
// it can't 404 no matter how the app is hosted.
const TAB_HASHES = {
  [TABS.COMPILATION]: "",
  [TABS.PERSONALIZATION]: "#/uc4",
  [TABS.BANNER]: "#/uc2b",
};

export function hashForTab(tab) {
  return TAB_HASHES[tab] || "";
}

export function tabForHash(hash) {
  if (hash === "#/uc4") return TABS.PERSONALIZATION;
  if (hash === "#/uc2b") return TABS.BANNER;
  return TABS.COMPILATION;
}

function PluginZoom() {
  const [zoom, setZoom] = useState(80);

  useEffect(() => {
    const hadPluginClass = document.body.classList.contains("ulta-plugin-ui");
    const previousScale = document.documentElement.style.getPropertyValue(
      "--ulta-plugin-ui-scale",
    );
    document.body.classList.add("ulta-plugin-ui");
    document.documentElement.style.setProperty(
      "--ulta-plugin-ui-scale",
      String(zoom / 100),
    );
    return () => {
      if (!hadPluginClass) document.body.classList.remove("ulta-plugin-ui");
      if (previousScale) {
        document.documentElement.style.setProperty(
          "--ulta-plugin-ui-scale",
          previousScale,
        );
      } else {
        document.documentElement.style.removeProperty("--ulta-plugin-ui-scale");
      }
    };
  }, [zoom]);

  return (
    <Flex alignItems="center" gap="size-50" flexShrink={0}>
      <TooltipTrigger>
        <ActionButton
          isQuiet
          aria-label="Zoom out plugin interface"
          isDisabled={zoom <= 50}
          onPress={() => setZoom((value) => Math.max(50, value - 10))}
        >
          <ZoomOut size="S" />
        </ActionButton>
        <Tooltip>Zoom out plugin interface</Tooltip>
      </TooltipTrigger>
      <Text
        aria-live="polite"
        aria-label={`Plugin interface zoom ${zoom}%`}
        UNSAFE_style={{ minWidth: "5ch", textAlign: "center" }}
      >
        {zoom}%
      </Text>
      <TooltipTrigger>
        <ActionButton
          isQuiet
          aria-label="Zoom in plugin interface"
          isDisabled={zoom >= 150}
          onPress={() => setZoom((value) => Math.min(150, value + 10))}
        >
          <ZoomIn size="S" />
        </ActionButton>
        <Tooltip>Zoom in plugin interface</Tooltip>
      </TooltipTrigger>
      <TooltipTrigger>
        <ActionButton
          isQuiet
          aria-label="Reset plugin interface zoom"
          isDisabled={zoom === 100}
          onPress={() => setZoom(100)}
        >
          <Refresh size="S" />
        </ActionButton>
        <Tooltip>Reset plugin interface zoom to 100%</Tooltip>
      </TooltipTrigger>
    </Flex>
  );
}

// Header only owns the app bar (logo + feature tabs). Each feature's own page
// content owns its primary action button(s) — ponytail: keeping a single global
// Execute button here would couple Header to whichever tab happens to be active.
export default function Header({
  activeTab,
  onTabChange,
  colorScheme,
  onToggleColorScheme,
}) {
  return (
    <View
      paddingX="size-400"
      paddingY="size-200"
      backgroundColor="gray-50"
      UNSAFE_className="ulta-fade-in ulta-header"
    >
      <Flex
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap="size-150"
        wrap
      >
        <Flex
          direction="row"
          alignItems="center"
          gap="size-200"
          flex="1"
          minWidth={0}
          wrap
        >
          <Flex
            alignItems="center"
            gap="size-150"
            UNSAFE_className="ulta-brand"
          >
            <img src={ULTA_LOGO_DATA_URI} alt="Ulta Beauty" height={38} />
            <View UNSAFE_className="ulta-brand-copy">
              <Text UNSAFE_className="ulta-brand-name">Creative Studio</Text>
              <Text UNSAFE_className="ulta-brand-subtitle">
                Retail content operations
              </Text>
            </View>
          </Flex>
          <Tabs
            aria-label="Feature"
            density="compact"
            isQuiet
            selectedKey={activeTab}
            minWidth={0}
            UNSAFE_className="ulta-nav-tabs"
            onSelectionChange={onTabChange}
          >
            <TabList>
              <Item key={TABS.COMPILATION}>UC1 · SKU Compilation</Item>
              <Item key={TABS.PERSONALIZATION}>UC4 · SKU Personalization</Item>
              <Item key={TABS.BANNER}>UC2B · Banner Generation</Item>
            </TabList>
          </Tabs>
        </Flex>

        <Flex gap="size-150" alignItems="center" wrap justifyContent="end">
          {activeTab === TABS.COMPILATION && <BatchHistory />}
          {window.__FIGMA_PLUGIN__ && <PluginZoom />}
          <ActionButton
            isQuiet
            onPress={onToggleColorScheme}
            UNSAFE_className="ulta-theme-toggle"
            aria-label={
              colorScheme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
          >
            {colorScheme === "dark" ? <Light size="S" /> : <Moon size="S" />}
          </ActionButton>
        </Flex>
      </Flex>
    </View>
  );
}
