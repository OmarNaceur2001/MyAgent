import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/tokens.css";
import "./styles/app.css";
import { Companion } from "./companion/Companion";
import { bootMyAgent } from "./lib/store";
import { MainApp } from "./screens/MainApp";
import { MoodGallery } from "./screens/MoodGallery";

// One bundle, three views: ?view=main (default), ?view=companion, ?view=gallery (dev).
const view = new URLSearchParams(location.search).get("view") ?? "main";

bootMyAgent();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {view === "companion" ? <Companion /> : view === "gallery" ? <MoodGallery /> : <MainApp />}
  </React.StrictMode>,
);
