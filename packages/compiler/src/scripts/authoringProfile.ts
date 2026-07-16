import type {
  ScriptInputFacade,
  ScriptResourcesFacade,
  ScriptTransformFacade,
} from "@threenative/script-stdlib";

export interface ICompactAuthoringRule {
  diagnosticCodes: string[];
  id: string;
  instruction: string;
  source: "compiler-diagnostic";
}

export interface ICompactAuthoringProfile {
  conventionalApis: {
    discreteInput: Array<keyof ScriptInputFacade>;
    heldInput: Array<keyof ScriptInputFacade>;
    resources: Array<keyof ScriptResourcesFacade>;
    transforms: Array<keyof ScriptTransformFacade>;
  };
  rules: ICompactAuthoringRule[];
  schema: "threenative.compact-authoring-profile";
  version: 1;
}

const DISCRETE_INPUT_APIS = ["pressed", "released"] satisfies Array<keyof ScriptInputFacade>;
const HELD_INPUT_APIS = ["getButton", "getAxis", "getAxis2"] satisfies Array<keyof ScriptInputFacade>;
const RESOURCE_APIS = ["get", "patch", "set"] satisfies Array<keyof ScriptResourcesFacade>;
const TRANSFORM_APIS = ["position", "setPosition", "setPose", "setRotation"] satisfies Array<keyof ScriptTransformFacade>;

const COMPACT_RULES: readonly ICompactAuthoringRule[] = [
  {
    diagnosticCodes: [
      "TN_SCRIPT_DOM_API_UNSUPPORTED",
      "TN_SCRIPT_NETWORK_API_UNSUPPORTED",
      "TN_SCRIPT_NODE_API_UNSUPPORTED",
      "TN_SCRIPT_TIMER_API_UNSUPPORTED",
      "TN_SCRIPT_RUNTIME_IMPORT_UNSUPPORTED",
    ],
    id: "portable-host-boundary",
    instruction: "Use ScriptContext facades only; browser, DOM, Node, timer, network, Three.js, and Bevy handles are not portable.",
    source: "compiler-diagnostic",
  },
  {
    diagnosticCodes: ["TN_SCRIPT_MODULE_LOCAL_REFERENCE_UNSUPPORTED", "TN_SCRIPT_MODULE_STATE_UNSUPPORTED"],
    id: "self-contained-export",
    instruction: "Keep each referenced export self-contained: close over no module-local mutable state or helper declarations.",
    source: "compiler-diagnostic",
  },
  {
    diagnosticCodes: ["TN_SCRIPT_RESOURCE_READ_UNDECLARED", "TN_SCRIPT_RESOURCE_WRITE_UNDECLARED", "TN_SCRIPT_WRITE_UNDECLARED"],
    id: "declared-access",
    instruction: "Declare every component and literal resource read/write on the owning system or defineBehavior metadata.",
    source: "compiler-diagnostic",
  },
];

export function createCompactAuthoringProfile(): ICompactAuthoringProfile {
  return {
    conventionalApis: {
      discreteInput: [...DISCRETE_INPUT_APIS],
      heldInput: [...HELD_INPUT_APIS],
      resources: [...RESOURCE_APIS],
      transforms: [...TRANSFORM_APIS],
    },
    rules: COMPACT_RULES.map((rule) => ({ ...rule, diagnosticCodes: [...rule.diagnosticCodes] })),
    schema: "threenative.compact-authoring-profile",
    version: 1,
  };
}
