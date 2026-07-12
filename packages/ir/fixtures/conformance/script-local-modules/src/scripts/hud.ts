import { addScore } from "./shared/score";

export const updateHud = () => ({
  label: `Score ${addScore(1, 4)}`,
});
