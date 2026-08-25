import React, { useState } from "react";
import Header, { TABS } from "./Header";
import SkuCompilation from "./SkuCompilation/SkuCompilation";
import SkuPersonalization from "./SkuPersonalization/SkuPersonalization";

export default function App() {
  const [activeTab, setActiveTab] = useState(TABS.COMPILATION);

  return (
    <div className="ulta-shell">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === TABS.COMPILATION && <SkuCompilation />}
      {activeTab === TABS.PERSONALIZATION && <SkuPersonalization />}
    </div>
  );
}
