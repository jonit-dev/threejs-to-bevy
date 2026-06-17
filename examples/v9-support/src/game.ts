import { BoxGeometry, Mesh, MeshStandardMaterial, Scene, defineGame } from "@threenative/sdk";

const scene = new Scene({ id: "v9-support" });

for (let index = 0; index < 16; index += 1) {
  scene.add(
    new Mesh({
      geometry: new BoxGeometry({ size: [1, 1, 1] }),
      id: `cube.${index}`,
      material: new MeshStandardMaterial({ color: index % 2 === 0 ? "#66aaff" : "#ffaa66" }),
      position: [index % 4, 0, Math.floor(index / 4)],
    }),
  );
}

export default defineGame({ scene });
