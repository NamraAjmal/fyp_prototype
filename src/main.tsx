import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/index.css";
import App from "./app/App";
import { ThemeProvider } from "./app/components/theme-provider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="light" storageKey="smart-city-theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
