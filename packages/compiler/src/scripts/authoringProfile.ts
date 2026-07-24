import type {
  ScriptCommandsFacade,
  ScriptComponentsFacade,
  ScriptEntity,
  ScriptInputFacade,
  ScriptResourcesFacade,
  ScriptTransformFacade,
} from "@threenative/script-stdlib";
import { SCRIPT_HOST_SERVICE_MATRIX, type IrSystemService } from "@threenative/ir";

export interface ICompactAuthoringRule {
  diagnosticCodes: string[];
  id: string;
  instruction: string;
  source: "compiler-diagnostic";
}

export interface ICompactAuthoringProfile {
  capabilities: {
    components: {
      commands: Array<keyof ScriptCommandsFacade>;
      entity: Array<keyof ScriptEntity>;
      reflection: Array<keyof ScriptComponentsFacade>;
    };
    runtimeEntities: Array<keyof ScriptCommandsFacade>;
    services: IrSystemService[];
  };
  conventionalApis: {
    discreteInput: Array<keyof ScriptInputFacade>;
    heldInput: Array<keyof ScriptInputFacade>;
    resources: Array<keyof ScriptResourcesFacade>;
    transforms: Array<keyof ScriptTransformFacade>;
  };
  explicitAbsences: Array<{
    diagnosticCodes: string[];
    id: string;
    instruction: string;
  }>;
  rules: ICompactAuthoringRule[];
  schema: "threenative.compact-authoring-profile";
  sourceEditing: {
    directDurableSource: "supported-when-no-bounded-operation";
    preferred: "bounded-cli";
    requiredFollowup: "authoring-validation";
  };
  version: 1;
}

const DISCRETE_INPUT_APIS = ["pressed", "released"] satisfies Array<keyof ScriptInputFacade>;
const HELD_INPUT_APIS = ["getButton", "getAxis", "getAxis2"] satisfies Array<keyof ScriptInputFacade>;
const RESOURCE_APIS = ["get", "patch", "set"] satisfies Array<keyof ScriptResourcesFacade>;
const TRANSFORM_APIS = ["position", "setPosition", "setPose", "setRotation"] satisfies Array<keyof ScriptTransformFacade>;
const COMPONENT_ENTITY_APIS = ["get", "has", "patch", "set"] satisfies Array<keyof ScriptEntity>;
const COMPONENT_REFLECTION_APIS = ["hooks", "type", "types"] satisfies Array<keyof ScriptComponentsFacade>;
const COMPONENT_COMMAND_APIS = ["addComponent", "removeComponent", "setComponent"] satisfies Array<keyof ScriptCommandsFacade>;
const RUNTIME_ENTITY_COMMANDS = ["spawn", "instantiate", "despawn"] satisfies Array<keyof ScriptCommandsFacade>;

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
    capabilities: {
      components: {
        commands: [...COMPONENT_COMMAND_APIS],
        entity: [...COMPONENT_ENTITY_APIS],
        reflection: [...COMPONENT_REFLECTION_APIS],
      },
      runtimeEntities: [...RUNTIME_ENTITY_COMMANDS],
      services: SCRIPT_HOST_SERVICE_MATRIX.map(({ service }) => service),
    },
    conventionalApis: {
      discreteInput: [...DISCRETE_INPUT_APIS],
      heldInput: [...HELD_INPUT_APIS],
      resources: [...RESOURCE_APIS],
      transforms: [...TRANSFORM_APIS],
    },
    explicitAbsences: [
      {
        diagnosticCodes: ["TN_SCRIPT_RUNTIME_IMPORT_UNSUPPORTED"],
        id: "renderer-native-and-model-sub-node-handles",
        instruction: "Use stable entity, asset, clip, material, and component IDs; raw renderer/native handles and imported model sub-node handles are not exposed.",
      },
      {
        diagnosticCodes: [
          "TN_SCRIPT_DOM_API_UNSUPPORTED",
          "TN_SCRIPT_NETWORK_API_UNSUPPORTED",
          "TN_SCRIPT_NODE_API_UNSUPPORTED",
          "TN_SCRIPT_TIMER_API_UNSUPPORTED",
        ],
        id: "platform-io",
        instruction: "DOM, network, Node, filesystem, worker, and ambient timer APIs remain outside portable gameplay scripts.",
      },
    ],
    rules: COMPACT_RULES.map((rule) => ({ ...rule, diagnosticCodes: [...rule.diagnosticCodes] })),
    schema: "threenative.compact-authoring-profile",
    sourceEditing: {
      directDurableSource: "supported-when-no-bounded-operation",
      preferred: "bounded-cli",
      requiredFollowup: "authoring-validation",
    },
    version: 1,
  };
}
