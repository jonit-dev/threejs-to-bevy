import type { SchemaVersion } from "./types.js";

export type InputBinding =
  | {
      code: string;
      device: "keyboard";
      required?: boolean;
    }
  | {
      button: number;
      device: "pointer";
      required?: boolean;
    }
  | {
      axis: "deltaX" | "deltaY" | "x" | "y";
      device: "pointer";
      required?: boolean;
    }
  | {
      axis?: "x" | "y";
      control: string;
      device: "touch";
      required?: boolean;
    }
  | {
      control: string;
      device: "gamepad";
      required?: boolean;
    };

export interface IInputActionIr {
  bindings: InputBinding[];
  id: string;
}

export interface IInputAxisIr {
  id: string;
  negative: InputBinding[];
  positive: InputBinding[];
  value?: InputBinding;
}

export interface IInputIr {
  schema: "threenative.input";
  version: SchemaVersion;
  actions: IInputActionIr[];
  axes: IInputAxisIr[];
}
