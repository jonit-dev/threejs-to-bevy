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

export type AuthoringOwnershipClassification =
  | "source-persistable"
  | "generator-owned"
  | "full-reload-required"
  | "runtime-only"
  | "rejected/not-source";

export type AuthoringEmittedArtifactKind =
  | "assets"
  | "component"
  | "entity"
  | "generated-script"
  | "input"
  | "material"
  | "mesh-renderer-material-ref"
  | "scene"
  | "system"
  | "ui"
  | "unknown";

export interface IAuthoringStructuredSourcePointer {
  category?: string;
  exportName?: string;
  kind: string;
  modulePath?: string;
  path: string;
  pointer: string;
}

export interface IAuthoringEmittedPointer {
  artifactKind: AuthoringEmittedArtifactKind;
  id?: string;
  path: string;
  pointer?: string;
}

export interface IAuthoringOwnershipEntry {
  emitted: IAuthoringEmittedPointer;
  ownership: AuthoringOwnershipClassification;
  source?: IAuthoringStructuredSourcePointer;
}
