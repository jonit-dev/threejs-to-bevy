use bevy_ecs::component::Component;

#[derive(Clone, Component, Debug, Eq, PartialEq)]
pub struct ThreeNativeId(pub String);
