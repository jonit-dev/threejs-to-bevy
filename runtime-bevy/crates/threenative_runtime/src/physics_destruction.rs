use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use thiserror::Error;

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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub layers: Vec<String>,
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
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DestructionEvent {
    Damaged {
        amount: f32,
        assembly: String,
        bond: String,
        cause: DestructionCause,
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
                        .is_some_and(|after| piece.active_age + f32::EPSILON >= after)
                {
                    piece.lifecycle = PieceLifecycle::Sleeping;
                }
                let should_finish = match assembly.cleanup_policy {
                    CleanupPolicy::Sleep => false,
                    CleanupPolicy::Despawn | CleanupPolicy::Pool => assembly
                        .cleanup
                        .despawn_after_seconds
                        .is_some_and(|after| piece.active_age + f32::EPSILON >= after),
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
    filter.layers.is_empty()
        || damage
            .layer
            .as_ref()
            .is_some_and(|layer| filter.layers.contains(layer))
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
    if config.fracture_manifest != manifest.id {
        return Err(invalid(
            "Destructible.fractureManifest",
            "component reference must match the registered manifest ID",
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
