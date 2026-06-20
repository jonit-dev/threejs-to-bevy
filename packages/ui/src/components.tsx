import type { IUiNodeProps } from "./jsx-runtime.js";
import { jsx } from "./jsx-runtime.js";

export const Ui = (props: IUiNodeProps) => jsx("ui", props);
export const Text = (props: IUiNodeProps) => jsx("text", props);
export const Button = (props: IUiNodeProps) => jsx("button", props);
export const Bar = (props: IUiNodeProps) => jsx("bar", props);
export const Image = (props: IUiNodeProps) => jsx("image", props);
export const Minimap = (props: IUiNodeProps) => jsx("minimap", props);
export const Row = (props: IUiNodeProps) => jsx("row", props);
export const Column = (props: IUiNodeProps) => jsx("column", props);
export const Stack = (props: IUiNodeProps) => jsx("stack", props);
export const TouchControl = (props: IUiNodeProps) => jsx("touchControl", props);
export const Slider = (props: IUiNodeProps) => jsx("slider", props);
export const Scrollbar = (props: IUiNodeProps) => jsx("scrollbar", props);
export const ContextMenu = (props: IUiNodeProps) => jsx("contextMenu", props);
