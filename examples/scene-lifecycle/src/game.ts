import { defineGame } from "@threenative/sdk";

import { creditsScene } from "./scenes/credits.js";
import { levelScene } from "./scenes/level.js";
import { loadingScene } from "./scenes/loading.js";
import { menuScene } from "./scenes/menu.js";
import { pauseScene } from "./scenes/pause.js";

export default defineGame({
  initialScene: "menu",
  scenes: [creditsScene, levelScene, loadingScene, menuScene, pauseScene],
});
