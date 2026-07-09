export type UiTextEditOperation =
  | { kind: "backspace" }
  | { kind: "insert"; text: string }
  | { kind: "move"; offset: number };

export interface IUiTextEditFrame {
  caret: number;
  operation: UiTextEditOperation["kind"] | "initial";
  value: string;
}

export interface IUiTextEditTrace {
  capability: {
    caret: "promoted";
    ime: "platform-diagnostic";
    textEditing: "promoted";
    virtualKeyboard: "platform-diagnostic";
  };
  frames: IUiTextEditFrame[];
}

export function traceWebUiTextEdit(initial: string, operations: readonly UiTextEditOperation[]): IUiTextEditTrace {
  let value = initial;
  let caret = [...value].length;
  const frames: IUiTextEditFrame[] = [{ caret, operation: "initial", value }];
  for (const operation of operations) {
    const characters = [...value];
    if (operation.kind === "insert") {
      characters.splice(caret, 0, ...operation.text);
      caret += [...operation.text].length;
    } else if (operation.kind === "backspace" && caret > 0) {
      characters.splice(caret - 1, 1);
      caret -= 1;
    } else if (operation.kind === "move") {
      caret = Math.max(0, Math.min(characters.length, caret + operation.offset));
    }
    value = characters.join("");
    frames.push({ caret, operation: operation.kind, value });
  }
  return {
    capability: { caret: "promoted", ime: "platform-diagnostic", textEditing: "promoted", virtualKeyboard: "platform-diagnostic" },
    frames,
  };
}
