export interface MermaidExample {
  id: string
  label: string
  english: string
  description: string
  category?: '基础' | '真实场景'
  code: string
}

export const MERMAID_EXAMPLES: MermaidExample[] = [
  {
    id: 'flowchart',
    label: '流程图',
    english: 'Flowchart',
    description: '节点、分支与子图',
    code: `flowchart LR
  editor[编辑器] --> parser{Mermaid 解析}
  parser -->|成功| svg[SVG 预览]
  parser -->|失败| error[错误信息]
  subgraph workspace[工作台]
    editor
    svg
  end`,
  },
  {
    id: 'sequence',
    label: '时序图',
    english: 'Sequence',
    description: '参与者、消息与注释',
    code: `sequenceDiagram
  autonumber
  participant U as 用户
  participant A as Mermaid
  U->>A: 输入 diagram 源码
  A-->>U: 返回 SVG
  Note right of A: 本地渲染
  U->>A: 切换主题
  A-->>U: 重新着色`,
  },
  {
    id: 'class',
    label: '类图',
    english: 'Class',
    description: '类、属性与关系',
    code: `classDiagram
  class Editor {
    +String text
    +render()
  }
  class Preview {
    +String svg
    +zoom(percent)
  }
  Editor --> Preview : source
  Preview --> Theme : colors`,
  },
  {
    id: 'state',
    label: '状态图',
    english: 'State',
    description: '状态迁移',
    code: `stateDiagram-v2
  [*] --> Empty
  Empty --> Plain: type
  Plain --> JSON: paste object
  JSON --> Plain: clear
  JSON --> [*]: close`,
  },
  {
    id: 'er',
    label: 'ER 图',
    english: 'ER',
    description: '实体关系与字段',
    code: `erDiagram
  USER ||--o{ SESSION : owns
  USER {
    string id
    string name
  }
  SESSION {
    string token
    string device
  }`,
  },
  {
    id: 'gantt',
    label: '甘特图',
    english: 'Gantt',
    description: '任务与时间线',
    code: `gantt
  title jizhu release plan
  dateFormat YYYY-MM-DD
  section Build
  UI polish :a1, 2026-11-01, 5d
  Mermaid :after a1, 2d
  section Ship
  Release :2026-11-20, 1d`,
  },
  {
    id: 'pie',
    label: '饼图',
    english: 'Pie',
    description: '比例分布',
    code: `pie title Tool usage
  "JSON" : 45
  "Diff" : 20
  "Regex" : 15
  "Mermaid" : 10
  "Other" : 10`,
  },
  {
    id: 'mindmap',
    label: '思维导图',
    english: 'Mindmap',
    description: '层级主题',
    code: `mindmap
  root((jizhu))
    Editor
      Plain
      JSON
      Calc
    Tools
      Mermaid
      Diff
      Regex`,
  },
  {
    id: 'journey',
    label: '用户旅程',
    english: 'Journey',
    description: '步骤与体验分数',
    code: `journey
  title Editor workflow
  section Open
    Paste source: 5: User
    Preview diagram: 4: User
    Switch theme: 5: User
  section Share
    Copy SVG: 4: User`,
  },
  {
    id: 'gitgraph',
    label: 'Git 图',
    english: 'GitGraph',
    description: '分支、提交与合并',
    code: `gitGraph
  commit id: "init"
  branch feature
  commit id: "mermaid"
  checkout main
  commit id: "release"
  merge feature`,
  },
  {
    id: 'quadrant',
    label: '象限图',
    english: 'Quadrant',
    description: '四象限定位',
    code: `quadrantChart
  title Feature complexity
  x-axis Low --> High
  y-axis Simple --> Complex
  quadrant-1 Build
  quadrant-2 Explore
  quadrant-3 Keep plain
  quadrant-4 Automate
  Mermaid: [0.78, 0.82]
  JSON: [0.45, 0.65]`,
  },
  {
    id: 'requirement',
    label: '需求图',
    english: 'Requirement',
    description: '需求、风险与验证',
    code: `requirementDiagram
  requirement render {
    id: 1
    text: render Mermaid locally
    risk: medium
    verifymethod: test
  }
  element preview {
    type: simulation
  }
  preview - satisfies -> render`,
  },
  {
    id: 'timeline',
    label: '时间线',
    english: 'Timeline',
    description: '里程碑与阶段',
    code: `timeline
  title jizhu milestones
  2026-10 : Tiling workspace
  2026-11 : Mermaid preview
  2026-11 : Quick commands`,
  },
  {
    id: 'xychart',
    label: 'XY 图表',
    english: 'XYChart',
    description: '柱状图与折线',
    code: `xychart-beta
  title "Tool usage"
  x-axis [JSON, Diff, Regex, Mermaid]
  y-axis "Count" 0 --> 50
  bar [45, 20, 15, 10]
  line [45, 20, 15, 10]`,
  },
  {
    id: 'c4',
    label: 'C4 架构图',
    english: 'C4',
    description: '系统上下文',
    code: `C4Context
  title jizhu system context
  Person(user, "User")
  System(editor, "jizhu", "Local editor and tools")
  Rel(user, editor, "uses")`,
  },
  {
    id: 'sankey',
    label: '桑基图',
    english: 'Sankey',
    description: '数据流向',
    code: `sankey-beta
  Editor,JSON,40
  Editor,Diff,20
  Editor,Regex,15
  JSON,Mermaid,10`,
  },

  {
    id: 'api-sequence',
    label: 'API 请求链路',
    english: 'API request flow',
    description: '鉴权、缓存、数据库与失败分支',
    category: '真实场景',
    code: `sequenceDiagram
  autonumber
  actor U as User
  participant W as Web
  participant G as API Gateway
  participant A as Auth
  participant C as Cache
  participant D as Database
  U->>W: Submit order
  W->>G: POST /orders
  G->>A: Validate token
  alt Invalid token
    A-->>G: 401
    G-->>W: Unauthorized
  else Valid
    G->>C: Read quota
    alt Cache hit
      C-->>G: Quota
    else Cache miss
      G->>D: Read quota
      D-->>C: Fill cache
    end
    G->>D: Create order
    D-->>G: Order id
    G-->>W: 201 Created
  end`,
  },
  {
    id: 'ci-release',
    label: 'CI/CD 发布流程',
    english: 'Release pipeline',
    description: '测试、审计、灰度与回滚',
    category: '真实场景',
    code: `flowchart TD
  dev[Developer push] --> pr{Pull request}
  pr --> lint[Lint]
  lint --> test[Test]
  test --> build[Release build]
  build --> audit{Security audit}
  audit -->|Failed| block[Block release]
  audit -->|Passed| sign[Notarize]
  sign --> canary[Canary 10%]
  canary --> monitor{Error rate}
  monitor -->|Healthy| prod[Rollout 100%]
  monitor -->|Too high| rollback[Rollback]
  subgraph gates[Release gates]
    lint
    test
    build
    audit
    sign
  end`,
  },
  {
    id: 'order-state',
    label: '订单状态机',
    english: 'Order lifecycle',
    description: '支付、履约、退款与取消',
    category: '真实场景',
    code: `stateDiagram-v2
  [*] --> PendingPayment
  PendingPayment --> Paid: payment success
  PendingPayment --> Cancelled: timeout
  Paid --> Processing: stock reserved
  Processing --> Shipped: packed
  Shipped --> Delivered: carrier delivered
  Delivered --> Returned: return accepted
  Processing --> Refunded: out of stock
  Paid --> Refunded: cancel requested
  Cancelled --> [*]
  Refunded --> [*]
  Returned --> [*]`,
  },
  {
    id: 'ecommerce-er',
    label: '电商 ER 模型',
    english: 'E-commerce ER',
    description: '客户、订单、明细与商品关系',
    category: '真实场景',
    code: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : sold_as
  CUSTOMER {
    uuid id PK
    string email
    string name
  }
  ORDER {
    uuid id PK
    datetime created_at
    string status
  }
  ORDER_ITEM {
    int quantity
    decimal unit_price
  }
  PRODUCT {
    uuid id PK
    string sku
    decimal price
  }`,
  },
  {
    id: 'domain-class',
    label: '领域模型类图',
    english: 'Domain model',
    description: '聚合、实体与服务依赖',
    category: '真实场景',
    code: `classDiagram
  class Order {
    +UUID id
    +Money total
    +place()
    +cancel()
  }
  class OrderItem {
    +int quantity
  }
  class Customer {
    +UUID id
    +String email
  }
  class Payment {
    +Money amount
    +capture()
  }
  class Shipment {
    +String tracking
  }
  class InventoryService {
    +reserve()
  }
  Customer "1" --> "*" Order
  Order "1" *-- "1..*" OrderItem
  Order "1" --> "0..1" Payment
  Order "1" --> "0..1" Shipment
  Order ..> InventoryService`,
  },
  {
    id: 'release-gantt',
    label: '季度发布计划',
    english: 'Release plan',
    description: '阶段、依赖与发布里程碑',
    category: '真实场景',
    code: `gantt
  title Q4 release plan
  dateFormat YYYY-MM-DD
  axisFormat %m-%d
  section Discovery
  API contract :done, a1, 2026-10-01, 7d
  Design review :milestone, m1, after a1, 0d
  section Build
  Core service :active, b1, 2026-10-10, 14d
  Frontend :b2, after b1, 10d
  section QA
  Regression :c1, 2026-11-05, 5d
  Release :milestone, m2, 2026-11-12, 0d`,
  },
  {
    id: 'release-gitgraph',
    label: '发布与热修复分支',
    english: 'Release branches',
    description: '主干、release 与 hotfix 合并',
    category: '真实场景',
    code: `gitGraph
  commit id: "v1.0"
  branch release/1.0
  commit id: "rc1"
  checkout main
  branch feature/mermaid
  commit id: "mermaid"
  checkout main
  merge feature/mermaid
  commit id: "v1.1"
  checkout release/1.0
  branch hotfix/auth
  commit id: "fix auth"
  checkout release/1.0
  merge hotfix/auth`,
  },
  {
    id: 'architecture-c4',
    label: '桌面应用架构',
    english: 'C4 container',
    description: 'UI、Rust core、本地存储与外部请求',
    category: '真实场景',
    code: `C4Container
  title jizhu desktop architecture
  Person(user, "User")
  System_Boundary(app, "jizhu desktop") {
    Container(editor, "Editor UI", "React", "Editing and tool panels")
    Container(core, "Tauri core", "Rust", "Commands and workers")
    ContainerDb(local, "Local state", "WebView storage", "Tabs and settings")
  }
  System_Ext(target, "cURL target", "Explicit HTTP target")
  Rel(user, editor, "uses")
  Rel(editor, core, "invoke")
  Rel(core, local, "read / write")
  Rel(core, target, "explicit cURL")`,
  },
  {
    id: 'funnel-sankey',
    label: '用户转化漏斗',
    english: 'Acquisition funnel',
    description: '访问、注册、激活与留存流向',
    category: '真实场景',
    code: `sankey-beta
  Landing,Signup,600
  Landing,Docs,300
  Signup,Onboarding,420
  Signup,Churn,180
  Onboarding,Active,360
  Active,Team,220
  Active,Personal,120`,
  },
  {
    id: 'prioritization-quadrant',
    label: '需求优先级矩阵',
    english: 'Priority matrix',
    description: '收益与成本四象限',
    category: '真实场景',
    code: `quadrantChart
  title Feature prioritization
  x-axis Low effort --> High effort
  y-axis Low impact --> High impact
  quadrant-1 Strategic
  quadrant-2 Quick wins
  quadrant-3 Later
  quadrant-4 Avoid
  Mermaid: [0.72, 0.84]
  Diff: [0.35, 0.62]
  PlantUML: [0.90, 0.70]
  Themes: [0.22, 0.55]`,
  },
  {
    id: 'incident-timeline',
    label: '故障响应时间线',
    english: 'Incident timeline',
    description: '告警、回滚、恢复与复盘',
    category: '真实场景',
    code: `timeline
  title API outage response
  09h05 : Alert - error rate spike
  09h08 : On-call acknowledged
  09h15 : Rollback started
  09h22 : Error rate normal
  10h00 : Root cause review
  12h00 : Postmortem draft`,
  },
  {
    id: 'onboarding-journey',
    label: '新用户上手旅程',
    english: 'Onboarding journey',
    description: '首次启动、探索与分享体验',
    category: '真实场景',
    code: `journey
  title New user onboarding
  section First launch
    Open app: 5: User
    Paste JSON: 5: User
    Switch JSON mode: 4: User
  section Explore
    Open Mermaid: 4: User
    Pick example: 5: User
    Copy SVG: 4: User`,
  },
]
