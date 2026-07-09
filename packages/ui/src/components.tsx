import type { IUiActionProps, IUiBarProps, IUiComponentProps, IUiContainerProps, IUiImageProps, IUiMinimapProps, IUiRangeProps, IUiScrollbarProps, IUiTextInputProps, IUiTextProps } from "./jsx-runtime.js";
import { jsx } from "./jsx-runtime.js";

export const Ui = (props: IUiContainerProps) => jsx("ui", props);
export const Text = (props: IUiTextProps) => jsx("text", props);
export const Button = (props: IUiActionProps) => jsx("button", props);
export const Bar = (props: IUiBarProps) => jsx("bar", props);
export const Image = (props: IUiImageProps) => jsx("image", props);
export const Minimap = (props: IUiMinimapProps) => jsx("minimap", props);
export const Row = (props: IUiContainerProps) => jsx("row", props);
export const Column = (props: IUiContainerProps) => jsx("column", props);
export const Stack = (props: IUiContainerProps) => jsx("stack", props);
export const TouchControl = (props: IUiActionProps) => jsx("touchControl", props);
export const Slider = (props: IUiRangeProps) => jsx("slider", props);
export const Scrollbar = (props: IUiScrollbarProps) => jsx("scrollbar", props);
export const ContextMenu = (props: IUiContainerProps) => jsx("contextMenu", props);
export const TextInput = (props: IUiTextInputProps) => jsx("textInput", props);
export const Component = (props: IUiComponentProps) => jsx("component", props);
