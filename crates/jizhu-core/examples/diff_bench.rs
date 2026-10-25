//! 5k 行 Diff 基准：cargo run --release -p jizhu-core --example diff_bench

use jizhu_core::diff::{diff_json, diff_text, DiffOptions};
use std::time::Instant;

fn main() {
    let mut text_a = String::new();
    let mut text_b = String::new();
    for index in 0..5_000 {
        text_a.push_str(&format!("line {index:05} value {}", index % 97));
        text_a.push('\n');
        let changed = index % 100 == 0;
        text_b.push_str(&format!(
            "line {index:05} value {}",
            if changed {
                (index % 97) + 1
            } else {
                index % 97
            }
        ));
        text_b.push('\n');
    }

    let started = Instant::now();
    let text = diff_text(&text_a, &text_b, &DiffOptions::default());
    let text_ms = started.elapsed().as_secs_f64() * 1000.0;
    println!(
        "text 5k lines: {:.2} ms, rows={}, differences={}",
        text_ms,
        text.rows.len(),
        text.stats.differences
    );

    let mut items_a = Vec::with_capacity(5_000);
    let mut items_b = Vec::with_capacity(5_000);
    for index in 0..5_000 {
        items_a.push(serde_json::json!({
            "id": index,
            "name": format!("user-{index}"),
            "active": index % 2 == 0,
            "score": index % 100,
        }));
        items_b.push(serde_json::json!({
            "id": index,
            "name": format!("user-{index}"),
            "active": index % 2 == 0,
            "score": if index % 100 == 0 { (index % 100) + 1 } else { index % 100 },
        }));
    }
    let json_a = serde_json::json!({ "items": items_a }).to_string();
    let json_b = serde_json::json!({ "items": items_b }).to_string();

    let started = Instant::now();
    let json = diff_json(&json_a, &json_b, &DiffOptions::default()).expect("json diff");
    let json_ms = started.elapsed().as_secs_f64() * 1000.0;
    println!(
        "json 5k items: {:.2} ms, bytes={}x2, rows={}, differences={}",
        json_ms,
        json_a.len(),
        json.rows.len(),
        json.stats.differences
    );
}
