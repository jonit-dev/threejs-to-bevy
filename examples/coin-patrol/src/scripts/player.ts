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
    const [first, second] = context.entities.withTag("drone");
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
  },
  (context: ProjectContext): void => {
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
    let lives = game.lives;
    if (rules.hitCooldown > 0) {
      rules.hitCooldown = Math.max(0, rules.hitCooldown - context.time.fixedDelta);
    } else {
      for (const drone of context.entities.withTag("drone")) {
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
    const status = lives <= 0 ? "lost" : game.status;
    context.resources.patch("CoinPatrol", {
      lives,
      status,
      livesLabel: status === "lost" ? "Game over" : `Lives ${lives}`,
    });
  },
);
