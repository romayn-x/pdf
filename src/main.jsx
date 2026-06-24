import React from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import "antd/dist/reset.css";
import App from "./App.jsx";
import { initCloudBase } from "./lib/cloudbase.js";
import "./styles.css";

initCloudBase();

createRoot(document.getElementById("root")).render(
  <ConfigProvider
    theme={{
      token: {
        colorPrimary: "#316dca",
        borderRadius: 8,
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
      },
    }}
  >
    <App />
  </ConfigProvider>,
);
