import { defineBehavior } from "@threenative/script-stdlib";
import type { ProjectContext } from "../../.threenative/types/project-context";

export const movePlayerToGoal = defineBehavior(
  {
    id: "move-player-to-goal",
    schedule: "fixedUpdate",
    writes: ["Transform"],
    resourceReads: ["CoinPatrol"],
  },
  (context: ProjectContext): void => {
    const bound = 4.5;
    const game = context.resources.get("CoinPatrol", {
      coins: 0,
      lives: 3,
      status: "playing",
      coinsLabel: "Coins 0/10",
      livesLabel: "Lives 3",
    });
    if (game.status !== "playing") {
      return;
    }
    const player = context.entity("player");
    if (player === undefined) {
      return;
    }
    const transform = player.transform();
    const position = transform.position;
    const moveX = context.input.getAxis("MoveX");
    const moveZ = context.input.getAxis("MoveZ");
    const delta = context.time.fixedDelta;
    const speed = 3.2;
    const next: [number, number, number] = [
      Math.max(-bound, Math.min(bound, position[0] + moveX * delta * speed)),
      position[1],
      Math.max(-bound, Math.min(bound, position[2] + moveZ * delta * speed)),
    ];
    transform.setPosition(next);
  },
);

export const dronePatrol = defineBehavior(
  {
    id: "drone-patrol",
    schedule: "fixedUpdate",
    writes: ["Transform"],
  },
  (context: ProjectContext): void => {
    const patrol = context.state("drone-patrol", { direction: 1 });
    const delta = context.time.fixedDelta;
    const speed = 2.0;
    const drones = context.entities.byId({ first: "drone.01", second: "drone.02" });
    const first = drones.first;
    const second = drones.second;
    if (first !== undefined) {
      const transform = first.transform();
      const position = transform.position;
      let x = position[0] + patrol.direction * speed * delta;
      if (x > 3.5 || x < -3.5) {
        patrol.direction = -patrol.direction;
        x = Math.max(-3.5, Math.min(3.5, x));
      }
      transform.setPosition([x, position[1], position[2]]);
    }
    if (second !== undefined) {
      const transform = second.transform();
      const position = transform.position;
      const z = 2 * Math.sin(context.time.elapsed * 1.2);
      transform.setPosition([position[0], position[1], z]);
    }
  },
);

export const coinPatrolRules = defineBehavior(
  {
    id: "coin-patrol-rules",
    schedule: "fixedUpdate",
    writes: ["Transform"],
    resourceReads: ["CoinPatrol"],
    resourceWrites: ["CoinPatrol"],
    services: ["physics.sensor"],
  },
  (context: ProjectContext): void => {
    const coinIds = [
      "coin.01",
      "coin.02",
      "coin.03",
      "coin.04",
      "coin.05",
      "coin.06",
      "coin.07",
      "coin.08",
      "coin.09",
      "coin.010",
    ];
    const droneIds = ["drone.01", "drone.02"];
    const winCoins = 10;
    const game = context.resources.get("CoinPatrol", {
      coins: 0,
      lives: 3,
      status: "playing",
      coinsLabel: "Coins 0/10",
      livesLabel: "Lives 3",
    });
    if (game.status !== "playing") {
      return;
    }
    const rules = context.state("coin-patrol-rules", { hitCooldown: 0 });
    const player = context.entity("player");
    if (player === undefined) {
      return;
    }
    const playerPosition = player.transform().position;
    const physics = (context as unknown as {
      physics?: {
        sensor(options: { phases: Array<"enter" | "stay">; sensor: string }): { events: Array<{ occupants: string[]; phase: "enter" | "stay" }> };
      };
    }).physics;
    let coins = game.coins;
    for (const coinId of coinIds) {
      const coin = context.entity(coinId);
      if (coin === undefined) {
        continue;
      }
      const coinTransform = coin.transform();
      const coinPosition = coinTransform.position;
      if (coinPosition[1] < -10) {
        continue;
      }
      const dx = playerPosition[0] - coinPosition[0];
      const dz = playerPosition[2] - coinPosition[2];
      const contact = physics?.sensor({ phases: ["enter", "stay"], sensor: coinId }).events.some((event) => event.occupants.includes("player")) === true;
      if (contact || dx * dx + dz * dz < 0.6 * 0.6) {
        coinTransform.setPosition([coinPosition[0], -100, coinPosition[2]]);
        coins += 1;
      }
    }
    let lives = game.lives;
    if (rules.hitCooldown > 0) {
      rules.hitCooldown = Math.max(0, rules.hitCooldown - context.time.fixedDelta);
    } else {
      for (const droneId of droneIds) {
        const drone = context.entity(droneId);
        if (drone === undefined) {
          continue;
        }
        const dronePosition = drone.transform().position;
        const dx = playerPosition[0] - dronePosition[0];
        const dz = playerPosition[2] - dronePosition[2];
        if (dx * dx + dz * dz < 0.7 * 0.7) {
          lives -= 1;
          rules.hitCooldown = 1.5;
          player.transform().setPosition([0, playerPosition[1], 3.5]);
          break;
        }
      }
    }
    let status = game.status;
    if (coins >= winCoins) {
      status = "won";
    } else if (lives <= 0) {
      status = "lost";
    }
    context.resources.patch("CoinPatrol", {
      coins,
      lives,
      status,
      coinsLabel: `Coins ${coins}/${winCoins}`,
      livesLabel: status === "won" ? "You win!" : status === "lost" ? "Game over" : `Lives ${lives}`,
    });
  },
);
