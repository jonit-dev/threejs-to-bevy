import { addScore } from "./shared/score";

export const collect = () => ({
  score: addScore(3, 2),
  status: "collected",
});
