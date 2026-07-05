use threenative_loader::{UiInsetIr, UiIr, UiLayoutIr, UiNodeIr};
use threenative_runtime::ui_debug::report_native_ui_debug;

#[test]
fn should_report_native_accesskit_state_for_disabled_and_slider_nodes() {
    let ui = UiIr {
        fonts: Vec::new(),
        focus_order: None,
        input_actions: None,
        screen_stack: None,
        screens: None,
        root: UiNodeIr {
            accessibility_label: Some("Settings".to_owned()),
            action: None,
            anchor_id: None,
            attach_to: None,
            binding: None,
            children: vec![
                UiNodeIr {
                    accessibility_label: Some("Volume".to_owned()),
                    action: Some("SetVolume".to_owned()),
                    anchor_id: None,
                    attach_to: None,
                    binding: None,
                    children: Vec::new(),
                    disabled: None,
                    effects: Vec::new(),
                    focusable: None,
                    glyph: None,
                    id: "volume".to_owned(),
                    image: None,
                    kind: "slider".to_owned(),
                    minimap: None,
                    label: None,
                    layout: Some(UiLayoutIr {
                        align: None,
                        column_gap: None,
                        direction: None,
                        grid: None,
                        grow: None,
                        height: Some(24.0),
                        inset: Some(UiInsetIr {
                            bottom: None,
                            left: Some(12.0),
                            right: None,
                            top: Some(8.0),
                        }),
                        justify: None,
                        max_height: None,
                        max_width: None,
                        min_height: None,
                        min_width: None,
                        overflow: None,
                        padding: None,
                        position: None,
                        row_gap: None,
                        width: Some(160.0),
                        z_index: None,
                    }),
                    max: Some(1.0),
                    min: Some(0.0),
                    navigation: None,
                    orientation: Some("horizontal".to_owned()),
                    role: None,
                    spans: Vec::new(),
                    step: None,
                    style: None,
                    src: None,
                    text: None,
                    tooltip: None,
                    value: Some(0.5),
                    value_text: Some("50 percent".to_owned()),
                    virtual_range: None,
                },
                UiNodeIr {
                    accessibility_label: Some("Apply".to_owned()),
                    action: Some("Apply".to_owned()),
                    anchor_id: None,
                    attach_to: None,
                    binding: None,
                    children: Vec::new(),
                    disabled: Some(true),
                    effects: Vec::new(),
                    focusable: Some(true),
                    glyph: None,
                    id: "apply".to_owned(),
                    image: None,
                    kind: "button".to_owned(),
                    minimap: None,
                    label: Some("Apply".to_owned()),
                    layout: None,
                    max: None,
                    min: None,
                    navigation: None,
                    orientation: None,
                    role: None,
                    spans: Vec::new(),
                    step: None,
                    style: None,
                    src: None,
                    text: None,
                    tooltip: None,
                    value: None,
                    value_text: None,
                    virtual_range: None,
                },
            ],
            disabled: None,
            effects: Vec::new(),
            focusable: None,
            glyph: None,
            id: "settings".to_owned(),
            image: None,
            kind: "column".to_owned(),
            minimap: None,
            label: None,
            layout: None,
            max: None,
            min: None,
            navigation: None,
            orientation: None,
            role: None,
            spans: Vec::new(),
            step: None,
            style: None,
            src: None,
            text: None,
            tooltip: None,
            value: None,
            value_text: None,
            virtual_range: None,
        },
        safe_area: None,
        schema: "threenative.ui".to_owned(),
        version: "0.1.0".to_owned(),
    };

    let report = report_native_ui_debug(&ui);
    let slider = report
        .nodes
        .iter()
        .find(|node| node.id == "volume")
        .unwrap();
    let disabled = report.nodes.iter().find(|node| node.id == "apply").unwrap();

    assert_eq!(slider.accesskit_role.as_deref(), Some("Slider"));
    assert_eq!(slider.accessible_name.as_deref(), Some("Volume"));
    assert_eq!(slider.focus_index, Some(0));
    assert_eq!(slider.bounds.width, 160.0);
    assert_eq!(
        slider.widget_state.as_ref().unwrap().value_text.as_deref(),
        Some("50 percent")
    );
    assert!(disabled.disabled);
    assert_eq!(disabled.accesskit_role.as_deref(), Some("Button"));
    assert_eq!(disabled.focus_index, None);
}
