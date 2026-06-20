import type { ICompilerDiagnostic } from "../diagnostics.js";

export type AuthoringDeclarationKind =
  | "asset"
  | "audio"
  | "component"
  | "entity"
  | "event"
  | "input"
  | "material"
  | "prefab"
  | "project"
  | "resource"
  | "scene"
  | "system"
  | "ui";

export interface IAuthoringSourcePointer {
  modulePath: string;
  span?: {
    end: number;
    start: number;
  };
}

export interface IAuthoringProvenance {
  declarationId: string;
  kind: AuthoringDeclarationKind;
  ownerScene?: string;
  source: IAuthoringSourcePointer;
}

export interface IAuthoringReference {
  kind: string;
  targetId: string;
}

export interface IAuthoringDeclarationNode {
  id: string;
  kind: AuthoringDeclarationKind;
  ownerScene?: string;
  provenance: IAuthoringProvenance;
  references: IAuthoringReference[];
}

export interface IAuthoringModuleNode {
  declarations: string[];
  path: string;
}

export interface IAuthoringGraph {
  declarations: IAuthoringDeclarationNode[];
  diagnostics: ICompilerDiagnostic[];
  entryPath: string;
  modules: IAuthoringModuleNode[];
  projectRoot: string;
  schema: "threenative.authoring-graph";
  version: "0.1.0";
}
