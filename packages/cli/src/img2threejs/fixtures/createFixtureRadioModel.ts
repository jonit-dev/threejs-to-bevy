import * as THREE from "three";

export function createFixtureRadioModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = "prop.radio";

  const browserGlobal = globalThis as typeof globalThis & {
    document: { createElement(tag: "canvas"): { getContext(kind: "2d"): { fillRect(x: number, y: number, width: number, height: number): void; fillStyle: string } | null; height: number; width: number } };
  };
  const canvas = browserGlobal.document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Fixture canvas context is unavailable.");
  context.fillStyle = "#315b70";
  context.fillRect(0, 0, 8, 8);
  context.fillStyle = "#416f84";
  context.fillRect(0, 0, 4, 4);
  context.fillRect(4, 4, 4, 4);
  const paintMap = new THREE.CanvasTexture(canvas);
  paintMap.colorSpace = THREE.SRGBColorSpace;
  paintMap.name = "paint.albedo";
  const paint = new THREE.MeshStandardMaterial({ color: 0xffffff, map: paintMap, metalness: 0.18, name: "paint", roughness: 0.62 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.82, 0.38), paint);
  body.name = "body";
  root.add(body);

  const speaker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.04, 24),
    new THREE.MeshStandardMaterial({ color: 0x18232a, name: "speaker", roughness: 0.8 }),
  );
  speaker.name = "speaker.grille";
  speaker.rotation.x = Math.PI / 2;
  speaker.position.set(-0.35, 0, 0.21);
  root.add(speaker);

  const socket = new THREE.Group();
  socket.name = "socket.antenna";
  socket.position.set(0.5, 0.47, 0);
  root.add(socket);

  root.userData.sculptRuntime = {
    colliders: [{ id: "body", kind: "box", node: body, size: [1.4, 0.82, 0.38] }],
    destructionGroups: { shell: [body] },
    sourceId: "prop.radio",
    sockets: { antenna: socket },
  };
  return root;
}

export const createPropRadioModel = createFixtureRadioModel;
