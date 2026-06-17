#[derive(Clone, Debug, PartialEq)]
pub struct NativePickingVec2 {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativePickingVec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativePickingRay {
    pub direction: NativePickingVec3,
    pub origin: NativePickingVec3,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativePickingTarget {
    pub disabled: bool,
    pub drop_zone: bool,
    pub id: String,
    pub pointer_events: NativePickingPointerEvents,
    pub target_kind: NativePickingTargetKind,
    pub z_index: i32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NativePickingTargetKind {
    Mesh,
    Ui,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NativePickingPointerEvents {
    Auto,
    PassThrough,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NativeDragCancelReason {
    DisabledTarget,
    Escape,
    LostCapture,
    MissingDevice,
    TargetRemoved,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeDragPickingFrame {
    pub button_down: bool,
    pub camera_id: Option<String>,
    pub cancel: Option<NativeDragCancelReason>,
    pub candidates: Vec<NativePickingTarget>,
    pub pointer_id: u64,
    pub screen: NativePickingVec2,
    pub time_ms: f32,
    pub world_hit: Option<NativePickingVec3>,
    pub world_ray: Option<NativePickingRay>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NativeDragPickingPhase {
    DragStart,
    DragMove,
    DragEnter,
    DragLeave,
    Drop,
    DragCancel,
    DragEnd,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeDragPickingEvent {
    pub camera_id: Option<String>,
    pub current_target_id: Option<String>,
    pub delta: NativePickingVec2,
    pub kind: NativeDragPickingPhase,
    pub pointer_id: u64,
    pub screen: NativePickingVec2,
    pub source_target_id: Option<String>,
    pub time_ms: f32,
    pub world_hit: Option<NativePickingVec3>,
    pub world_ray: Option<NativePickingRay>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativePickingDebugOverlayReport {
    pub capture_owner: Option<String>,
    pub drag_path: Vec<NativePickingVec2>,
    pub event_log: Vec<NativeDragPickingEvent>,
    pub hovered_target: Option<String>,
    pub mesh_bounds: Vec<String>,
    pub pointer_rays: Vec<(u64, NativePickingRay)>,
    pub ui_bounds: Vec<(String, i32)>,
}

#[derive(Clone, Debug)]
struct ActiveDrag {
    entered_target_id: Option<String>,
    last_screen: NativePickingVec2,
    path: Vec<NativePickingVec2>,
    source_target_id: String,
    start_screen: NativePickingVec2,
    started: bool,
}

#[derive(Clone, Debug)]
pub struct NativeDragPickingTracker {
    active: Option<ActiveDrag>,
    event_log: Vec<NativeDragPickingEvent>,
    hovered_target: Option<String>,
    mesh_bounds: Vec<String>,
    move_threshold: f32,
    pointer_rays: Vec<(u64, NativePickingRay)>,
    ui_bounds: Vec<(String, i32)>,
}

impl Default for NativeDragPickingTracker {
    fn default() -> Self {
        Self::new(0.005)
    }
}

impl NativeDragPickingTracker {
    pub fn new(move_threshold: f32) -> Self {
        Self {
            active: None,
            event_log: Vec::new(),
            hovered_target: None,
            mesh_bounds: Vec::new(),
            move_threshold,
            pointer_rays: Vec::new(),
            ui_bounds: Vec::new(),
        }
    }

    pub fn update(&mut self, frame: NativeDragPickingFrame) -> Vec<NativeDragPickingEvent> {
        let mut events = Vec::new();
        let target = resolve_top_picking_target(&frame.candidates).cloned();
        self.hovered_target = target.as_ref().map(|target| target.id.clone());
        self.observe_debug(&frame);

        if self.active.is_some() && frame.cancel.is_some() {
            self.push_event(
                NativeDragPickingPhase::DragCancel,
                &frame,
                None,
                &mut events,
            );
            self.push_event(NativeDragPickingPhase::DragEnd, &frame, None, &mut events);
            self.active = None;
            return events;
        }

        if frame.button_down {
            if self.active.is_none() {
                if let Some(target) = target.as_ref() {
                    if !target.disabled {
                        self.active = Some(ActiveDrag {
                            entered_target_id: None,
                            last_screen: frame.screen.clone(),
                            path: vec![frame.screen.clone()],
                            source_target_id: target.id.clone(),
                            start_screen: frame.screen.clone(),
                            started: false,
                        });
                    }
                }
            }
            let Some(active) = self.active.as_mut() else {
                return events;
            };
            active.path.push(frame.screen.clone());
            let current_target_id = target.as_ref().map(|target| target.id.clone());
            let total_distance = distance(&active.start_screen, &frame.screen);
            if !active.started && total_distance >= self.move_threshold {
                active.started = true;
                self.push_event(
                    NativeDragPickingPhase::DragStart,
                    &frame,
                    current_target_id.clone(),
                    &mut events,
                );
            }
            if self.active.as_ref().is_some_and(|active| active.started) {
                let entered = self
                    .active
                    .as_ref()
                    .and_then(|active| active.entered_target_id.clone());
                if current_target_id != entered {
                    if entered.is_some() {
                        self.push_event(
                            NativeDragPickingPhase::DragLeave,
                            &frame,
                            entered,
                            &mut events,
                        );
                    }
                    if current_target_id.is_some() {
                        self.push_event(
                            NativeDragPickingPhase::DragEnter,
                            &frame,
                            current_target_id.clone(),
                            &mut events,
                        );
                    }
                    if let Some(active) = self.active.as_mut() {
                        active.entered_target_id = current_target_id.clone();
                    }
                }
                self.push_event(
                    NativeDragPickingPhase::DragMove,
                    &frame,
                    current_target_id,
                    &mut events,
                );
            }
            if let Some(active) = self.active.as_mut() {
                active.last_screen = frame.screen;
            }
            return events;
        }

        if self.active.is_some() {
            if target.as_ref().is_some_and(|target| target.drop_zone) {
                self.push_event(
                    NativeDragPickingPhase::Drop,
                    &frame,
                    target.as_ref().map(|target| target.id.clone()),
                    &mut events,
                );
            } else {
                self.push_event(
                    NativeDragPickingPhase::DragCancel,
                    &frame,
                    None,
                    &mut events,
                );
            }
            self.push_event(
                NativeDragPickingPhase::DragEnd,
                &frame,
                target.as_ref().map(|target| target.id.clone()),
                &mut events,
            );
            self.active = None;
        }
        events
    }

    pub fn debug_report(&self) -> NativePickingDebugOverlayReport {
        NativePickingDebugOverlayReport {
            capture_owner: self
                .active
                .as_ref()
                .map(|active| active.source_target_id.clone()),
            drag_path: self
                .active
                .as_ref()
                .map(|active| active.path.clone())
                .unwrap_or_default(),
            event_log: self.event_log.clone(),
            hovered_target: self.hovered_target.clone(),
            mesh_bounds: self.mesh_bounds.clone(),
            pointer_rays: self.pointer_rays.clone(),
            ui_bounds: self.ui_bounds.clone(),
        }
    }

    fn push_event(
        &mut self,
        kind: NativeDragPickingPhase,
        frame: &NativeDragPickingFrame,
        current_target_id: Option<String>,
        events: &mut Vec<NativeDragPickingEvent>,
    ) {
        let event = NativeDragPickingEvent {
            camera_id: frame.camera_id.clone(),
            current_target_id,
            delta: self.active_delta(frame),
            kind,
            pointer_id: frame.pointer_id,
            screen: frame.screen.clone(),
            source_target_id: self
                .active
                .as_ref()
                .map(|active| active.source_target_id.clone()),
            time_ms: frame.time_ms,
            world_hit: frame.world_hit.clone(),
            world_ray: frame.world_ray.clone(),
        };
        self.event_log.push(event.clone());
        events.push(event);
    }

    fn active_delta(&self, frame: &NativeDragPickingFrame) -> NativePickingVec2 {
        let Some(active) = self.active.as_ref() else {
            return NativePickingVec2 { x: 0.0, y: 0.0 };
        };
        NativePickingVec2 {
            x: round(frame.screen.x - active.last_screen.x),
            y: round(frame.screen.y - active.last_screen.y),
        }
    }

    fn observe_debug(&mut self, frame: &NativeDragPickingFrame) {
        if let Some(ray) = frame.world_ray.as_ref() {
            self.pointer_rays.push((frame.pointer_id, ray.clone()));
        }
        for candidate in &frame.candidates {
            match candidate.target_kind {
                NativePickingTargetKind::Mesh => {
                    if !self.mesh_bounds.contains(&candidate.id) {
                        self.mesh_bounds.push(candidate.id.clone());
                    }
                }
                NativePickingTargetKind::Ui => {
                    let item = (candidate.id.clone(), candidate.z_index);
                    if !self.ui_bounds.contains(&item) {
                        self.ui_bounds.push(item);
                    }
                }
            }
        }
    }
}

pub fn resolve_top_picking_target(
    candidates: &[NativePickingTarget],
) -> Option<&NativePickingTarget> {
    candidates
        .iter()
        .filter(|target| {
            !target.disabled && target.pointer_events != NativePickingPointerEvents::PassThrough
        })
        .min_by(|left, right| compare_target_priority(left, right))
}

fn compare_target_priority(
    left: &NativePickingTarget,
    right: &NativePickingTarget,
) -> std::cmp::Ordering {
    match (&left.target_kind, &right.target_kind) {
        (NativePickingTargetKind::Ui, NativePickingTargetKind::Mesh) => std::cmp::Ordering::Less,
        (NativePickingTargetKind::Mesh, NativePickingTargetKind::Ui) => std::cmp::Ordering::Greater,
        _ => right
            .z_index
            .cmp(&left.z_index)
            .then_with(|| left.id.cmp(&right.id)),
    }
}

fn distance(left: &NativePickingVec2, right: &NativePickingVec2) -> f32 {
    ((right.x - left.x).powi(2) + (right.y - left.y).powi(2)).sqrt()
}

fn round(value: f32) -> f32 {
    (value * 1_000_000.0).round() / 1_000_000.0
}
