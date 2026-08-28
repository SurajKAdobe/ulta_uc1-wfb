import React from "react";
import { View, Flex, Text, Tabs, TabList, Item, ActionButton } from "@adobe/react-spectrum";
import Light from "@spectrum-icons/workflow/Light";
import Moon from "@spectrum-icons/workflow/Moon";
// Inlined as a base64 data URI (not a file path or bundler import) so it renders
// correctly regardless of how the dev/prod server handles static asset requests —
// a plain <img src="./ulta_logo.png"> and a webpack file import both rendered broken
// in this project's build setup.
import { ULTA_LOGO_DATA_URI } from "../assets/ultaLogo";
import BatchHistory from "./BatchHistory/BatchHistory";

export const TABS = {
  COMPILATION: "compilation",
  PERSONALIZATION: "personalization",
};

// No router library for two tabs — a hash fragment (#/uc4), not a real path
// segment. A real pushState path (e.g. plain "/uc4") 404s ("Cannot GET /uc4")
// on refresh/direct-navigation unless the host server rewrites unknown paths
// back to index.html, which isn't something this app's dev/deploy setup does.
// A hash fragment is never sent to the server at all, so it can't 404 no
// matter how the app is hosted.
const TAB_HASHES = {
  [TABS.COMPILATION]: "",
  [TABS.PERSONALIZATION]: "#/uc4",
};

export function hashForTab (tab) {
  return TAB_HASHES[tab] || "";
}

export function tabForHash (hash) {
  if (hash === "#/uc4") return TABS.PERSONALIZATION;
  return TABS.COMPILATION;
}

// Header only owns the app bar (logo + feature tabs). Each feature's own page
// content owns its primary action button(s) — ponytail: keeping a single global
// Execute button here would couple Header to whichever tab happens to be active.
export default function Header({ activeTab, onTabChange, colorScheme, onToggleColorScheme }) {
  return (
    <View
      paddingX="size-400"
      paddingY="size-200"
      backgroundColor="gray-50"
      UNSAFE_style={{ borderBottom: "2px solid var(--ulta-accent)" }}
      UNSAFE_className="ulta-fade-in ulta-header"
    >
      <Flex direction="row" alignItems="center" justifyContent="space-between" wrap gap="size-150">
        <Flex direction="row" alignItems="center" gap="size-200" wrap>
          <img src={ULTA_LOGO_DATA_URI} alt="Ulta Beauty" height={28} />
          <View
            UNSAFE_style={{
              borderLeft: "1px solid var(--spectrum-global-color-gray-300)",
              height: 24,
            }}
          />
          <Tabs
            aria-label="Feature"
            density="compact"
            isQuiet
            selectedKey={activeTab}
            onSelectionChange={onTabChange}
          >
            <TabList>
              <Item key={TABS.COMPILATION}>UC1 · SKU Compilation</Item>
              <Item key={TABS.PERSONALIZATION}>UC4 · SKU Personalization</Item>
            </TabList>
          </Tabs>
        </Flex>

        <Flex gap="size-150" alignItems="center" wrap justifyContent="end">
          {activeTab === TABS.COMPILATION && <BatchHistory />}
          <ActionButton
            isQuiet
            onPress={onToggleColorScheme}
            aria-label={colorScheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {colorScheme === "dark" ? <Light size="S" /> : <Moon size="S" />}
          </ActionButton>
        </Flex>
      </Flex>
    </View>
  );
}
