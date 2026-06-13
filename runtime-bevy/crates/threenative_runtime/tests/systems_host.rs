use std::{
    fs,
    path::{Path, PathBuf},
};

use threenative_loader::load_bundle;
use threenative_runtime::systems_host::{
    diagnose_native_system_host, ensure_native_system_host_supported,
};

#[test]
fn systems_host_should_report_unsupported_script_host() {
    let root = write_bundle("with-scripts", true);
    let bundle = load_bundle(&root).expect("scripted bundle should load");

    let diagnostics = diagnose_native_system_host(&bundle);
    let error = ensure_native_system_host_supported(&bundle).expect_err("script host should be gated");

    assert_eq!(diagnostics[0].code, "TN_BEVY_SYSTEM_HOST_UNSUPPORTED");
    assert_eq!(diagnostics[0].severity, "error");
    assert_eq!(diagnostics[0].system_id.as_deref(), Some("movePlayer"));
    assert!(diagnostics[0].message.contains("Native TypeScript system hosting is gated in V2"));
    assert_eq!(error.code, "TN_BEVY_SYSTEM_HOST_UNSUPPORTED");
}

#[test]
fn systems_host_should_allow_bundle_without_script_host() {
    let root = write_bundle("without-scripts", false);
    let bundle = load_bundle(&root).expect("bundle should load");

    assert!(diagnose_native_system_host(&bundle).is_empty());
    ensure_native_system_host_supported(&bundle).expect("bundle without scripts should run");
}

fn write_bundle(name: &str, with_scripts: bool) -> PathBuf {
    let root = std::env::temp_dir().join(format!("tn-systems-host-{name}-{}", std::process::id()));
    if root.exists() {
        fs::remove_dir_all(&root).expect("old temp bundle should be removed");
    }
    fs::create_dir_all(&root).expect("temp bundle should be created");
    write_json(
        &root,
        "manifest.json",
        if with_scripts {
            r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "systems-host",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json", "systems": "systems.ir.json", "scripts": "scripts.bundle.js" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#
        } else {
            r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "systems-host",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#
        },
    );
    write_json(
        &root,
        "world.ir.json",
        r#"{"schema":"threenative.world","version":"0.1.0","entities":[]}"#,
    );
    write_json(
        &root,
        "assets.manifest.json",
        r#"{"schema":"threenative.assets","version":"0.1.0","assets":[]}"#,
    );
    write_json(
        &root,
        "materials.ir.json",
        r#"{"schema":"threenative.materials","version":"0.1.0","materials":[]}"#,
    );
    write_json(
        &root,
        "target.profile.json",
        r#"{"schema":"threenative.target-profile","version":"0.1.0","targets":["desktop"]}"#,
    );
    if with_scripts {
        write_json(
            &root,
            "systems.ir.json",
            r#"{"schema":"threenative.systems","version":"0.1.0","systems":[{"name":"movePlayer"}]}"#,
        );
        fs::write(root.join("scripts.bundle.js"), "export const systems = Object.freeze({});\n")
            .expect("script bundle should be written");
    }
    root
}

fn write_json(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle file should be written");
}
