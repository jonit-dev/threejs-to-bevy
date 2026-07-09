use std::path::PathBuf;

use threenative_loader::{load_bundle, LoadedBundle};

pub struct SharedFixture {
    pub bundle: LoadedBundle,
    pub bundle_path: PathBuf,
    pub name: String,
}

pub fn load_conformance_fixture(name: &str) -> SharedFixture {
    let bundle_path = conformance_fixture_path(name);
    let bundle = load_bundle(&bundle_path).unwrap_or_else(|error| {
        panic!(
            "failed to load conformance fixture '{}' at '{}': {}",
            name,
            bundle_path.display(),
            error
        )
    });

    SharedFixture {
        bundle,
        bundle_path,
        name: name.to_owned(),
    }
}

pub fn conformance_fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/ir/fixtures/conformance")
        .join(name)
        .join("game.bundle")
}
