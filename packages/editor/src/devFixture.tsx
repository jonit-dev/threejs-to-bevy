import { createRoot } from "react-dom/client";

import { EditorApp } from "./EditorApp.js";
import { devFixtureModel } from "./devFixtureModel.js";
import "./styles.css";

export function renderDevFixture(root: Element) {
  createRoot(root).render(<EditorApp model={devFixtureModel} />);
}

const root = typeof document === "undefined" ? null : document.getElementById("root");
if (root !== null) {
  renderDevFixture(root);
}
