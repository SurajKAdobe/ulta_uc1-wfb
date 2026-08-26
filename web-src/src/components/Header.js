import React from "react";
import { View, Flex, Text, Tabs, TabList, Item } from "@adobe/react-spectrum";
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

// Header only owns the app bar (logo + feature tabs). Each feature's own page
// content owns its primary action button(s) — ponytail: keeping a single global
// Execute button here would couple Header to whichever tab happens to be active.
export default function Header({ activeTab, onTabChange }) {
  return (
    <View
      paddingX="size-400"
      paddingY="size-200"
      backgroundColor="static-white"
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
            selectedKey={activeTab}
            onSelectionChange={onTabChange}
          >
            <TabList>
              <Item key={TABS.COMPILATION}>SKU Compilation (UC 1)</Item>
              <Item key={TABS.PERSONALIZATION}>SKU Personalization (UC 4)</Item>
            </TabList>
          </Tabs>
        </Flex>

        {activeTab === TABS.COMPILATION && (
          <Flex gap="size-150" alignItems="center" wrap justifyContent="end">
            <BatchHistory />
          </Flex>
        )}
      </Flex>
    </View>
  );
}
