use std::collections::{BTreeMap, BTreeSet};

use serde_json::{Value, json};
use threenative_loader::{LoadedBundle, TransformComponent};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NativePresentationRuntimeState {
    pub elapsed: f32,
    pub logs: Vec<NativePresentationLog>,
    shakes: Vec<NativeShake>,
    tweens: BTreeMap<String, NativeTween>,
    world_text_origins: BTreeMap<String, [f32; 3]>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativePresentationLog {
    pub at: f32,
    pub entity: Option<String>,
    pub id: String,
    pub kind: String,
    pub property: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
struct NativeTween {
    direction: f32,
    duration: f32,
    elapsed: f32,
    easing: String,
    entity: String,
    from: Vec<f32>,
    id: String,
    loops: u32,
    property: String,
    to: Vec<f32>,
    yoyo: bool,
}

#[derive(Clone, Debug, PartialEq)]
struct NativeShake {
    amplitude: f32,
    camera: Option<String>,
    duration: f32,
    elapsed: f32,
    frequency: f32,
    seed: f32,
}

impl NativePresentationRuntimeState {
    pub fn ingest_logs(&mut self, bundle: &mut LoadedBundle, logs: &[crate::systems_effects::NativeSystemEffectLog]) {
        for log in logs {
            for entry in &log.entries {
                if entry.command.as_deref() == Some("tween") {
                    self.enqueue_tween(bundle, entry.entity.as_deref(), entry.value.as_ref());
                }
                if entry.command.as_deref() == Some("despawn") {
                    if let Some(entity) = entry.entity.as_deref() {
                        self.cancel_entity(entity);
                    }
                }
                if entry.service.as_deref() == Some("camera.shake") {
                    self.enqueue_shake(entry.payload.as_ref());
                }
                if entry.service.as_deref() == Some("effects.play") {
                    self.enqueue_feedback_shake(entry.payload.as_ref());
                }
            }
        }
    }

    pub fn step(&mut self, bundle: &mut LoadedBundle, delta: f32) {
        let delta = delta.clamp(0.0, 0.25);
        self.elapsed += delta;
        self.step_tweens(bundle, delta);
        self.step_world_text(bundle, delta);
        for shake in &mut self.shakes {
            shake.elapsed += delta;
        }
        self.shakes.retain(|shake| shake.elapsed < shake.duration);
    }

    pub fn shake_trace(&self) -> Vec<(f32, f32)> {
        self.shakes.iter().map(|shake| (shake.elapsed, envelope(shake.elapsed, shake.duration))).collect()
    }

    fn enqueue_tween(&mut self, bundle: &mut LoadedBundle, entity: Option<&str>, value: Option<&Value>) {
        let Some(entity) = entity else { return };
        let Some(value) = value.and_then(Value::as_object) else { return };
        let property = value.get("property").and_then(Value::as_str).unwrap_or_default().to_owned();
        if !matches!(property.as_str(), "position" | "rotation" | "scale" | "opacity" | "emissiveIntensity") {
            return;
        }
        let expected = match property.as_str() { "rotation" => 4, "position" | "scale" => 3, _ => 1 };
        let to = value.get("to").map(read_values).unwrap_or_default();
        if to.len() != expected || !to.iter().all(|number| number.is_finite()) {
            return;
        }
        let from = read_native_value(bundle, entity, &property);
        if from.len() != expected {
            return;
        }
        let id = value.get("id").and_then(Value::as_str).unwrap_or_else(|| "native-tween").to_owned();
        let key = format!("{entity}\0{property}");
        if let Some(previous) = self.tweens.remove(&key) {
            self.push_log("cancel", Some(previous.entity), previous.id, Some(previous.property));
        }
        let tween = NativeTween {
            direction: 1.0,
            duration: value.get("duration").and_then(Value::as_f64).unwrap_or(0.0).clamp(0.0, 10.0) as f32,
            elapsed: 0.0,
            easing: value.get("easing").and_then(Value::as_str).unwrap_or("linear").to_owned(),
            entity: entity.to_owned(),
            from,
            id: id.clone(),
            loops: value.get("loops").and_then(Value::as_u64).unwrap_or(0).min(8) as u32,
            property: property.clone(),
            to,
            yoyo: value.get("yoyo").and_then(Value::as_bool).unwrap_or(false),
        };
        self.push_log("start", Some(entity.to_owned()), id.clone(), Some(property.clone()));
        if tween.duration == 0.0 {
            let mut immediate = tween.clone();
            apply_tween(bundle, &mut immediate, 1.0);
            self.push_log("complete", Some(entity.to_owned()), id, Some(property));
        } else {
            self.tweens.insert(key, tween);
        }
    }

    fn step_tweens(&mut self, bundle: &mut LoadedBundle, delta: f32) {
        let mut completed = Vec::new();
        for (key, tween) in &mut self.tweens {
            if bundle.world.entities.iter().all(|entity| entity.id != tween.entity) {
                completed.push((key.clone(), "cancel".to_owned(), tween.entity.clone(), tween.id.clone(), tween.property.clone()));
                continue;
            }
            tween.elapsed += delta;
            let progress = if tween.duration <= 0.0 { 1.0 } else { (tween.elapsed / tween.duration).clamp(0.0, 1.0) };
            let eased = ease(progress, &tween.easing);
            apply_tween(bundle, tween, if tween.direction > 0.0 { eased } else { 1.0 - eased });
            if progress >= 1.0 {
                if tween.loops > 0 {
                    tween.loops -= 1;
                    tween.elapsed = 0.0;
                    if tween.yoyo { tween.direction *= -1.0; }
                } else {
                    completed.push((key.clone(), "complete".to_owned(), tween.entity.clone(), tween.id.clone(), tween.property.clone()));
                }
            }
        }
        for (key, kind, entity, id, property) in completed {
            self.tweens.remove(&key);
            self.push_log(&kind, Some(entity), id, Some(property));
        }
    }

    fn step_world_text(&mut self, bundle: &mut LoadedBundle, delta: f32) {
        let mut expired = BTreeSet::new();
        let positions = bundle.world.entities.iter().map(|entity| {
            (entity.id.clone(), entity.components.transform.as_ref().and_then(|transform| transform.position).unwrap_or([0.0, 0.0, 0.0]))
        }).collect::<BTreeMap<_, _>>();
        for entity in &mut bundle.world.entities {
            let Some(text) = entity.components.world_text.as_mut() else { continue };
            let origin = *self.world_text_origins.entry(entity.id.clone()).or_insert_with(|| positions.get(&entity.id).copied().unwrap_or([0.0, 0.0, 0.0]));
            text.elapsed = Some(text.elapsed.unwrap_or(0.0) + delta);
            if text.lifetime.is_some_and(|lifetime| text.elapsed.unwrap_or(0.0) >= lifetime) {
                expired.insert(entity.id.clone());
                continue;
            }
            let target = text.target.as_ref().and_then(|target| positions.get(target)).copied().unwrap_or(origin);
            let offset = text.offset.unwrap_or([0.0, 0.0, 0.0]);
            let progress = text.lifetime.map_or(1.0, |lifetime| (text.elapsed.unwrap_or(0.0) / lifetime.max(0.0001)).clamp(0.0, 1.0));
            let position = [target[0] + offset[0], target[1] + offset[1] + text.float_distance.unwrap_or(0.0) * progress, target[2] + offset[2]];
            let transform = entity.components.transform.get_or_insert(TransformComponent { position: None, rotation: None, scale: None });
            transform.position = Some(position);
        }
        if !expired.is_empty() {
            bundle.world.entities.retain(|entity| !expired.contains(&entity.id));
        }
    }

    fn enqueue_shake(&mut self, payload: Option<&Value>) {
        let request = payload.and_then(|payload| payload.get("request")).unwrap_or(&Value::Null);
        let result = payload.and_then(|payload| payload.get("result"));
        if result.and_then(|result| result.get("accepted")).and_then(Value::as_bool) == Some(false) { return; }
        self.shakes.push(NativeShake {
            amplitude: number(request, "amplitude", 0.08).clamp(0.0, 2.0),
            camera: request.get("camera").and_then(Value::as_str).map(str::to_owned),
            duration: number(request, "duration", 0.15).clamp(0.0, 5.0),
            elapsed: 0.0,
            frequency: number(request, "frequency", 24.0).clamp(0.0, 120.0),
            seed: request.get("seed").map(seed_value).unwrap_or(0.0),
        });
    }

    fn enqueue_feedback_shake(&mut self, payload: Option<&Value>) {
        let Some(camera) = payload.and_then(|payload| payload.get("camera")) else { return };
        self.enqueue_shake(Some(&json!({ "request": camera, "result": { "accepted": true } })));
    }

    fn cancel_entity(&mut self, entity: &str) {
        let keys = self.tweens.iter().filter_map(|(key, tween)| (tween.entity == entity).then_some(key.clone())).collect::<Vec<_>>();
        for key in keys {
            if let Some(tween) = self.tweens.remove(&key) {
                self.push_log("cancel", Some(entity.to_owned()), tween.id, Some(tween.property));
            }
        }
    }

    fn push_log(&mut self, kind: &str, entity: Option<String>, id: String, property: Option<String>) {
        self.logs.push(NativePresentationLog { at: self.elapsed, entity, id, kind: kind.to_owned(), property });
        if self.logs.len() > 512 { let overflow = self.logs.len() - 512; self.logs.drain(0..overflow); }
    }
}

fn apply_tween(bundle: &mut LoadedBundle, tween: &NativeTween, progress: f32) {
    let Some(entity) = bundle.world.entities.iter_mut().find(|entity| entity.id == tween.entity) else { return };
    if tween.property == "position" || tween.property == "scale" {
        let transform = entity.components.transform.get_or_insert(TransformComponent { position: None, rotation: None, scale: None });
        let value = lerp_values(&tween.from, &tween.to, progress);
        if tween.property == "position" { transform.position = value.try_into().ok(); } else { transform.scale = value.try_into().ok(); }
    } else if tween.property == "rotation" {
        let transform = entity.components.transform.get_or_insert(TransformComponent { position: None, rotation: None, scale: None });
        transform.rotation = Some(slerp_quaternion(tween.from.as_slice(), tween.to.as_slice(), progress));
    }
}

fn read_native_value(bundle: &LoadedBundle, entity: &str, property: &str) -> Vec<f32> {
    let Some(entity) = bundle.world.entities.iter().find(|candidate| candidate.id == entity) else { return Vec::new() };
    match property {
        "position" => entity.components.transform.as_ref().and_then(|transform| transform.position).unwrap_or([0.0, 0.0, 0.0]).to_vec(),
        "scale" => entity.components.transform.as_ref().and_then(|transform| transform.scale).unwrap_or([1.0, 1.0, 1.0]).to_vec(),
        "rotation" => entity.components.transform.as_ref().and_then(|transform| transform.rotation).unwrap_or([0.0, 0.0, 0.0, 1.0]).to_vec(),
        _ => Vec::new(),
    }
}

fn lerp_values(from: &[f32], to: &[f32], progress: f32) -> Vec<f32> { from.iter().zip(to).map(|(from, to)| *from + (*to - *from) * progress).collect() }

fn slerp_quaternion(from: &[f32], target: &[f32], progress: f32) -> [f32; 4] {
    let mut to = [target[0], target[1], target[2], target[3]];
    let mut dot = from.iter().zip(to).map(|(left, right)| left * right).sum::<f32>();
    if dot < 0.0 { to = [-to[0], -to[1], -to[2], -to[3]]; dot = -dot; }
    if dot > 0.9995 { return normalize_quaternion(lerp_values(from, &to, progress).try_into().unwrap_or([0.0, 0.0, 0.0, 1.0])); }
    let theta = dot.clamp(-1.0, 1.0).acos();
    let sin_theta = theta.sin();
    let left = ((1.0 - progress) * theta).sin() / sin_theta;
    let right = (progress * theta).sin() / sin_theta;
    normalize_quaternion([from[0] * left + to[0] * right, from[1] * left + to[1] * right, from[2] * left + to[2] * right, from[3] * left + to[3] * right])
}

fn normalize_quaternion(value: [f32; 4]) -> [f32; 4] { let length = value.iter().map(|component| component * component).sum::<f32>().sqrt().max(0.000001); [value[0] / length, value[1] / length, value[2] / length, value[3] / length] }

fn ease(value: f32, easing: &str) -> f32 { match easing { "ease-in" => value * value, "ease-out" => 1.0 - (1.0 - value) * (1.0 - value), "ease-in-out" => if value < 0.5 { 2.0 * value * value } else { 1.0 - (-2.0 * value + 2.0).powi(2) / 2.0 }, _ => value } }

fn envelope(elapsed: f32, duration: f32) -> f32 { if duration <= 0.0 { 0.0 } else { (1.0 - elapsed.max(0.0) / duration).max(0.0) } }
fn read_values(value: &Value) -> Vec<f32> { value.as_array().map(|values| values.iter().filter_map(Value::as_f64).map(|value| value as f32).collect()).unwrap_or_else(|| value.as_f64().map(|value| vec![value as f32]).unwrap_or_default()) }
fn number(value: &Value, key: &str, fallback: f32) -> f32 { value.get(key).and_then(Value::as_f64).map(|value| value as f32).unwrap_or(fallback) }
fn seed_value(value: &Value) -> f32 { value.as_f64().map(|value| value as f32).unwrap_or_else(|| value.as_str().map(|value| value.bytes().map(f32::from).sum::<f32>()).unwrap_or(0.0)) }

#[cfg(test)]
mod tests {
    use super::{ease, envelope, slerp_quaternion};

    #[test]
    fn tween_easing_and_shortest_rotation_are_deterministic() {
        assert!((ease(0.5, "ease-out") - 0.75).abs() < 0.0001);
        let rotation = slerp_quaternion(&[0.0, 0.0, 0.0, 1.0], &[0.0, 0.0, 0.0, -1.0], 0.5);
        assert!((rotation[3] - 1.0).abs() < 0.0001);
    }

    #[test]
    fn shake_envelope_uses_elapsed_delta() {
        assert!((envelope(0.05, 0.2) - 0.75).abs() < 0.0001);
        assert_eq!(envelope(0.2, 0.2), 0.0);
    }
}
