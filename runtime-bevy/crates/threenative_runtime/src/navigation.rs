use serde::{Deserialize, Serialize};
use threenative_loader::LoadedBundle;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationPathRequest {
    pub goal: [f32; 3],
    pub id: Option<String>,
    pub start: [f32; 3],
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationPathResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_reason: Option<String>,
    pub path: Vec<[f32; 3]>,
    pub query: String,
    pub status: String,
    pub total_cost: f32,
    pub visited_regions: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NavigationResource {
    #[serde(default)]
    area_costs: std::collections::BTreeMap<String, f32>,
    #[serde(default)]
    queries: Vec<NavigationPathRequest>,
    regions: Vec<NavigationRegion>,
}

#[derive(Clone, Debug, Deserialize)]
struct NavigationRegion {
    area: Option<String>,
    center: [f32; 3],
    id: String,
    #[serde(default)]
    neighbors: Vec<String>,
    points: Vec<[f32; 2]>,
}

pub fn trace_navigation_paths(bundle: &LoadedBundle) -> Vec<NavigationPathResult> {
    let Some(navigation) = navigation_resource(bundle) else {
        return Vec::new();
    };
    navigation
        .queries
        .iter()
        .enumerate()
        .map(|(index, request)| path_query(&navigation, request, request.id.clone().unwrap_or_else(|| format!("query-{index}"))))
        .collect()
}

pub fn query_navigation_path(bundle: &LoadedBundle, request: &NavigationPathRequest) -> NavigationPathResult {
    let Some(navigation) = navigation_resource(bundle) else {
        return NavigationPathResult {
            failure_reason: Some("no-route".to_owned()),
            path: Vec::new(),
            query: request.id.clone().unwrap_or_else(|| "query".to_owned()),
            status: "failed".to_owned(),
            total_cost: 0.0,
            visited_regions: Vec::new(),
        };
    };
    path_query(&navigation, request, request.id.clone().unwrap_or_else(|| "query".to_owned()))
}

fn navigation_resource(bundle: &LoadedBundle) -> Option<NavigationResource> {
    serde_json::from_value(bundle.world.resources.get("Navigation")?.clone()).ok()
}

fn path_query(navigation: &NavigationResource, request: &NavigationPathRequest, query: String) -> NavigationPathResult {
    let start = region_for_point(&navigation.regions, request.start);
    let Some(start_region) = start else {
        return failed(query, "start-outside", Vec::new());
    };
    let goal = region_for_point(&navigation.regions, request.goal);
    let Some(goal_region) = goal else {
        return failed(query, "goal-outside", vec![start_region.id.clone()]);
    };
    let route = shortest_route(navigation, &start_region.id, &goal_region.id);
    if route.is_empty() {
        return failed(query, "no-route", vec![start_region.id.clone()]);
    }
    let mut path = vec![round_vec3(request.start)];
    for id in route.iter().skip(1).take(route.len().saturating_sub(2)) {
        if let Some(region) = navigation.regions.iter().find(|region| &region.id == id) {
            path.push(round_vec3(region.center));
        }
    }
    path.push(round_vec3(request.goal));
    NavigationPathResult {
        failure_reason: None,
        path,
        query,
        status: "success".to_owned(),
        total_cost: round(route_cost(navigation, &route)),
        visited_regions: route,
    }
}

fn failed(query: String, reason: &str, visited_regions: Vec<String>) -> NavigationPathResult {
    NavigationPathResult {
        failure_reason: Some(reason.to_owned()),
        path: Vec::new(),
        query,
        status: "failed".to_owned(),
        total_cost: 0.0,
        visited_regions,
    }
}

fn shortest_route(navigation: &NavigationResource, start: &str, goal: &str) -> Vec<String> {
    let regions = navigation.regions.iter().map(|region| (region.id.clone(), region)).collect::<std::collections::BTreeMap<_, _>>();
    let mut costs = std::collections::BTreeMap::from([(start.to_owned(), 0.0)]);
    let mut previous = std::collections::BTreeMap::<String, String>::new();
    let mut queue = regions.keys().cloned().collect::<Vec<_>>();
    while !queue.is_empty() {
        queue.sort_by(|left, right| {
            costs
                .get(left)
                .unwrap_or(&f32::INFINITY)
                .partial_cmp(costs.get(right).unwrap_or(&f32::INFINITY))
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(left.cmp(right))
        });
        let current = queue.remove(0);
        if current == goal {
            break;
        }
        let Some(current_cost) = costs.get(&current).copied() else {
            continue;
        };
        let Some(region) = regions.get(&current) else {
            continue;
        };
        for neighbor in &region.neighbors {
            let Some(neighbor_region) = regions.get(neighbor) else {
                continue;
            };
            let candidate = current_cost + region_cost(navigation, neighbor_region);
            if candidate < *costs.get(neighbor).unwrap_or(&f32::INFINITY) {
                costs.insert(neighbor.clone(), candidate);
                previous.insert(neighbor.clone(), current.clone());
            }
        }
    }
    if !costs.contains_key(goal) {
        return Vec::new();
    }
    let mut route = vec![goal.to_owned()];
    while route.first().is_some_and(|id| id != start) {
        let Some(prior) = previous.get(route.first().unwrap()).cloned() else {
            return Vec::new();
        };
        route.insert(0, prior);
    }
    route
}

fn route_cost(navigation: &NavigationResource, route: &[String]) -> f32 {
    route
        .iter()
        .skip(1)
        .filter_map(|id| navigation.regions.iter().find(|region| &region.id == id))
        .map(|region| region_cost(navigation, region))
        .sum()
}

fn region_cost(navigation: &NavigationResource, region: &NavigationRegion) -> f32 {
    navigation.area_costs.get(region.area.as_deref().unwrap_or("default")).copied().unwrap_or(1.0)
}

fn region_for_point(regions: &[NavigationRegion], point: [f32; 3]) -> Option<&NavigationRegion> {
    let mut ordered = regions.iter().collect::<Vec<_>>();
    ordered.sort_by(|left, right| left.id.cmp(&right.id));
    ordered.into_iter().find(|region| point_in_polygon([point[0], point[2]], &region.points))
}

fn point_in_polygon(point: [f32; 2], polygon: &[[f32; 2]]) -> bool {
    let mut inside = false;
    let mut previous = polygon.len() - 1;
    for index in 0..polygon.len() {
        let current = polygon[index];
        let prior = polygon[previous];
        let intersects = ((current[1] > point[1]) != (prior[1] > point[1]))
            && point[0] < (prior[0] - current[0]) * (point[1] - current[1]) / (prior[1] - current[1]) + current[0];
        if intersects {
            inside = !inside;
        }
        previous = index;
    }
    inside
}

fn round_vec3(value: [f32; 3]) -> [f32; 3] {
    [round(value[0]), round(value[1]), round(value[2])]
}

fn round(value: f32) -> f32 {
    (value * 1_000_000.0).round() / 1_000_000.0
}
