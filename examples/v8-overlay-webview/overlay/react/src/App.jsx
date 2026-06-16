import React, { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import "./inventory.css";

const ITEMS = [
  { id: "potion", label: "Potion", sprite: "./potion.svg" },
  { id: "key", label: "Gate Key", sprite: "./key.svg" },
  { id: "shield", label: "Ward", sprite: "./shield.svg" },
];

function sendBridgeMessage(type, payload) {
  const trace = window.inventoryOverlayTrace ?? [];
  trace.push({ payload, type });
  window.inventoryOverlayTrace = trace;
  const bridge = window.threenativeOverlayBridge;
  if (bridge && typeof bridge.send === "function") {
    bridge.send(type, payload);
  }
}

function InventoryOverlay() {
  const [selected, setSelected] = useState("potion");
  const useItem = useCallback((itemId) => {
    setSelected(itemId);
    sendBridgeMessage("inventory:use-item", { itemId });
  }, []);

  return (
    <main className="inventory" aria-label="Inventory">
      <header>
        <strong>Inventory</strong>
        <span className="gold">42g</span>
      </header>
      <div className="items" role="list">
        {ITEMS.map((item) => (
          <button
            aria-pressed={selected === item.id}
            className="item"
            data-item-id={item.id}
            key={item.id}
            onClick={() => useItem(item.id)}
            type="button"
          >
            <img alt="" src={item.sprite} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <InventoryOverlay />
  </React.StrictMode>,
);
