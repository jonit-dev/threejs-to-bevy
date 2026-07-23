use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
};

use rapier3d::{
    glamx::{Quat as RapierQuat, Vec3 as RapierVec3},
    prelude::*,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use threenative_loader::LoadedBundle;

use crate::physics::ColliderOwner;

pub const DEFAULT_SCENE_ACTIVE_PIECE_BUDGET: usize = 1024;
const FRACTURE_SCHEMA: &str = "threenative.fracture-manifest";
const FRACTURE_VERSION: &str = "0.1.0";
const MASS_FRACTION_TOLERANCE: f32 = 0.000_001;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FractureSource {
    Imported {
        #[serde(skip_serializing_if = "Option::is_none")]
        asset: Option<String>,
        seed: u32,
        #[serde(rename = "sourceHash")]
        source_hash: String,
    },
    Primitive {
        #[serde(skip_serializing_if = "Option::is_none")]
        asset: Option<String>,
        seed: u32,
        #[serde(rename = "sourceHash")]
        source_hash: String,
    },
    Convex {
        #[serde(skip_serializing_if = "Option::is_none")]
        asset: Option<String>,
        seed: u32,
        #[serde(rename = "sourceHash")]
        source_hash: String,
    },
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "kind")]
pub enum FracturePieceCollider {
    #[serde(rename = "box")]
    Box {
        #[serde(rename = "halfExtents")]
        half_extents: [f32; 3],
    },
    #[serde(rename = "sphere")]
    Sphere { radius: f32 },
    #[serde(rename = "capsule")]
    Capsule {
        #[serde(rename = "halfHeight")]
        half_height: f32,
        radius: f32,
    },
    #[serde(rename = "convexHull")]
    ConvexHull { vertices: Vec<[f32; 3]> },
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FracturePiece {
    pub activation_depth: u32,
    pub collider: FracturePieceCollider,
    pub id: String,
    pub local_position: [f32; 3],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_rotation: Option<[f32; 4]>,
    pub mass_fraction: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_node: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FractureBond {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub energy_threshold: Option<f32>,
    pub health: f32,
    pub id: String,
    pub impulse_threshold: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub material_response: Option<f32>,
    pub pieces: [String; 2],
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum OverflowPolicy {
    RejectNew,
    SleepOldest,
    DespawnOldest,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FractureBudgets {
    pub max_active_pieces: usize,
    pub max_depth: u32,
    pub overflow_policy: OverflowPolicy,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FractureCleanup {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub despawn_after_seconds: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pool_capacity: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sleep_after_seconds: Option<f32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FractureManifest {
    pub bonds: Vec<FractureBond>,
    pub budgets: FractureBudgets,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cleanup: Option<FractureCleanup>,
    pub id: String,
    pub pieces: Vec<FracturePiece>,
    pub schema: String,
    pub source: FractureSource,
    pub version: String,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CleanupPolicy {
    Despawn,
    Pool,
    Sleep,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImpactFilter {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_impulse: Option<f32>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Destructible {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activation_budget: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bond_strength: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cleanup_policy: Option<CleanupPolicy>,
    pub fracture_manifest: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub impact_filter: Option<ImpactFilter>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_depth: Option<u32>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DestructionCauseKind {
    Contact,
    Script,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DestructionCause {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
    pub kind: DestructionCauseKind,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DestructionDamage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<f32>,
    pub assembly: String,
    pub bond: String,
    pub cause: DestructionCause,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub energy: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub impulse: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layer: Option<String>,
    pub tick: u64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PieceLifecycle {
    Active,
    Bound,
    Despawned,
    Pooled,
    Sleeping,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DestructibleAssemblyObservation {
    pub broken: bool,
    pub id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DestructibleBondObservation {
    pub assembly: String,
    pub broken: bool,
    pub health: f32,
    pub id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DestructiblePieceObservation {
    pub activation_depth: u32,
    pub assembly: String,
    pub id: String,
    pub lifecycle: PieceLifecycle,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DestructibleObservation {
    pub assemblies: Vec<DestructibleAssemblyObservation>,
    pub bonds: Vec<DestructibleBondObservation>,
    pub pieces: Vec<DestructiblePieceObservation>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DestructionAssemblyPhysicsObservation {
    pub assembly: String,
    pub intact_collision_active: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DestructionPieceBodyObservation {
    pub angular_velocity: [f32; 3],
    pub assembly: String,
    pub body_handle: Option<[u32; 2]>,
    pub lifecycle: PieceLifecycle,
    pub linear_velocity: [f32; 3],
    pub mass: f32,
    pub piece: String,
    pub position: [f32; 3],
    pub rotation: [f32; 4],
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DestructionPhysicsObservation {
    pub assemblies: Vec<DestructionAssemblyPhysicsObservation>,
    pub bonds: Vec<DestructibleBondObservation>,
    pub pieces: Vec<DestructionPieceBodyObservation>,
}

pub(crate) struct DestructionBondDebugObservation {
    pub assembly: String,
    pub bond: String,
    pub broken: bool,
    pub from: [f32; 3],
    pub health: f32,
    pub to: [f32; 3],
}

pub(crate) struct DestructionPieceDebugObservation {
    pub assembly: String,
    pub kind: &'static str,
    pub lifecycle: PieceLifecycle,
    pub piece: String,
    pub position: [f32; 3],
    pub size: Option<[f32; 3]>,
}

pub(crate) struct DestructionBudgetDebugObservation {
    pub active: usize,
    pub assembly: String,
    pub maximum: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DestructionEvent {
    Damaged {
        amount: f32,
        assembly: String,
        bond: String,
        cause: DestructionCause,
        #[serde(rename = "remainingHealth")]
        remaining_health: f32,
        tick: u64,
    },
    BondBroken {
        assembly: String,
        bond: String,
        cause: DestructionCause,
        tick: u64,
    },
    PieceActivated {
        assembly: String,
        cause: DestructionCause,
        piece: String,
        tick: u64,
    },
    PieceLifecycleChanged {
        assembly: String,
        cause: DestructionCause,
        lifecycle: PieceLifecycle,
        piece: String,
        policy: OverflowPolicy,
        tick: u64,
    },
    AssemblyBroken {
        assembly: String,
        cause: DestructionCause,
        tick: u64,
    },
    BudgetExceeded {
        assembly: String,
        cause: DestructionCause,
        piece: String,
        policy: OverflowPolicy,
        tick: u64,
    },
}

impl DestructionEvent {
    pub fn name(&self) -> &'static str {
        match self {
            Self::Damaged { .. } => "damaged",
            Self::BondBroken { .. } => "bondBroken",
            Self::PieceActivated { .. } => "pieceActivated",
            Self::PieceLifecycleChanged { .. } => "pieceLifecycleChanged",
            Self::AssemblyBroken { .. } => "assemblyBroken",
            Self::BudgetExceeded { .. } => "budgetExceeded",
        }
    }
}

#[derive(Clone, Debug, Error, PartialEq)]
#[error("{code} at {path}: {message}")]
pub struct DestructionRegistrationError {
    pub code: &'static str,
    pub message: String,
    pub path: String,
}

pub struct DestructionRuntime {
    assemblies: BTreeMap<String, AssemblyState>,
    last_processed_tick: Option<u64>,
    pending: BTreeMap<u64, Vec<DestructionDamage>>,
    scene_active_piece_budget: usize,
}

struct AssemblyState {
    assembly_broken: bool,
    bonds: BTreeMap<String, BondState>,
    cleanup: FractureCleanup,
    cleanup_policy: CleanupPolicy,
    config: Destructible,
    max_active_pieces: usize,
    max_depth: u32,
    overflow_policy: OverflowPolicy,
    pieces: BTreeMap<String, PieceState>,
}

struct BondState {
    broken: bool,
    health: f32,
    source: FractureBond,
}

struct PieceState {
    active_age: f32,
    activated_at: Option<u64>,
    lifecycle: PieceLifecycle,
    source: FracturePiece,
}

struct DamageGroup {
    assembly: String,
    bond: String,
    cause: DestructionCause,
    damage: f32,
}

impl Default for DestructionRuntime {
    fn default() -> Self {
        Self::new()
    }
}

impl DestructionRuntime {
    pub fn new() -> Self {
        Self::with_scene_budget(DEFAULT_SCENE_ACTIVE_PIECE_BUDGET)
    }

    pub fn with_scene_budget(scene_active_piece_budget: usize) -> Self {
        Self {
            assemblies: BTreeMap::new(),
            last_processed_tick: None,
            pending: BTreeMap::new(),
            scene_active_piece_budget,
        }
    }

    pub fn register(
        &mut self,
        entity: impl Into<String>,
        manifest: FractureManifest,
        config: Destructible,
    ) -> Result<(), DestructionRegistrationError> {
        validate_registration(&manifest, &config)?;
        let entity = entity.into();
        let max_active_pieces = config
            .activation_budget
            .unwrap_or(manifest.budgets.max_active_pieces)
            .min(manifest.budgets.max_active_pieces);
        let max_depth = config
            .max_depth
            .unwrap_or(manifest.budgets.max_depth)
            .min(manifest.budgets.max_depth);
        let cleanup = manifest.cleanup.unwrap_or_default();
        let cleanup_policy = config.cleanup_policy.unwrap_or_else(|| {
            if cleanup.pool_capacity.unwrap_or(0) > 0 {
                CleanupPolicy::Pool
            } else if cleanup.despawn_after_seconds.is_some() {
                CleanupPolicy::Despawn
            } else {
                CleanupPolicy::Sleep
            }
        });
        let strength = config.bond_strength.unwrap_or(1.0);
        let bonds = manifest
            .bonds
            .into_iter()
            .map(|bond| {
                (
                    bond.id.clone(),
                    BondState {
                        broken: false,
                        health: bond.health * strength,
                        source: bond,
                    },
                )
            })
            .collect();
        let pieces = manifest
            .pieces
            .into_iter()
            .map(|piece| {
                (
                    piece.id.clone(),
                    PieceState {
                        active_age: 0.0,
                        activated_at: None,
                        lifecycle: PieceLifecycle::Bound,
                        source: piece,
                    },
                )
            })
            .collect();
        self.assemblies.insert(
            entity,
            AssemblyState {
                assembly_broken: false,
                bonds,
                cleanup,
                cleanup_policy,
                config,
                max_active_pieces,
                max_depth,
                overflow_policy: manifest.budgets.overflow_policy,
                pieces,
            },
        );
        Ok(())
    }

    pub fn unregister(&mut self, entity: &str) {
        self.assemblies.remove(entity);
        for pending in self.pending.values_mut() {
            pending.retain(|damage| damage.assembly != entity);
        }
    }

    pub fn queue_damage(&mut self, damage: DestructionDamage) -> bool {
        if self
            .last_processed_tick
            .is_some_and(|last_tick| damage.tick <= last_tick)
            || !self.assemblies.contains_key(&damage.assembly)
        {
            return false;
        }
        self.pending.entry(damage.tick).or_default().push(damage);
        true
    }

    pub fn step(&mut self, tick: u64, fixed_delta: f32) -> Vec<DestructionEvent> {
        if self
            .last_processed_tick
            .is_some_and(|last_tick| tick <= last_tick)
        {
            return Vec::new();
        }
        self.last_processed_tick = Some(tick);
        self.pending.retain(|queued_tick, _| *queued_tick >= tick);
        self.cleanup(fixed_delta.max(0.0));
        let queued = self.pending.remove(&tick).unwrap_or_default();
        let groups = self.group_damage(queued);
        let mut events = Vec::new();
        for group in groups {
            self.apply_damage_group(group, tick, &mut events);
        }
        events
    }

    pub fn observe(&self) -> DestructibleObservation {
        DestructibleObservation {
            assemblies: self
                .assemblies
                .iter()
                .map(|(id, assembly)| DestructibleAssemblyObservation {
                    broken: assembly.assembly_broken,
                    id: id.clone(),
                })
                .collect(),
            bonds: self
                .assemblies
                .iter()
                .flat_map(|(assembly_id, assembly)| {
                    assembly
                        .bonds
                        .iter()
                        .map(move |(id, bond)| DestructibleBondObservation {
                            assembly: assembly_id.clone(),
                            broken: bond.broken,
                            health: round(bond.health),
                            id: id.clone(),
                        })
                })
                .collect(),
            pieces: self
                .assemblies
                .iter()
                .flat_map(|(assembly_id, assembly)| {
                    assembly
                        .pieces
                        .iter()
                        .map(move |(id, piece)| DestructiblePieceObservation {
                            activation_depth: piece.source.activation_depth,
                            assembly: assembly_id.clone(),
                            id: id.clone(),
                            lifecycle: piece.lifecycle,
                        })
                })
                .collect(),
        }
    }

    pub fn active_piece_count(&self) -> usize {
        self.assemblies
            .values()
            .flat_map(|assembly| assembly.pieces.values())
            .filter(|piece| piece.lifecycle == PieceLifecycle::Active)
            .count()
    }

    pub(crate) fn set_scene_active_piece_budget(&mut self, budget: usize) {
        self.scene_active_piece_budget = budget;
    }

    fn group_damage(&self, mut queued: Vec<DestructionDamage>) -> Vec<DamageGroup> {
        queued.sort_by(|left, right| damage_sort_key(left).cmp(&damage_sort_key(right)));
        let mut groups = BTreeMap::<(String, String), DamageGroup>::new();
        for damage in queued {
            let Some(assembly) = self.assemblies.get(&damage.assembly) else {
                continue;
            };
            let Some(bond) = assembly.bonds.get(&damage.bond) else {
                continue;
            };
            if !impact_allowed(&assembly.config, &damage) {
                continue;
            }
            let key = (damage.assembly.clone(), damage.bond.clone());
            let amount = damage_amount(&damage, bond);
            let group = groups.entry(key).or_insert_with(|| DamageGroup {
                assembly: damage.assembly,
                bond: damage.bond,
                cause: damage.cause,
                damage: 0.0,
            });
            group.damage += amount;
        }
        groups.into_values().collect()
    }

    fn apply_damage_group(
        &mut self,
        group: DamageGroup,
        tick: u64,
        events: &mut Vec<DestructionEvent>,
    ) {
        let Some(mut assembly) = self.assemblies.remove(&group.assembly) else {
            return;
        };
        let Some(bond) = assembly.bonds.get_mut(&group.bond) else {
            self.assemblies.insert(group.assembly, assembly);
            return;
        };
        if bond.broken || group.damage <= 0.0 || !group.damage.is_finite() {
            self.assemblies.insert(group.assembly, assembly);
            return;
        }
        let amount = bond
            .health
            .min(group.damage * bond.source.material_response.unwrap_or(1.0));
        bond.health = (bond.health - amount).max(0.0);
        events.push(DestructionEvent::Damaged {
            amount: round(amount),
            assembly: group.assembly.clone(),
            bond: group.bond.clone(),
            cause: group.cause.clone(),
            remaining_health: round(bond.health),
            tick,
        });
        if bond.health > 0.0 {
            self.assemblies.insert(group.assembly, assembly);
            return;
        }
        bond.broken = true;
        let mut candidates = bond.source.pieces.clone();
        candidates.sort_by(|left, right| {
            let left_piece = assembly.pieces.get(left);
            let right_piece = assembly.pieces.get(right);
            left_piece
                .map(|piece| piece.source.activation_depth)
                .cmp(&right_piece.map(|piece| piece.source.activation_depth))
                .then_with(|| left.cmp(right))
        });
        events.push(DestructionEvent::BondBroken {
            assembly: group.assembly.clone(),
            bond: group.bond,
            cause: group.cause.clone(),
            tick,
        });
        self.assemblies.insert(group.assembly.clone(), assembly);
        for piece in candidates {
            self.activate_piece(&group.assembly, &piece, &group.cause, tick, events);
        }
        let Some(assembly) = self.assemblies.get_mut(&group.assembly) else {
            return;
        };
        if !assembly.assembly_broken && assembly.bonds.values().all(|bond| bond.broken) {
            assembly.assembly_broken = true;
            events.push(DestructionEvent::AssemblyBroken {
                assembly: group.assembly,
                cause: group.cause,
                tick,
            });
        }
    }

    fn activate_piece(
        &mut self,
        assembly_id: &str,
        piece_id: &str,
        cause: &DestructionCause,
        tick: u64,
        events: &mut Vec<DestructionEvent>,
    ) {
        let Some(assembly) = self.assemblies.get(assembly_id) else {
            return;
        };
        let Some(piece) = assembly.pieces.get(piece_id) else {
            return;
        };
        if piece.lifecycle == PieceLifecycle::Active {
            return;
        }
        let depth_exceeded = piece.source.activation_depth > assembly.max_depth;
        let assembly_exceeded = active_pieces(assembly).len() >= assembly.max_active_pieces;
        let scene_exceeded = self.active_piece_count() >= self.scene_active_piece_budget;
        let policy = assembly.overflow_policy;
        if depth_exceeded || assembly_exceeded || scene_exceeded {
            events.push(DestructionEvent::BudgetExceeded {
                assembly: assembly_id.to_owned(),
                cause: cause.clone(),
                piece: piece_id.to_owned(),
                policy,
                tick,
            });
            if depth_exceeded || policy == OverflowPolicy::RejectNew {
                return;
            }
            let victim = if assembly_exceeded {
                self.oldest_active_piece(Some(assembly_id))
            } else {
                self.oldest_active_piece(None)
            };
            let Some((victim_assembly, victim_piece)) = victim else {
                return;
            };
            let lifecycle = if policy == OverflowPolicy::SleepOldest {
                PieceLifecycle::Sleeping
            } else {
                PieceLifecycle::Despawned
            };
            if let Some(piece) = self
                .assemblies
                .get_mut(&victim_assembly)
                .and_then(|assembly| assembly.pieces.get_mut(&victim_piece))
            {
                piece.lifecycle = lifecycle;
            }
            events.push(DestructionEvent::PieceLifecycleChanged {
                assembly: victim_assembly,
                cause: cause.clone(),
                lifecycle,
                piece: victim_piece,
                policy,
                tick,
            });
        }
        let Some(piece) = self
            .assemblies
            .get_mut(assembly_id)
            .and_then(|assembly| assembly.pieces.get_mut(piece_id))
        else {
            return;
        };
        piece.lifecycle = PieceLifecycle::Active;
        piece.activated_at = Some(tick);
        piece.active_age = 0.0;
        events.push(DestructionEvent::PieceActivated {
            assembly: assembly_id.to_owned(),
            cause: cause.clone(),
            piece: piece_id.to_owned(),
            tick,
        });
    }

    #[allow(
        clippy::excessive_nesting,
        reason = "cleanup policy and lifecycle transitions are kept together to preserve exact authored boundary ordering"
    )]
    fn cleanup(&mut self, delta: f32) {
        for assembly in self.assemblies.values_mut() {
            let mut pooled = assembly
                .pieces
                .values()
                .filter(|piece| piece.lifecycle == PieceLifecycle::Pooled)
                .count();
            for piece in assembly.pieces.values_mut() {
                if !matches!(
                    piece.lifecycle,
                    PieceLifecycle::Active | PieceLifecycle::Sleeping
                ) {
                    continue;
                }
                piece.active_age += delta;
                if piece.lifecycle == PieceLifecycle::Active
                    && assembly
                        .cleanup
                        .sleep_after_seconds
                        .is_some_and(|after| piece.active_age >= after)
                {
                    piece.lifecycle = PieceLifecycle::Sleeping;
                }
                let should_finish = match assembly.cleanup_policy {
                    CleanupPolicy::Sleep => false,
                    CleanupPolicy::Despawn | CleanupPolicy::Pool => assembly
                        .cleanup
                        .despawn_after_seconds
                        .is_some_and(|after| piece.active_age >= after),
                };
                if should_finish {
                    if assembly.cleanup_policy == CleanupPolicy::Pool
                        && pooled < assembly.cleanup.pool_capacity.unwrap_or(0)
                    {
                        piece.lifecycle = PieceLifecycle::Pooled;
                        pooled += 1;
                    } else {
                        piece.lifecycle = PieceLifecycle::Despawned;
                    }
                }
            }
        }
    }

    fn oldest_active_piece(&self, assembly: Option<&str>) -> Option<(String, String)> {
        self.assemblies
            .iter()
            .filter(|(id, _)| assembly.is_none_or(|expected| id.as_str() == expected))
            .flat_map(|(assembly_id, assembly)| {
                assembly.pieces.iter().filter_map(move |(piece_id, piece)| {
                    (piece.lifecycle == PieceLifecycle::Active).then_some((
                        piece.activated_at.unwrap_or(u64::MAX),
                        assembly_id.clone(),
                        piece_id.clone(),
                    ))
                })
            })
            .min()
            .map(|(_, assembly_id, piece_id)| (assembly_id, piece_id))
    }
}

fn active_pieces(assembly: &AssemblyState) -> Vec<&PieceState> {
    assembly
        .pieces
        .values()
        .filter(|piece| piece.lifecycle == PieceLifecycle::Active)
        .collect()
}

fn damage_sort_key(damage: &DestructionDamage) -> (&str, &str, u8, &str, &str) {
    let kind = match damage.cause.kind {
        DestructionCauseKind::Contact => 0,
        DestructionCauseKind::Script => 1,
    };
    (
        &damage.assembly,
        &damage.bond,
        kind,
        damage.cause.entity.as_deref().unwrap_or(""),
        damage.cause.contact.as_deref().unwrap_or(""),
    )
}

fn impact_allowed(config: &Destructible, damage: &DestructionDamage) -> bool {
    if damage.cause.kind != DestructionCauseKind::Contact {
        return true;
    }
    let Some(filter) = config.impact_filter.as_ref() else {
        return true;
    };
    if damage.impulse.unwrap_or(0.0) < filter.min_impulse.unwrap_or(0.0) {
        return false;
    }
    filter.layers.as_ref().is_none_or(|layers| {
        damage
            .layer
            .as_ref()
            .is_some_and(|layer| layers.contains(layer))
    })
}

fn damage_amount(damage: &DestructionDamage, bond: &BondState) -> f32 {
    if let Some(amount) = damage.amount {
        return amount.max(0.0);
    }
    let impulse_ratio = (damage.impulse.unwrap_or(0.0).max(0.0)
        / bond.source.impulse_threshold.max(f32::EPSILON))
    .max(0.0);
    let energy_ratio = bond.source.energy_threshold.map_or(0.0, |threshold| {
        damage.energy.unwrap_or(0.0).max(0.0) / threshold.max(f32::EPSILON)
    });
    bond.source.health * impulse_ratio.max(energy_ratio)
}

#[derive(Default)]
pub(crate) struct NativeDestructionState {
    assembly_snapshots: BTreeMap<String, AssemblyBodySnapshot>,
    bond_joints: BTreeMap<(String, String), ImpulseJointHandle>,
    intact_collision_retired: BTreeSet<String>,
    pieces: BTreeMap<(String, String), NativePieceBody>,
    registered: BTreeSet<String>,
    runtime: DestructionRuntime,
    tick: u64,
}

struct NativePieceBody {
    angular_velocity: RapierVec3,
    collider: ColliderHandle,
    handle: RigidBodyHandle,
    mass: f32,
    linear_velocity: RapierVec3,
}

#[derive(Clone)]
struct AssemblyBodySnapshot {
    angular_velocity: RapierVec3,
    gravity_scale: f32,
    layer: Option<String>,
    linear_velocity: RapierVec3,
    mask: Vec<String>,
    mass: f32,
    position: RapierVec3,
    rotation: RapierQuat,
}

impl NativeDestructionState {
    pub(crate) fn reconcile(
        &mut self,
        bundle: &LoadedBundle,
    ) -> Result<(), DestructionRegistrationError> {
        let declarations = bundle
            .world
            .entities
            .iter()
            .filter_map(|entity| {
                let component = entity.components.extra.get("Destructible")?;
                Some((entity.id.clone(), component.clone()))
            })
            .collect::<Vec<_>>();
        for (entity, component) in declarations {
            if self.registered.contains(&entity) {
                continue;
            }
            let config = serde_json::from_value::<Destructible>(component).map_err(|error| {
                DestructionRegistrationError {
                    code: "TN_PHYSICS_DESTRUCTION_COMPONENT_INVALID",
                    message: format!("Destructible '{entity}' is invalid: {error}"),
                    path: format!("world/entities/{entity}/components/Destructible"),
                }
            })?;
            let manifest_path = bundle.bundle_path.join(&config.fracture_manifest);
            let source = fs::read_to_string(&manifest_path).map_err(|error| {
                DestructionRegistrationError {
                    code: "TN_PHYSICS_DESTRUCTION_MANIFEST_MISSING",
                    message: format!(
                        "Destructible '{entity}' could not read its fracture manifest: {error}"
                    ),
                    path: config.fracture_manifest.clone(),
                }
            })?;
            let manifest = serde_json::from_str::<FractureManifest>(&source).map_err(|error| {
                DestructionRegistrationError {
                    code: "TN_PHYSICS_DESTRUCTION_MANIFEST_INVALID",
                    message: format!(
                        "Destructible '{entity}' fracture manifest is invalid: {error}"
                    ),
                    path: config.fracture_manifest.clone(),
                }
            })?;
            self.runtime.register(&entity, manifest, config)?;
            self.registered.insert(entity);
        }
        let desired = bundle
            .world
            .entities
            .iter()
            .filter(|entity| entity.components.extra.contains_key("Destructible"))
            .map(|entity| entity.id.clone())
            .collect::<BTreeSet<_>>();
        let removed = self
            .registered
            .difference(&desired)
            .cloned()
            .collect::<Vec<_>>();
        for entity in removed {
            self.runtime.unregister(&entity);
            self.registered.remove(&entity);
            self.assembly_snapshots.remove(&entity);
            self.intact_collision_retired.remove(&entity);
        }
        Ok(())
    }

    pub(crate) fn queue_damage(&mut self, damage: DestructionDamage) -> bool {
        self.runtime.queue_damage(damage)
    }

    pub(crate) fn set_scene_active_piece_budget(&mut self, budget: usize) {
        self.runtime.set_scene_active_piece_budget(budget);
    }

    pub(crate) fn step(
        &mut self,
        world: &mut PhysicsWorld,
        handles: &mut BTreeMap<String, RigidBodyHandle>,
        collider_owners: &mut Vec<(ColliderHandle, ColliderOwner)>,
        fixed_delta: f32,
    ) -> Vec<DestructionEvent> {
        self.tick += 1;
        let events = self.runtime.step(self.tick, fixed_delta);
        self.sync_piece_bodies(world, handles, collider_owners);
        events
    }

    pub(crate) fn queue_contact_damage(
        &mut self,
        world: &PhysicsWorld,
        collider_owners: &[(ColliderHandle, ColliderOwner)],
    ) {
        let owner_for = |handle: ColliderHandle| {
            collider_owners
                .iter()
                .find_map(|(candidate, owner)| (*candidate == handle).then_some(owner))
        };
        let mut contacts = Vec::new();
        for pair in world
            .contact_pairs()
            .filter(|pair| pair.has_any_active_contact())
        {
            let (Some(left), Some(right)) = (owner_for(pair.collider1), owner_for(pair.collider2))
            else {
                continue;
            };
            let contact_point = pair
                .manifolds
                .iter()
                .flat_map(|manifold| &manifold.data.solver_contacts)
                .next()
                .map(|contact| <[f32; 3]>::from(contact.point));
            for (assembly, assembly_collider, impact) in
                [(left, pair.collider1, right), (right, pair.collider2, left)]
            {
                let Some(state) = self.runtime.assemblies.get(&assembly.entity) else {
                    continue;
                };
                let origin = world
                    .colliders
                    .get(assembly_collider)
                    .and_then(|collider| collider.parent())
                    .and_then(|handle| world.bodies.get(handle))
                    .map_or([0.0; 3], |body| body.translation().into());
                let Some(bond) = contact_bond(state, origin, contact_point) else {
                    continue;
                };
                let (contact_a, contact_b) = if assembly.entity <= impact.entity {
                    (&assembly.entity, &impact.entity)
                } else {
                    (&impact.entity, &assembly.entity)
                };
                contacts.push(DestructionDamage {
                    amount: None,
                    assembly: assembly.entity.clone(),
                    bond,
                    cause: DestructionCause {
                        contact: Some(format!("rapier:{contact_a}:{contact_b}")),
                        entity: Some(impact.entity.clone()),
                        kind: DestructionCauseKind::Contact,
                    },
                    energy: None,
                    impulse: Some(pair.total_impulse_magnitude()),
                    layer: impact.layer.clone(),
                    tick: self.tick + 1,
                });
            }
        }
        contacts.sort_by(|left, right| damage_sort_key(left).cmp(&damage_sort_key(right)));
        for damage in contacts {
            self.runtime.queue_damage(damage);
        }
    }

    pub(crate) fn observation(&self, world: &PhysicsWorld) -> DestructionPhysicsObservation {
        let semantic = self.runtime.observe();
        DestructionPhysicsObservation {
            assemblies: semantic
                .assemblies
                .into_iter()
                .map(|assembly| DestructionAssemblyPhysicsObservation {
                    intact_collision_active: !self.intact_collision_retired.contains(&assembly.id),
                    assembly: assembly.id,
                })
                .collect(),
            bonds: semantic.bonds,
            pieces: semantic
                .pieces
                .into_iter()
                .map(|piece| {
                    let native = self.pieces.get(&(piece.assembly.clone(), piece.id.clone()));
                    let body = native.and_then(|native| world.bodies.get(native.handle));
                    let position = body.map_or([0.0; 3], |body| body.translation().into());
                    let rotation = body.map_or([0.0, 0.0, 0.0, 1.0], |body| {
                        let rotation = body.rotation();
                        [rotation.x, rotation.y, rotation.z, rotation.w]
                    });
                    DestructionPieceBodyObservation {
                        angular_velocity: body.map_or([0.0; 3], |body| body.angvel().into()),
                        assembly: piece.assembly,
                        body_handle: native.map(|native| {
                            let (index, generation) = native.handle.into_raw_parts();
                            [index, generation]
                        }),
                        lifecycle: piece.lifecycle,
                        linear_velocity: body.map_or([0.0; 3], |body| body.linvel().into()),
                        mass: native.map_or(0.0, |native| native.mass),
                        piece: piece.id,
                        position,
                        rotation,
                    }
                })
                .collect(),
        }
    }

    pub(crate) fn allocated_piece_count(&self) -> usize {
        self.runtime
            .assemblies
            .values()
            .flat_map(|assembly| assembly.pieces.values())
            .filter(|piece| {
                matches!(
                    piece.lifecycle,
                    PieceLifecycle::Active | PieceLifecycle::Sleeping
                )
            })
            .count()
    }

    pub(crate) fn intact_collision_is_retired(&self, assembly: &str) -> bool {
        self.intact_collision_retired.contains(assembly)
    }

    pub(crate) fn budget_debug_observations(&self) -> Vec<DestructionBudgetDebugObservation> {
        self.runtime
            .assemblies
            .iter()
            .map(|(assembly, state)| DestructionBudgetDebugObservation {
                active: state
                    .pieces
                    .values()
                    .filter(|piece| {
                        matches!(
                            piece.lifecycle,
                            PieceLifecycle::Active | PieceLifecycle::Sleeping
                        )
                    })
                    .count(),
                assembly: assembly.clone(),
                maximum: state.max_active_pieces,
            })
            .collect()
    }

    #[allow(
        clippy::excessive_nesting,
        reason = "bond endpoint fallback must resolve retained bodies and manifest positions in stable nested ownership order"
    )]
    pub(crate) fn bond_debug_observations(
        &self,
        world: &PhysicsWorld,
        handles: &BTreeMap<String, RigidBodyHandle>,
    ) -> Vec<DestructionBondDebugObservation> {
        let mut observations = Vec::new();
        for (assembly_id, assembly) in &self.runtime.assemblies {
            for (bond_id, bond) in &assembly.bonds {
                let origin = handles
                    .get(assembly_id)
                    .and_then(|handle| world.bodies.get(*handle))
                    .map_or([0.0; 3], |body| body.translation().into());
                let endpoints = bond.source.pieces.clone().map(|piece_id| {
                    self.pieces
                        .get(&(assembly_id.clone(), piece_id.clone()))
                        .and_then(|native| world.bodies.get(native.handle))
                        .map_or_else(
                            || {
                                assembly.pieces.get(&piece_id).map_or(origin, |piece| {
                                    add_position(origin, piece.source.local_position)
                                })
                            },
                            |body| body.translation().into(),
                        )
                });
                observations.push(DestructionBondDebugObservation {
                    assembly: assembly_id.clone(),
                    bond: bond_id.clone(),
                    broken: bond.broken,
                    from: endpoints[0],
                    health: bond.health,
                    to: endpoints[1],
                });
            }
        }
        observations.sort_by(|left, right| {
            left.assembly
                .cmp(&right.assembly)
                .then(left.bond.cmp(&right.bond))
        });
        observations
    }

    pub(crate) fn piece_debug_observations(
        &self,
        world: &PhysicsWorld,
    ) -> Vec<DestructionPieceDebugObservation> {
        let semantic = self.runtime.observe();
        semantic
            .pieces
            .into_iter()
            .filter_map(|piece| {
                let state = self.runtime.assemblies.get(&piece.assembly)?;
                let source = state.pieces.get(&piece.id)?;
                let native = self
                    .pieces
                    .get(&(piece.assembly.clone(), piece.id.clone()))?;
                let body = world.bodies.get(native.handle)?;
                let (kind, size) = match &source.source.collider {
                    FracturePieceCollider::Box { half_extents } => (
                        "box",
                        Some(half_extents.map(|half_extent| half_extent * 2.0)),
                    ),
                    FracturePieceCollider::Sphere { radius } => ("sphere", Some([radius * 2.0; 3])),
                    _ => ("point", None),
                };
                Some(DestructionPieceDebugObservation {
                    assembly: piece.assembly,
                    kind,
                    lifecycle: piece.lifecycle,
                    piece: piece.id,
                    position: body.translation().into(),
                    size,
                })
            })
            .collect()
    }

    #[allow(
        clippy::excessive_nesting,
        reason = "piece lifecycle reconciliation keeps body type and handle changes atomic per piece"
    )]
    fn sync_piece_bodies(
        &mut self,
        world: &mut PhysicsWorld,
        handles: &mut BTreeMap<String, RigidBodyHandle>,
        collider_owners: &mut Vec<(ColliderHandle, ColliderOwner)>,
    ) {
        let pieces = self.runtime.observe().pieces;
        let desired_piece_keys = pieces
            .iter()
            .map(|piece| (piece.assembly.clone(), piece.id.clone()))
            .collect::<BTreeSet<_>>();
        let orphaned = self
            .pieces
            .keys()
            .filter(|key| !desired_piece_keys.contains(*key))
            .cloned()
            .collect::<Vec<_>>();
        for key in orphaned {
            self.remove_piece_body(world, handles, collider_owners, &key);
        }
        let newly_fractured = pieces
            .iter()
            .filter(|piece| piece.lifecycle == PieceLifecycle::Active)
            .map(|piece| piece.assembly.clone())
            .filter(|assembly| !self.intact_collision_retired.contains(assembly))
            .collect::<BTreeSet<_>>();
        for assembly in newly_fractured {
            self.materialize_assembly(world, handles, collider_owners, &assembly, &pieces);
        }
        for piece in pieces {
            let key = (piece.assembly.clone(), piece.id.clone());
            match piece.lifecycle {
                PieceLifecycle::Active => {
                    if let Some(native) = self.pieces.get(&key) {
                        if let Some(body) = world.bodies.get_mut(native.handle)
                            && body.body_type() != RigidBodyType::Dynamic
                        {
                            body.set_body_type(RigidBodyType::Dynamic, true);
                            body.set_linvel(native.linear_velocity, true);
                            body.set_angvel(native.angular_velocity, true);
                        }
                    } else {
                        self.create_piece_body(
                            world,
                            handles,
                            collider_owners,
                            &piece.assembly,
                            &piece.id,
                        );
                    }
                }
                PieceLifecycle::Sleeping => {
                    if let Some(native) = self.pieces.get(&key)
                        && let Some(body) = world.bodies.get_mut(native.handle)
                    {
                        body.set_body_type(RigidBodyType::Fixed, true);
                        body.set_linvel(vector![0.0, 0.0, 0.0].into(), false);
                        body.set_angvel(vector![0.0, 0.0, 0.0].into(), false);
                    }
                }
                PieceLifecycle::Bound => {}
                PieceLifecycle::Despawned | PieceLifecycle::Pooled => {
                    self.remove_piece_body(world, handles, collider_owners, &key);
                }
            }
        }
        self.reconcile_bond_joints(world);
    }

    fn materialize_assembly(
        &mut self,
        world: &mut PhysicsWorld,
        handles: &mut BTreeMap<String, RigidBodyHandle>,
        collider_owners: &mut Vec<(ColliderHandle, ColliderOwner)>,
        assembly_id: &str,
        pieces: &[DestructiblePieceObservation],
    ) {
        let Some(snapshot) = assembly_body_snapshot(world, handles, collider_owners, assembly_id)
        else {
            return;
        };
        self.assembly_snapshots
            .insert(assembly_id.to_owned(), snapshot);
        for piece in pieces.iter().filter(|piece| piece.assembly == assembly_id) {
            self.create_piece_body(world, handles, collider_owners, assembly_id, &piece.id);
        }
        if self.intact_collision_retired.insert(assembly_id.to_owned()) {
            retire_intact_assembly(world, handles, collider_owners, assembly_id);
        }
    }

    fn create_piece_body(
        &mut self,
        world: &mut PhysicsWorld,
        handles: &mut BTreeMap<String, RigidBodyHandle>,
        collider_owners: &mut Vec<(ColliderHandle, ColliderOwner)>,
        assembly_id: &str,
        piece_id: &str,
    ) {
        if self
            .pieces
            .contains_key(&(assembly_id.to_owned(), piece_id.to_owned()))
        {
            return;
        }
        let Some(assembly) = self.runtime.assemblies.get(assembly_id) else {
            return;
        };
        let Some(piece) = assembly.pieces.get(piece_id) else {
            return;
        };
        let Some(snapshot) = self.assembly_snapshots.get(assembly_id).cloned() else {
            return;
        };
        let Some(mut collider) = fracture_collider(&piece.source.collider) else {
            return;
        };
        let local_position = RapierVec3::from_array(piece.source.local_position);
        let local_rotation =
            RapierQuat::from_array(piece.source.local_rotation.unwrap_or([0.0, 0.0, 0.0, 1.0]))
                .normalize();
        let position = snapshot.position + snapshot.rotation * local_position;
        let rotation = (snapshot.rotation * local_rotation).normalize();
        let mass = snapshot.mass * piece.source.mass_fraction;
        let body = RigidBodyBuilder::dynamic()
            .translation(position)
            .rotation(rotation.to_scaled_axis())
            .linvel(snapshot.linear_velocity)
            .angvel(snapshot.angular_velocity)
            .gravity_scale(snapshot.gravity_scale);
        collider = collider.mass(mass);
        let (handle, collider_handle) = world.insert(body, collider);
        let handle_id = piece_body_id(assembly_id, piece_id);
        handles.insert(handle_id, handle);
        collider_owners.push((
            collider_handle,
            ColliderOwner {
                child: Some(piece_id.to_owned()),
                entity: assembly_id.to_owned(),
                layer: snapshot.layer,
                mask: snapshot.mask,
            },
        ));
        self.pieces.insert(
            (assembly_id.to_owned(), piece_id.to_owned()),
            NativePieceBody {
                angular_velocity: snapshot.angular_velocity,
                collider: collider_handle,
                handle,
                linear_velocity: snapshot.linear_velocity,
                mass,
            },
        );
    }

    fn remove_piece_body(
        &mut self,
        world: &mut PhysicsWorld,
        handles: &mut BTreeMap<String, RigidBodyHandle>,
        collider_owners: &mut Vec<(ColliderHandle, ColliderOwner)>,
        key: &(String, String),
    ) {
        let Some(native) = self.pieces.remove(key) else {
            return;
        };
        world.remove_body(native.handle);
        handles.remove(&piece_body_id(&key.0, &key.1));
        collider_owners.retain(|(handle, _)| *handle != native.collider);
    }

    fn reconcile_bond_joints(&mut self, world: &mut PhysicsWorld) {
        let mut desired = BTreeMap::new();
        for (assembly_id, assembly) in &self.runtime.assemblies {
            if !self.intact_collision_retired.contains(assembly_id) {
                continue;
            }
            for (bond_id, bond) in &assembly.bonds {
                if !bond.broken {
                    desired.insert(
                        (assembly_id.clone(), bond_id.clone()),
                        bond.source.pieces.clone(),
                    );
                }
            }
        }
        let removed = self
            .bond_joints
            .keys()
            .filter(|key| !desired.contains_key(*key))
            .cloned()
            .collect::<Vec<_>>();
        for key in removed {
            if let Some(handle) = self.bond_joints.remove(&key) {
                world.remove_impulse_joint(handle);
            }
        }
        for (key, pieces) in desired {
            if self.bond_joints.contains_key(&key) {
                continue;
            }
            let Some(left) = self
                .pieces
                .get(&(key.0.clone(), pieces[0].clone()))
                .map(|piece| piece.handle)
            else {
                continue;
            };
            let Some(right) = self
                .pieces
                .get(&(key.0.clone(), pieces[1].clone()))
                .map(|piece| piece.handle)
            else {
                continue;
            };
            let (Some(left_body), Some(right_body)) =
                (world.bodies.get(left), world.bodies.get(right))
            else {
                continue;
            };
            let left_pose = left_body.position();
            let right_pose = right_body.position();
            let relative = right_pose.inverse() * left_pose;
            let joint = FixedJointBuilder::new()
                .contacts_enabled(false)
                .local_frame1(Pose::IDENTITY)
                .local_frame2(relative)
                .build();
            let handle = world.insert_impulse_joint(left, right, joint);
            self.bond_joints.insert(key, handle);
        }
    }
}

fn contact_bond(
    assembly: &AssemblyState,
    origin: [f32; 3],
    point: Option<[f32; 3]>,
) -> Option<String> {
    let healthy = assembly
        .bonds
        .iter()
        .filter_map(|(id, bond)| (!bond.broken).then_some((id, bond)))
        .collect::<Vec<_>>();
    let Some(point) = point else {
        return healthy.first().map(|(id, _)| (*id).clone());
    };
    let nearest_piece = assembly
        .pieces
        .values()
        .min_by(|left, right| {
            squared_distance(point, add_position(origin, left.source.local_position))
                .total_cmp(&squared_distance(
                    point,
                    add_position(origin, right.source.local_position),
                ))
                .then(left.source.id.cmp(&right.source.id))
        })
        .map(|piece| piece.source.id.as_str());
    healthy
        .iter()
        .find(|(_, bond)| {
            nearest_piece
                .is_some_and(|piece| bond.source.pieces.iter().any(|endpoint| endpoint == piece))
        })
        .or_else(|| healthy.first())
        .map(|(id, _)| (*id).clone())
}

fn add_position(left: [f32; 3], right: [f32; 3]) -> [f32; 3] {
    [left[0] + right[0], left[1] + right[1], left[2] + right[2]]
}

fn squared_distance(left: [f32; 3], right: [f32; 3]) -> f32 {
    (left[0] - right[0]).powi(2) + (left[1] - right[1]).powi(2) + (left[2] - right[2]).powi(2)
}

fn piece_body_id(assembly: &str, piece: &str) -> String {
    format!("{assembly}#fracture:{piece}")
}

fn assembly_body_snapshot(
    world: &PhysicsWorld,
    handles: &BTreeMap<String, RigidBodyHandle>,
    collider_owners: &[(ColliderHandle, ColliderOwner)],
    assembly: &str,
) -> Option<AssemblyBodySnapshot> {
    let handle = handles.get(assembly).copied()?;
    let body = world.bodies.get(handle)?;
    let owner = collider_owners
        .iter()
        .find_map(|(_, owner)| (owner.entity == assembly).then_some(owner));
    Some(AssemblyBodySnapshot {
        angular_velocity: body.angvel(),
        gravity_scale: body.gravity_scale(),
        layer: owner.and_then(|owner| owner.layer.clone()),
        linear_velocity: body.linvel(),
        mask: owner.map_or_else(Vec::new, |owner| owner.mask.clone()),
        mass: body.mass(),
        position: body.translation(),
        rotation: *body.rotation(),
    })
}

fn retire_intact_assembly(
    world: &mut PhysicsWorld,
    handles: &BTreeMap<String, RigidBodyHandle>,
    collider_owners: &mut Vec<(ColliderHandle, ColliderOwner)>,
    assembly: &str,
) {
    let colliders = collider_owners
        .iter()
        .filter(|(_, owner)| owner.entity == assembly && owner.child.is_none())
        .map(|(handle, _)| *handle)
        .collect::<Vec<_>>();
    for collider in &colliders {
        world.remove_collider(*collider);
    }
    collider_owners.retain(|(handle, _)| !colliders.contains(handle));
    if let Some(handle) = handles.get(assembly)
        && let Some(body) = world.bodies.get_mut(*handle)
    {
        body.set_enabled(false);
    }
}

fn fracture_collider(source: &FracturePieceCollider) -> Option<ColliderBuilder> {
    match source {
        FracturePieceCollider::Box { half_extents } => Some(ColliderBuilder::cuboid(
            half_extents[0],
            half_extents[1],
            half_extents[2],
        )),
        FracturePieceCollider::Sphere { radius } => Some(ColliderBuilder::ball(*radius)),
        FracturePieceCollider::Capsule {
            half_height,
            radius,
        } => Some(ColliderBuilder::capsule_y(*half_height, *radius)),
        FracturePieceCollider::ConvexHull { vertices } => ColliderBuilder::convex_hull(
            &vertices
                .iter()
                .copied()
                .map(RapierVec3::from_array)
                .collect::<Vec<_>>(),
        ),
    }
}

fn validate_registration(
    manifest: &FractureManifest,
    config: &Destructible,
) -> Result<(), DestructionRegistrationError> {
    let invalid = |path: &str, message: &str| DestructionRegistrationError {
        code: "TN_PHYSICS_DESTRUCTION_INVALID_MANIFEST",
        message: message.to_owned(),
        path: path.to_owned(),
    };
    if manifest.schema != FRACTURE_SCHEMA || manifest.version != FRACTURE_VERSION {
        return Err(invalid(
            "fractureManifest",
            "schema and version must be supported",
        ));
    }
    if config.fracture_manifest.is_empty() {
        return Err(invalid(
            "Destructible.fractureManifest",
            "component must reference a fracture manifest",
        ));
    }
    if manifest.pieces.is_empty() || manifest.budgets.max_active_pieces == 0 {
        return Err(invalid(
            "fractureManifest.budgets.maxActivePieces",
            "piece set and active-piece budget must be non-empty",
        ));
    }
    let mut piece_ids = BTreeSet::new();
    let mut mass_fraction = 0.0;
    for (index, piece) in manifest.pieces.iter().enumerate() {
        if !piece_ids.insert(piece.id.as_str()) {
            return Err(invalid(
                &format!("fractureManifest.pieces[{index}].id"),
                "piece IDs must be unique",
            ));
        }
        if !piece.mass_fraction.is_finite() || piece.mass_fraction <= 0.0 {
            return Err(invalid(
                &format!("fractureManifest.pieces[{index}].massFraction"),
                "mass fraction must be finite and positive",
            ));
        }
        mass_fraction += piece.mass_fraction;
    }
    if (mass_fraction - 1.0).abs() > MASS_FRACTION_TOLERANCE {
        return Err(invalid(
            "fractureManifest.pieces",
            "piece mass fractions must sum to one",
        ));
    }
    let mut bond_ids = BTreeSet::new();
    for (index, bond) in manifest.bonds.iter().enumerate() {
        if !bond_ids.insert(bond.id.as_str()) {
            return Err(invalid(
                &format!("fractureManifest.bonds[{index}].id"),
                "bond IDs must be unique",
            ));
        }
        if bond.pieces[0] == bond.pieces[1]
            || bond
                .pieces
                .iter()
                .any(|piece| !piece_ids.contains(piece.as_str()))
        {
            return Err(invalid(
                &format!("fractureManifest.bonds[{index}].pieces"),
                "bond endpoints must reference two distinct pieces",
            ));
        }
        if !bond.health.is_finite()
            || bond.health <= 0.0
            || !bond.impulse_threshold.is_finite()
            || bond.impulse_threshold <= 0.0
        {
            return Err(invalid(
                &format!("fractureManifest.bonds[{index}]"),
                "bond health and impulse threshold must be finite and positive",
            ));
        }
    }
    Ok(())
}

fn round(value: f32) -> f32 {
    (value * 1_000_000.0).round() / 1_000_000.0
}
