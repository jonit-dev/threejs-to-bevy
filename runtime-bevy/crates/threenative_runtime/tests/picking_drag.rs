use threenative_runtime::picking::{
    NativeDragCancelReason, NativeDragPickingFrame, NativeDragPickingPhase,
    NativeDragPickingTracker, NativePickingPointerEvents, NativePickingTarget,
    NativePickingTargetKind, NativePickingVec2,
};

#[test]
fn should_cancel_drag_when_pointer_capture_is_lost() {
    let mut tracker = NativeDragPickingTracker::new(0.01);

    assert!(tracker.update(frame(true, None)).is_empty());
    let started = tracker.update(NativeDragPickingFrame {
        button_down: true,
        cancel: None,
        candidates: vec![target("ui.inventory.item")],
        pointer_id: 1,
        screen: NativePickingVec2 { x: 0.2, y: 0.2 },
        time_ms: 16.0,
        camera_id: Some("camera.main".to_owned()),
        world_hit: None,
        world_ray: None,
    });
    assert_eq!(
        started.iter().map(|event| &event.kind).collect::<Vec<_>>(),
        vec![
            &NativeDragPickingPhase::DragStart,
            &NativeDragPickingPhase::DragEnter,
            &NativeDragPickingPhase::DragMove,
        ]
    );

    let canceled = tracker.update(frame(true, Some(NativeDragCancelReason::LostCapture)));

    assert_eq!(
        canceled.iter().map(|event| &event.kind).collect::<Vec<_>>(),
        vec![
            &NativeDragPickingPhase::DragCancel,
            &NativeDragPickingPhase::DragEnd
        ]
    );
    assert_eq!(tracker.debug_report().capture_owner, None);
}

fn frame(button_down: bool, cancel: Option<NativeDragCancelReason>) -> NativeDragPickingFrame {
    NativeDragPickingFrame {
        button_down,
        cancel,
        candidates: vec![target("ui.inventory.item")],
        pointer_id: 1,
        screen: NativePickingVec2 { x: 0.1, y: 0.1 },
        time_ms: 0.0,
        camera_id: Some("camera.main".to_owned()),
        world_hit: None,
        world_ray: None,
    }
}

fn target(id: &str) -> NativePickingTarget {
    NativePickingTarget {
        disabled: false,
        drop_zone: false,
        id: id.to_owned(),
        pointer_events: NativePickingPointerEvents::Auto,
        target_kind: NativePickingTargetKind::Ui,
        z_index: 10,
    }
}
