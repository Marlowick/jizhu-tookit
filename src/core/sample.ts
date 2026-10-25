// 与设计稿 03 页一致的示例数据，用于欢迎页进入 JSON 编辑器时的演示
export const SAMPLE_JSON = `{
  "users": [
    { "id": 1, "name": "Ada", "age": 32 },
    { "id": 2, "name": "Bob", "age": 17 },
    { "id": 3, "name": "Coco", "age": 25 }
  ],
  "version": "1.4.0",
  "debug": true,
  "maxConn": 128,
  "paths": { "home": "/usr", "tmp": "/tmp" }
}
`

export const SAMPLE_JSONL = `{"user":"ada","score":91,"tags":["a","b"]}
{"user":"bob","score":72,"tags":["b"]}
{"user":"ada","score":88,"tags":["a"]}
`

export const SAMPLE_JQ_EXPR = 'select(.score > 80) | .user'

export const SAMPLE_REGEX_TEXT = `[2025-06-11 16:00:01] INFO user ada@example.com logged in
[2025-06-11 16:00:03] WARN retry connection 10.0.0.8
[2025-06-11 16:00:05] INFO invite sent to coco@example.com
[2025-06-11 16:00:09] ERROR timeout after 3000 ms
[2025-06-11 16:00:12] INFO user bob@example.com logged in
[2025-06-11 16:00:18] INFO token refreshed for ada@example.com
[2025-06-11 16:00:24] WARN rate limit near for bob@example.com
[2025-06-11 16:00:31] INFO session closed ada@example.com
`

export const SAMPLE_REGEX_PATTERN = String.raw`(\w+)@([\w.-]+)`
