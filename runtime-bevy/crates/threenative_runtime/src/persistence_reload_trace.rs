use std::{env, fs, path::PathBuf, process};

use threenative_loader::load_bundle;
use threenative_runtime::persistence_reload::{read_persistence_reload, write_persistence_reload};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let mode = args.next().ok_or("missing write/read mode")?;
    let bundle_path = args.next().ok_or("missing bundle path")?;
    let storage_root = PathBuf::from(args.next().ok_or("missing storage root")?);
    let output_path = PathBuf::from(args.next().ok_or("missing output path")?);
    if args.next().is_some() {
        return Err("too many arguments".into());
    }
    let mut bundle = load_bundle(bundle_path)?;
    let report = match mode.as_str() {
        "write" => write_persistence_reload(&mut bundle, &storage_root)?,
        "read" => read_persistence_reload(&mut bundle, &storage_root)?,
        _ => return Err(format!("unsupported persistence trace mode '{mode}'").into()),
    };
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(
        output_path,
        format!("{}\n", serde_json::to_string_pretty(&report)?),
    )?;
    Ok(())
}
