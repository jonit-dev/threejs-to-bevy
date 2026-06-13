import { captureUi, type IUiElement, type IUiIr } from "@threenative/ui";

export function emitUi(root: IUiElement): IUiIr {
  return captureUi(root);
}
