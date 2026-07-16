const r = (title, points, visual, needs = [], alternatives = []) => ({
  title,
  points,
  visual,
  needs,
  alternatives
});

const v = (kind, description, scene, ai = false) => ({ kind, description, scene, ai });

const common = {
  cover: r(
    "{topic}：主题与分析框架",
    [
      "明确主题：{topic}",
      "交付形式：结构化 PPT 策划提纲",
      "内容边界：只使用客户提供资料，不补造数据和案例",
      "阅读路径：从背景与分析框架进入，最终落到可执行建议"
    ],
    v("ai-cover", "右侧主题主视觉，左侧标题与副标题留白", "行业主题封面主视觉", true),
    [],
    [v("ai-cover-split", "上方标题留白，下方使用横向主题场景图", "横向行业场景封面", true)]
  ),
  closing: r(
    "结论与下一步",
    [
      "汇总前文需要验证的核心判断，不把分析假设写成事实结论",
      "按业务影响和实施难度排列优先动作",
      "明确资料补充、分析更新和内部确认的责任顺序",
      "数据到位后更新图表、结论与行动建议"
    ],
    v("roadmap", "三阶段行动路线图：资料补齐、分析验证、方案落地", "三阶段行动路线图"),
    ["orders", "survey", "interviews"],
    [v("checklist", "四列行动清单：任务、输入、负责人、交付物", "行动清单")]
  )
};

const personaRecipes = {
  cover: { ...common.cover, title: "{topic}：客户画像分析" },
  dataBasis: r(
    "分析目标与数据基础",
    [
      "分析目标：识别核心客群、主要需求和影响决策的关键环节",
      "分析维度：人口属性、地域、预算偏好、使用场景与信息渠道",
      "数据口径：统一订单、问卷、访谈和渠道线索的时间范围与字段定义",
      "输出边界：当前先建立分析框架，数据到位后再形成事实结论"
    ],
    v("source-funnel", "四层数据来源漏斗：订单、问卷、访谈、渠道线索", "数据来源漏斗"),
    ["orders", "survey", "interviews", "leads"],
    [v("data-stack", "四层数据基础堆叠图，标注来源、字段和用途", "数据基础堆叠图")]
  ),
  sampleOverview: r(
    "市场与样本概览",
    [
      "样本范围：按目标市场、时间周期和客户来源界定分析对象",
      "市场切片：比较城市级别、区域和渠道来源的样本覆盖",
      "预算切片：建立价格区间与产品选择的交叉分析框架",
      "样本校验：检查重复记录、缺失字段和渠道偏差"
    ],
    v("map-bar", "左侧城市分布地图，右侧预算区间柱状图", "城市分布地图与预算柱状图"),
    ["sampleSize", "region", "budget", "channels"],
    [v("sample-dashboard", "上方样本来源条形图，下方地域覆盖热力表", "样本概览仪表板")]
  ),
  segments: r(
    "核心用户分群",
    [
      "分群轴一：预算承受能力与价格敏感度",
      "分群轴二：使用场景与功能偏好",
      "分群轴三：购买动机、决策周期与信息依赖",
      "每个分群记录典型特征、主要诉求、阻碍因素和触达方式"
    ],
    v("persona-cards", "三张 PPT 原生用户画像卡片：插画头像、特征、需求、障碍、触点", "统一风格插画头像与用户画像卡片"),
    ["ageIncome", "budget", "motivation", "scenarios"],
    [v("segment-matrix", "预算敏感度 × 使用需求二维分群矩阵", "二维用户分群矩阵")]
  ),
  needsJourney: r(
    "需求、痛点与决策路径",
    [
      "需求层：基础使用、体验提升、身份表达和长期成本",
      "痛点层：信息不透明、方案比较困难、试用体验不足和决策风险",
      "决策路径：认知、比较、体验、咨询、购买与使用反馈",
      "关键验证：记录各阶段流失原因、影响人和所需证据"
    ],
    v("radar-matrix", "左侧需求雷达图，右侧痛点优先级矩阵", "需求雷达与痛点矩阵"),
    ["survey", "interviews", "conversion"],
    [v("decision-journey", "六阶段客户决策旅程图，标出阻碍与证据需求", "客户决策旅程图")]
  ),
  implications: r(
    "业务启示与下一步",
    [
      "产品启示：把高频需求映射到功能、版本和服务组合",
      "营销启示：按分群调整内容主题、价值表达和证明材料",
      "渠道启示：依据决策阶段配置内容、顾问和体验触点",
      "下一步：补齐资料、验证分群、形成画像卡并进入小范围测试"
    ],
    v("roadmap", "产品、营销、渠道三条泳道的阶段路线图", "三泳道业务行动路线图"),
    ["orders", "survey", "interviews", "conversion"],
    [v("priority-matrix", "业务价值 × 实施难度优先级矩阵", "业务建议优先级矩阵")]
  ),
  demographics: r("人口属性", ["年龄区间：建立不同生命周期阶段的需求比较", "家庭结构：区分单身、伴侣、育儿和多代家庭场景", "职业与收入：用于解释预算边界，不直接等同购买能力", "交叉分析：年龄 × 家庭结构 × 预算形成基础人群切片"], v("grouped-bar", "年龄、家庭结构和收入区间分组条形图", "人口属性分组条形图"), ["ageIncome", "family"]),
  geography: r("地域与城市分布", ["按省市、城市级别和商圈类型整理样本", "比较不同区域的渠道覆盖和使用场景", "标记样本不足地区，避免把局部特征推广到整体", "为区域营销和渠道配置保留可验证假设"], v("map", "区域分级地图，旁列城市级别样本表", "区域分布地图"), ["region", "sampleSize"]),
  preferences: r("预算与产品偏好", ["按预算区间建立候选产品集合", "比较功能、外观、性能和服务偏好", "区分明确偏好与尚未决定的考虑因素", "建立预算 × 偏好的交叉表供后续验证"], v("stacked-bar", "预算区间堆叠条形图，展示偏好维度而非虚构比例", "预算与偏好堆叠图"), ["budget", "preferences"]),
  motivation: r("购买动机", ["功能动机：解决具体使用任务", "体验动机：提升便利、舒适或效率", "情绪动机：审美、认同和身份表达", "风险动机：售后、可靠性和长期成本"], v("motivation-radar", "四象限动机雷达框架，不填虚构分值", "购买动机雷达框架"), ["survey", "interviews"]),
  scenarios: r("典型使用场景", ["记录高频任务发生的时间、地点和参与者", "区分日常使用、特殊事件和长期服务场景", "为每个场景补充触发条件、目标和阻碍", "把场景需求映射到产品能力和服务触点"], v("scenario-board", "四格使用场景故事板", "真实生活方式使用场景组图", true), ["interviews", "scenarios"]),
  channels: r("信息渠道与触达", ["认知阶段：记录内容平台、搜索和口碑来源", "比较阶段：记录测评、门店和顾问触点", "决策阶段：记录报价、试用、政策和他人意见", "复购传播：记录服务体验和分享触发点"], v("channel-funnel", "认知—比较—决策—传播四层渠道漏斗", "信息渠道漏斗"), ["channels", "leads"]),
  factors: r("决策因素", ["建立价格、功能、体验、品牌、服务和风险六类因素", "区分必要条件、加分条件和否决条件", "记录不同分群的影响人和决策周期", "后续以问卷或访谈验证因素排序"], v("decision-matrix", "分群 × 决策因素矩阵", "决策因素矩阵"), ["survey", "interviews", "conversion"]),
  archetype: r("典型用户画像", ["画像卡包含背景、任务、需求、障碍和触达方式", "所有属性必须来自样本归纳，不拼接虚构个人经历", "人物剪影或插画头像只用于信息识别，不作为用户结论证据", "每张画像标注对应的数据来源和待验证假设"], v("persona-board", "两张 PPT 原生典型画像卡：插画头像与特征、需求、障碍、触点四区分栏", "统一风格插画头像与典型画像卡片"), ["survey", "interviews"]),
  productAdvice: r("产品建议", ["将高频需求映射到功能优先级", "按预算区间设计产品或服务组合", "为关键痛点增加体验、说明和保障机制", "用小范围测试验证建议，不直接宣称效果"], v("feature-matrix", "用户需求 × 产品能力匹配矩阵", "需求能力匹配矩阵"), ["preferences", "conversion"]),
  marketingAdvice: r("营销建议", ["按用户分群设置不同内容主题", "为关键决策因素准备可核验的证明材料", "按认知、比较和决策阶段安排内容", "以线索质量和后续转化验证传播方向"], v("content-matrix", "用户分群 × 决策阶段内容矩阵", "营销内容矩阵"), ["channels", "leads", "conversion"]),
  channelAdvice: r("渠道建议", ["按人群来源评估线上与线下触点", "为比较阶段配置测评、咨询和体验入口", "为决策阶段统一报价、政策和服务口径", "建立渠道线索到成交结果的回溯字段"], v("channel-map", "渠道触点地图与线索回流路径", "渠道触点地图"), ["leads", "conversion"])
};

const marketRecipes = {
  cover: { ...common.cover, title: "{topic}：市场分析" },
  scope: r("市场边界与分析口径", ["界定产品、地域、客群和时间范围", "区分总体市场、可服务市场和当前目标市场", "统一市场规模、销量、用户和渠道等指标定义", "列出结论成立所依赖的数据来源"], v("scope-rings", "三层市场边界同心圆", "市场边界同心圆"), ["marketData", "region"]),
  basis: r("数据基础与研究方法", ["整理公开研究、经营数据、调研和访谈四类来源", "标注每类资料的时间、口径和适用范围", "交叉验证宏观趋势与一线反馈", "对缺失或冲突数据单独列出验证任务"], v("evidence-pyramid", "四层证据金字塔", "证据来源金字塔"), ["marketData", "orders", "survey", "interviews"]),
  trends: r("需求变化与趋势", ["从政策、技术、消费和渠道四个维度识别变化", "区分长期趋势、阶段波动和短期事件影响", "把趋势映射到客户需求和竞争要素", "所有趋势判断保留来源与更新时间"], v("trend-lines", "多因素趋势时间轴，不填未经提供的数值", "趋势时间轴"), ["marketData"]),
  competition: r("竞争格局", ["按产品定位、价格带、渠道和服务建立竞品比较框架", "区分直接竞品、替代方案和潜在进入者", "比较能力与定位，不编造市场份额或排名", "标出需要进一步核验的竞品资料"], v("competition-matrix", "定位 × 能力竞争矩阵", "竞争格局矩阵"), ["competitors", "marketData"]),
  segments: r("细分市场机会", ["按客群、场景、预算和区域拆分机会", "检查细分需求是否明确且可触达", "评估能力匹配、竞争压力和进入门槛", "形成优先验证的细分假设清单"], v("opportunity-bubbles", "吸引力 × 能力匹配机会气泡图", "细分机会气泡图"), ["survey", "orders", "marketData"]),
  risks: r("风险与不确定性", ["数据风险：样本、口径和时间范围可能不一致", "市场风险：需求变化和竞争动作仍需持续跟踪", "执行风险：资源、渠道和交付能力可能限制落地", "设置验证指标和复盘节点，不使用确定性承诺"], v("risk-matrix", "影响程度 × 发生可能性风险矩阵", "风险矩阵"), ["marketData"]),
  strategy: { ...common.closing, title: "市场策略与下一步" }
};

const businessRecipes = {
  cover: { ...common.cover, title: "{topic}：业务汇报" },
  objective: r("汇报目标与业务范围", ["明确本次汇报覆盖的业务、周期和责任范围", "列出需要管理层理解、判断或支持的事项", "区分已完成事实、进行中工作和待确认计划", "统一指标口径与资料来源"], v("scope-board", "目标、范围、决策事项三栏总览", "业务汇报总览板"), ["kpis", "orders"]),
  progress: r("关键进展", ["按项目、产品或区域归纳已完成事项", "每项进展关联可核验交付物或数据来源", "标注当前状态、责任人和下一节点", "未确认结果保持为待核验，不包装为成果"], v("milestones", "阶段里程碑时间轴", "业务进展里程碑"), ["kpis", "projectFiles"]),
  metrics: r("经营指标框架", ["按收入、客户、交付和效率建立指标树", "区分结果指标、过程指标和风险指标", "说明各指标的数据来源、更新频率与负责人", "客户未提供数值时仅保留指标框架"], v("metric-tree", "结果—过程—风险三级指标树", "经营指标树"), ["kpis", "orders", "conversion"]),
  diagnosis: r("问题诊断", ["按现象、影响、原因和证据拆解问题", "区分资源、流程、产品和市场因素", "标注已验证原因与待验证假设", "避免用单一案例代表整体情况"], v("cause-tree", "问题现象到根因的鱼骨图", "问题根因鱼骨图"), ["kpis", "interviews"]),
  actions: r("改进动作", ["为每个关键问题配置一项可执行动作", "明确输入、负责人、完成节点和验收方式", "优先处理高影响且可快速验证的事项", "设置复盘节点，允许依据结果调整"], v("action-board", "问题—动作—负责人—验收四列表", "改进行动表"), ["projectFiles"]),
  resources: r("资源与计划", ["列出人力、预算、系统和跨部门协同需求", "区分必须资源与可选增强项", "标记依赖关系和决策截止点", "形成阶段排期与升级机制"], v("gantt", "阶段甘特图与资源依赖标记", "资源排期甘特图"), ["projectFiles", "kpis"]),
  closing: { ...common.closing, title: "管理结论与下一步" }
};

const productRecipes = {
  cover: { ...common.cover, title: "{topic}：产品介绍" },
  market_or_customer_challenge: r("客户任务与沟通挑战", ["界定目标客户正在完成的采购、使用或沟通任务", "拆解当前方式中的效率、体验、协作或信任障碍", "区分高频需求、特殊需求和仍需客户确认的判断", "用客户资料验证问题，不放大个别反馈"], v("challenge-map", "客户任务流程上的阻碍与资料验证点", "客户任务挑战地图"), ["survey", "interviews", "productFiles"]),
  company_positioning: r("企业定位与能力边界", ["一句话说明服务对象、核心任务和价值边界", "说明适用场景与不适用场景", "区分标准产品能力、服务支持和定制边界", "列出使用前提和客户需要准备的资料"], v("position-canvas", "客户—任务—能力三段定位画布", "企业定位画布"), ["productFiles"]),
  target_audience: r("目标客户与决策关注", ["梳理目标客户类型、使用角色和采购关注点", "区分使用者、采购方、品牌或运营决策方", "说明不同客户关注的质量、效率、成本或体验问题", "未提供客户名单、规模或资质时只保留客户类型框架"], v("audience-map", "客户类型 × 决策关注点矩阵", "目标客户关注矩阵"), ["productFiles", "interviews"]),
  product_portfolio: r("产品组合与适用场景", ["按产品类别、规格或服务包整理组合结构", "说明各类产品对应的典型使用任务和适配条件", "区分标准品、可选配置和需确认的定制项", "不补写未提供的型号、价格、库存或销量"], v("portfolio-grid", "产品类别 × 使用任务组合网格", "产品组合网格"), ["productFiles"]),
  product_or_process_capability: r("产品与工艺能力", ["按输入、处理、输出和质量控制拆分能力模块", "每个模块对应一个客户任务和交付结果", "标明关键处理环节、人工确认节点和质量检查方式", "未提供的技术参数、认证和测试数据不补写"], v("capability-architecture", "四层产品与工艺能力架构图", "产品与工艺能力架构"), ["productFiles"]),
  customization_capability: r("定制能力与配置方式", ["整理可定制范围、客户输入和确认节点", "说明图案、结构、规格、服务或功能配置的边界", "区分常规配置、专项定制和需要再次评估的需求", "不承诺未提供的起订量、价格、周期或效果"], v("customization-map", "定制范围—客户输入—确认节点三栏图", "定制能力地图"), ["productFiles", "projectFiles"]),
  application_scenarios: r("应用场景与使用路径", ["按客户角色和业务任务选择代表场景", "每个场景说明触发条件、操作过程和产出", "区分标准场景与需要定制的复杂场景", "为场景准备产品素材、细节素材、使用场景素材或后续素材清单"], v("scenario-cards", "三张应用场景卡片，各自对应任务、能力和素材需求", "产品应用场景卡片", true), ["productFiles", "caseFiles"]),
  service_process: r("服务流程与协作节点", ["从需求确认、资料准备到交付验收拆解步骤", "每一步明确客户输入和项目输出", "在关键节点加入审核、修改和确认", "提前标记可能影响周期的依赖项"], v("service-flow", "需求确认到交付验收的六节点服务流程图", "服务协作流程"), ["projectFiles"]),
  quality_or_validation: r("质量验证与资料依据", ["列出与质量、体验或稳定性相关的验证资料需求", "区分已提供证据、待确认资料和不能宣称的结论", "说明检查、打样、测试或审核在流程中的位置", "没有来源时只保留验证清单，不写确定性质量结论"], v("dashboard", "资料来源、验证动作、结论边界三列表", "质量验证清单"), ["productFiles", "projectFiles"]),
  delivery_and_collaboration: r("交付协作与周期条件", ["说明交付所需的客户资料、确认动作和协作节奏", "标记影响周期、排期或交付范围的关键条件", "区分样品确认、批量协作、验收交付或服务启用的不同阶段", "未提供周期或产能时只列待确认项"], v("delivery-timeline", "资料确认—处理协作—验收交付三阶段时间轴", "交付协作时间轴"), ["projectFiles"]),
  customer_value: r("客户价值与使用条件", ["按质量、可控性、适配度和复用条件比较方案", "只比较可说明的能力，不编造竞品数据", "将产品能力映射到客户使用条件和决策依据", "保留客户验证、试用或复盘反馈入口"], v("value-matrix", "能力 × 使用条件价值矩阵", "客户价值矩阵"), ["productFiles", "caseFiles"]),
  cooperation_next_step: r("合作入口与下一步", ["明确客户下一步需要确认的资料、样品、版本或沟通对象", "列出双方需要完成的动作、输入和输出", "设置小范围验证或初版确认路径", "不承诺未经确认的价格、周期、效果或合作结果"], v("roadmap", "客户动作、我方动作、交付物、确认节点四阶段路线图", "合作下一步行动板"), ["projectFiles"]),
  source_and_material_gap: r("资料来源与补充缺口", ["列出现有资料可支持的页面和仍缺少的证明材料", "把图片、案例、参数、资质或流程资料分为待补充项", "标记哪些信息不能写成客户事实", "为后续制作保留素材收集清单"], v("dashboard", "现有资料、适用页面、缺口、责任人四列表", "资料缺口表"), ["productFiles", "caseFiles", "projectFiles"]),
  assumptions_and_boundaries: r("表达边界与待确认假设", ["说明本稿只使用客户提供资料和明确待确认事项", "列出不能扩写的数字、客户名称、资质、产能、案例和结论", "把普通背景资料、已确认事实和待确认内容分开使用", "资料到位后再更新结论、图表和交付承诺"], v("matrix", "事实、假设、禁写内容、后续确认四区分栏", "表达边界说明板"), ["projectFiles"]),
  problem: r("客户任务与沟通挑战", ["界定目标客户正在完成的采购、使用或沟通任务", "拆解当前方式中的效率、体验、协作或信任障碍", "区分高频需求、特殊需求和仍需客户确认的判断", "用客户资料验证问题，不放大个别反馈"], v("challenge-map", "客户任务流程上的阻碍与资料验证点", "客户任务挑战地图"), ["survey", "interviews", "productFiles"]),
  position: r("企业定位与能力边界", ["一句话说明服务对象、核心任务和价值边界", "说明适用场景与不适用场景", "区分标准产品能力、服务支持和定制边界", "列出使用前提和客户需要准备的资料"], v("position-canvas", "客户—任务—能力三段定位画布", "企业定位画布"), ["productFiles"]),
  capabilities: r("产品与工艺能力", ["按输入、处理、输出和质量控制拆分能力模块", "每个模块对应一个客户任务和交付结果", "标明关键处理环节、人工确认节点和质量检查方式", "未提供的技术参数、认证和测试数据不补写"], v("capability-architecture", "四层产品与工艺能力架构图", "产品与工艺能力架构"), ["productFiles"]),
  scenarios: r("应用场景与使用路径", ["按客户角色和业务任务选择代表场景", "每个场景说明触发条件、操作过程和产出", "区分标准场景与需要定制的复杂场景", "为场景准备产品素材、细节素材、使用场景素材或后续素材清单"], v("scenario-cards", "三张应用场景卡片，各自对应任务、能力和素材需求", "产品应用场景卡片", true), ["productFiles", "caseFiles"]),
  flow: r("服务流程与协作节点", ["从需求确认、资料准备到交付验收拆解步骤", "每一步明确客户输入和项目输出", "在关键节点加入审核、修改和确认", "提前标记可能影响周期的依赖项"], v("service-flow", "需求确认到交付验收的六节点服务流程图", "服务协作流程"), ["projectFiles"]),
  value: r("客户价值与使用条件", ["按质量、可控性、适配度和复用条件比较方案", "只比较可说明的能力，不编造竞品数据", "将产品能力映射到客户使用条件和决策依据", "保留客户验证、试用或复盘反馈入口"], v("value-matrix", "能力 × 使用条件价值矩阵", "客户价值矩阵"), ["productFiles", "caseFiles"]),
  closing: r("合作入口与下一步", ["明确客户下一步需要确认的资料、样品、版本或沟通对象", "列出双方需要完成的动作、输入和输出", "设置小范围验证或初版确认路径", "不承诺未经确认的价格、周期、效果或合作结果"], v("next-step-board", "客户动作、我方动作、交付物、确认节点四列表", "合作下一步行动板"), ["projectFiles"])
};

export const PRODUCT_INTRO_ROLE_SELECTION_MATRIX = {
  3: ["cover", "product_or_process_capability", "cooperation_next_step"],
  4: ["cover", "company_positioning", "product_or_process_capability", "cooperation_next_step"],
  5: ["cover", "company_positioning", "target_audience", "product_or_process_capability", "cooperation_next_step"],
  6: ["cover", "market_or_customer_challenge", "company_positioning", "product_or_process_capability", "customer_value", "cooperation_next_step"],
  7: ["cover", "market_or_customer_challenge", "company_positioning", "target_audience", "product_or_process_capability", "customer_value", "cooperation_next_step"],
  8: ["cover", "market_or_customer_challenge", "company_positioning", "target_audience", "product_or_process_capability", "application_scenarios", "customer_value", "cooperation_next_step"],
  9: ["cover", "market_or_customer_challenge", "company_positioning", "target_audience", "product_portfolio", "product_or_process_capability", "application_scenarios", "customer_value", "cooperation_next_step"],
  10: ["cover", "market_or_customer_challenge", "company_positioning", "target_audience", "product_or_process_capability", "customization_capability", "application_scenarios", "service_process", "delivery_and_collaboration", "cooperation_next_step"],
  11: ["cover", "market_or_customer_challenge", "company_positioning", "target_audience", "product_or_process_capability", "customization_capability", "application_scenarios", "service_process", "delivery_and_collaboration", "customer_value", "cooperation_next_step"],
  12: ["cover", "market_or_customer_challenge", "company_positioning", "target_audience", "product_or_process_capability", "customization_capability", "application_scenarios", "service_process", "quality_or_validation", "delivery_and_collaboration", "customer_value", "cooperation_next_step"],
  13: ["cover", "market_or_customer_challenge", "company_positioning", "target_audience", "product_portfolio", "product_or_process_capability", "customization_capability", "application_scenarios", "service_process", "quality_or_validation", "delivery_and_collaboration", "customer_value", "cooperation_next_step"],
  14: ["cover", "market_or_customer_challenge", "company_positioning", "target_audience", "product_portfolio", "product_or_process_capability", "customization_capability", "application_scenarios", "service_process", "quality_or_validation", "delivery_and_collaboration", "customer_value", "source_and_material_gap", "cooperation_next_step"],
  15: ["cover", "market_or_customer_challenge", "company_positioning", "target_audience", "product_portfolio", "product_or_process_capability", "customization_capability", "application_scenarios", "service_process", "quality_or_validation", "delivery_and_collaboration", "customer_value", "source_and_material_gap", "assumptions_and_boundaries", "cooperation_next_step"]
};

const projectRecipes = {
  cover: { ...common.cover, title: "{topic}：项目方案" },
  background: r("项目背景与目标", ["说明项目要解决的业务问题和服务对象", "明确本阶段目标、边界和预期交付", "区分已确认条件与仍需验证的假设", "建立项目成功标准，但不补造目标数值"], v("goal-tree", "问题—目标—交付物目标树", "项目目标树"), ["projectFiles"]),
  positioning: r("项目定位与目标对象", ["界定项目在整体业务中的角色", "描述目标客户、合作方或使用部门", "梳理对方最关心的价值、成本和风险", "形成统一的价值主张与沟通口径"], v("stakeholder-map", "项目中心与四类利益相关者地图", "利益相关者地图"), ["projectFiles", "interviews"]),
  resources: r("资源与基础条件", ["梳理区位、空间、政策、团队和服务基础", "每项优势关联可核验资料或证明文件", "区分现有能力、在建能力和规划能力", "未确认政策、面积或合作信息不得写成事实"], v("resource-wheel", "六维资源能力轮盘", "项目资源轮盘"), ["projectFiles", "policyFiles", "caseFiles"]),
  architecture: r("方案架构", ["按业务层、能力层、运营层和保障层组织方案", "说明各模块的输入、输出与责任边界", "标出模块之间的数据和协作关系", "为后续分阶段实施保留可拆分单元"], v("solution-architecture", "四层方案架构图", "项目方案架构"), ["projectFiles"]),
  value: r("合作价值", ["从业务增长、运营效率、客户体验和能力沉淀说明价值", "将每项价值映射到具体实施模块", "区分短期可验证结果与长期建设方向", "不承诺未经验证的收益或转化效果"], v("value-chain", "资源—能力—场景—价值链路图", "项目价值链"), ["caseFiles", "kpis"]),
  model: r("合作与实施模式", ["明确双方资料、人员和审核职责", "区分标准交付、联合运营和定制建设模式", "说明启动条件、交付物与验收节点", "预算、周期和范围待确认时保持为清单"], v("responsibility-swimlane", "双方责任泳道图", "合作责任泳道"), ["projectFiles"]),
  plan: r("落地路径与排期", ["第一阶段完成资料确认和试点定义", "第二阶段完成方案制作、审核和上线", "第三阶段依据反馈迭代并形成常态机制", "每阶段明确输入、交付物和决策节点"], v("phase-roadmap", "试点—上线—运营三阶段路线图", "项目落地路线图"), ["projectFiles"]),
  industry: r("目标对象与合作资源", ["明确目标对象、使用场景和重点合作方类型", "区分核心需求、配套条件和潜在协同方", "建立合作对象筛选条件和沟通优先级", "合作判断需由项目资料和客户沟通信息支持"], v("partner-resource-map", "目标对象、场景、资源与沟通优先级分层图", "项目合作资源图"), ["projectFiles", "marketData"]),
  service: r("支持与协作体系", ["按合作前、执行期和复盘期拆分支持事项", "梳理资料、空间、人员、运营和沟通支持", "明确支持入口、责任角色和办理路径", "未确认支持内容只列待补充项"], v("support-map", "合作全流程支持地图", "项目支持地图"), ["policyFiles", "projectFiles"]),
  process: r("合作推进流程", ["从初步接洽到评估、确认和执行拆解流程", "每个节点列明所需资料和确认人", "标出资料审核、条件匹配和合作确认等关键依赖", "为潜在合作方提供清晰的下一步入口"], v("cooperation-flow", "接洽到合作确认的流程图", "项目合作推进流程"), ["policyFiles", "projectFiles"]),
  closing: { ...common.closing, title: "合作结论与下一步" }
};

const promotionRecipes = {
  cover: { ...common.cover, title: "{topic}：宣传推广方案" },
  goal: r("传播目标", ["明确传播要提升的认知、兴趣或行动", "区分品牌目标、活动目标和转化目标", "设定可验证的过程指标框架", "未提供历史数据时不设虚构目标值"], v("goal-ladder", "认知—兴趣—行动传播目标阶梯", "传播目标阶梯"), ["campaignData", "conversion"]),
  audience: r("核心受众", ["按需求、场景和媒介习惯划分受众", "说明各人群最关心的信息和行动阻碍", "区分核心人群、影响人群和扩散人群", "后续以渠道和转化数据验证优先级"], v("audience-rings", "核心、影响、扩散三层受众圈", "传播受众圈层"), ["survey", "channels"]),
  message: r("核心信息", ["提炼一个主张和三项支撑信息", "将功能描述转化为受众可理解的利益点", "为信任问题准备事实依据和证明材料", "避免使用绝对化效果承诺"], v("message-house", "主张—理由—证据信息屋", "传播信息屋"), ["productFiles", "caseFiles"]),
  content: r("内容主题", ["设置认知、解释、证明和行动四类内容", "每类内容匹配一种主要媒介形式", "统一品牌口吻，同时保持场景差异", "缺失图片、案例和品牌规范时列入素材清单"], v("content-grid", "内容阶段 × 媒介形式矩阵", "传播内容矩阵"), ["brandAssets", "caseFiles"]),
  channels: r("渠道组合", ["自有渠道承接完整信息与行动入口", "社交渠道负责兴趣和话题扩散", "线下触点提供体验、咨询和信任证明", "统一渠道参数以便后续回溯"], v("channel-ecosystem", "中心内容库向多渠道辐射图", "渠道生态图"), ["channels", "campaignData"]),
  rhythm: r("传播节奏", ["预热期建立话题和期待", "集中期释放核心内容与活动信息", "延续期沉淀案例、反馈和复访内容", "每阶段明确素材、渠道和审核节点"], v("campaign-timeline", "预热—集中—延续传播时间轴", "传播节奏时间轴"), ["campaignData", "brandAssets"]),
  closing: { ...common.closing, title: "行动入口与下一步" }
};

const summaryRecipes = {
  cover: { ...common.cover, title: "{topic}：工作总结" },
  responsibility: r("职责与目标", ["说明岗位、团队或项目的职责范围", "列出本周期承担的核心任务", "区分常规工作、重点项目和临时支持", "对应组织目标说明工作价值"], v("responsibility-map", "职责—任务—目标三级映射图", "职责目标地图"), ["projectFiles", "kpis"]),
  completed: r("完成事项", ["按业务模块归纳完成的工作", "每项工作对应交付物、节点或可核验记录", "区分独立负责、协同参与和支持事项", "避免把进行中事项包装为已完成"], v("achievement-cards", "四张完成事项卡片", "工作事项卡片"), ["projectFiles"]),
  evidence: r("成果证据框架", ["结果证据：业务、客户或交付结果", "过程证据：效率、质量和协作改进", "能力证据：方法、工具和可复用资产", "没有数据时只保留证据清单和补充来源"], v("evidence-board", "结果、过程、能力三栏证据板", "工作成果证据板"), ["kpis", "projectFiles"]),
  review: r("问题与复盘", ["描述问题发生的场景和实际影响", "区分个人、流程、资源和外部因素", "记录已采取动作及仍未解决事项", "形成可验证的改进假设"], v("review-loop", "问题—原因—动作—结果复盘闭环", "工作复盘闭环"), ["projectFiles"]),
  growth: r("能力与方法沉淀", ["总结本周期形成的方法、模板和工具", "说明它们适用的任务与使用边界", "列出可向团队共享或标准化的资产", "明确下一步需要补足的能力"], v("capability-stairs", "方法、工具、标准三层能力阶梯", "能力沉淀阶梯"), ["projectFiles"]),
  next: r("下一阶段计划", ["按目标、动作、节点和验收方式拆解计划", "优先解决影响业务结果的关键问题", "明确需要的资源和协作支持", "设置阶段复盘与调整机制"], v("quarter-roadmap", "目标—动作—节点季度路线图", "下一阶段路线图"), ["kpis", "projectFiles"]),
  closing: { ...common.closing, title: "总结与承诺" }
};

const historyRecipes = {
  cover: { ...common.cover, title: "{topic}：历史与审美脉络", visual: v("ai-cultural-cover", "右侧人文景观或历史意象，左侧竖排标题留白", "东方人文景观与历史意象", true) },
  origin: r("主题缘起", ["界定讨论对象、地域和时间范围", "说明自然环境、社会生活与审美形成的关系", "列出文献、图像、遗址和作品等证据类型", "区分历史事实、后世阐释与当代想象"], v("cultural-map", "地域空间图叠加主题关键词", "人文地域空间图"), ["historicalSources", "images"]),
  timeline: r("历史脉络", ["按关键时期梳理主题的形成、转折与延续", "每个时期关联制度、人物、作品或空间变化", "标出连续传统与时代重构的区别", "史实节点需由文献或可靠资料支持"], v("historical-timeline", "横向历史时间轴配代表意象缩略图", "历史文化时间轴"), ["historicalSources"]),
  imagery: r("核心文化意象", ["提炼与主题相关的自然、空间和生活意象", "说明意象在诗文、绘画或民俗中的表达", "比较同一意象在不同时期的含义变化", "避免把文学表达直接当作历史事实"], v("moodboard", "诗、画、景三栏文化意象情绪板", "东方诗画文化意象拼贴", true), ["historicalSources", "images"]),
  works: r("代表作品与空间", ["选择能体现主题的作品、建筑或景观节点", "按创作背景、形式语言和观看方式展开", "建立作品与历史环境之间的联系", "图片版权、年代和出处需单独核验"], v("gallery", "一主两辅的作品画廊式版面", "历史艺术作品与空间摄影组合", true), ["historicalSources", "images"]),
  aesthetics: r("审美特征", ["从空间、色彩、材质、节奏和意境提炼特征", "说明形式特征如何承载文化观念", "比较宏观景观与日常细节的审美联系", "用作品或空间证据支撑，不使用空泛标签"], v("aesthetic-grid", "空间、色彩、材质、意境四格分析板", "东方审美分析网格"), ["images", "historicalSources"]),
  change: r("时代演变", ["比较不同阶段的功能、观看者和表达媒介", "梳理传统意象如何被重新解释", "区分保护、复原、再设计和商业化使用", "讨论变化中的连续性与争议"], v("then-now", "历史与当代上下对照时间带", "历史与当代对照图"), ["historicalSources", "images"]),
  color: r("色彩与材质", ["从自然环境和传统工艺提炼色彩来源", "分析石、木、水、纸、墨等材质的视觉关系", "建立主色、辅助色和留白比例的参考板", "当代应用需避免把文化符号表面化"], v("material-palette", "色彩条与材质样本组合板", "东方色彩材质样本板", true), ["images"]),
  poetry: r("诗画与观看方式", ["比较诗文叙事、绘画构图和现场游观的差异", "梳理移步换景、借景和留白等观看线索", "选择代表文本时标明作者、年代和出处", "把审美体验连接到具体空间节点"], v("scroll-layout", "长卷式游观路径与诗画节点", "东方长卷游观场景", true), ["historicalSources", "images"]),
  space: r("空间与游观", ["按入口、路径、节点和视线组织空间体验", "分析借景、框景、对景和留白的观看作用", "比较静态图像与现场移动观看的差异", "空间判断需要地图、实景或历史图像支持"], v("spatial-route", "平面游线图叠加视线与景观节点", "空间游观路径图"), ["historicalSources", "images"]),
  contemporary: r("当代价值与转译", ["提炼可延续的空间观、自然观和生活观", "区分文化研究、公共传播和商业设计的使用边界", "为展览、文旅或品牌应用提供转译原则", "保留来源标注和文化审核机制"], v("translation-matrix", "传统特征 × 当代场景转译矩阵", "文化转译矩阵"), ["historicalSources", "images"]),
  closing: { ...common.closing, title: "文化结论与当代启示", visual: v("cultural-roadmap", "研究、保护、传播、转译四阶段路线图", "文化研究行动路线图") }
};

const genericRecipes = {
  cover: common.cover,
  definition: r("主题界定", ["说明主题涉及的对象、范围和使用场景", "明确本次演示希望回答的核心问题", "区分已知信息、分析假设和待确认事项", "建立后续内容的统一概念与边界"], v("concept-map", "主题、对象、问题三层概念图", "主题概念图"), ["projectFiles"]),
  background: r("背景与现状", ["梳理主题产生的环境和关键变化", "列出当前参与者、流程和主要矛盾", "标记已有资料能够支持的部分", "把缺失信息整理为后续验证清单"], v("context-board", "环境—参与者—问题背景板", "背景现状板"), ["projectFiles", "marketData"]),
  question: r("核心问题", ["将宽泛主题拆成三个可回答的问题", "为每个问题定义判断标准和所需资料", "区分事实问题、原因问题和行动问题", "避免在证据不足时提前给出结论"], v("question-tree", "主题到三个核心问题的问题树", "核心问题树"), ["projectFiles"]),
  content: r("关键内容", ["按信息重要度排列主要内容模块", "每个模块对应一个明确问题或任务", "说明模块之间的先后与依赖关系", "为数据、案例和图片保留来源位置"], v("module-grid", "四块关键内容模块网格", "关键内容模块图"), ["projectFiles", "images"]),
  method: r("方法与路径", ["明确资料收集、分析、验证和输出步骤", "每一步列出输入、处理方式和产出", "在关键节点加入人工确认和风险检查", "保持路径可执行、可复盘和可调整"], v("method-flow", "输入—分析—验证—输出四步流程", "方法流程图"), ["projectFiles"]),
  closing: common.closing
};

export const MATERIAL_TYPES = [
  ["orders", /订单|销售记录|成交记录/, "销售订单数据"],
  ["survey", /问卷|调研表/, "调研问卷"],
  ["interviews", /访谈|用户反馈|客户反馈/, "访谈记录"],
  ["leads", /线索|留资/, "渠道线索数据"],
  ["sampleSize", /样本量|样本数/, "用户样本量"],
  ["region", /城市|地区|地域|省份/, "城市和地区分布"],
  ["ageIncome", /年龄|收入/, "年龄与收入区间"],
  ["family", /家庭结构|婚育/, "家庭结构"],
  ["budget", /预算|价格区间/, "预算区间"],
  ["preferences", /车型|产品偏好|配置偏好|品牌偏好/, "产品和预算偏好"],
  ["motivation", /购买动机|购车动机/, "购买动机"],
  ["scenarios", /使用场景|用车场景|消费场景/, "使用场景资料"],
  ["channels", /购买渠道|信息渠道|渠道分布/, "购买与信息渠道"],
  ["conversion", /转化|成交率|转化率/, "转化数据"],
  ["marketData", /市场数据|行业数据|市场规模|研究报告/, "市场研究数据"],
  ["competitors", /竞品|竞争对手/, "竞品资料"],
  ["kpis", /经营数据|指标|KPI|业绩/i, "经营指标数据"],
  ["productFiles", /产品资料|功能说明|产品手册/, "产品资料"],
  ["projectFiles", /项目资料|方案资料|实施资料/, "项目资料"],
  ["policyFiles", /政策|招商政策|产业规划/, "政策与规划资料"],
  ["caseFiles", /案例|客户案例|项目案例/, "案例资料"],
  ["brandAssets", /品牌规范|视觉规范|Logo|素材/i, "品牌与视觉素材"],
  ["campaignData", /投放|传播数据|活动数据/, "传播与活动数据"],
  ["historicalSources", /史料|文献|地方志|论文|出处/, "历史文献与出处"],
  ["images", /图片|照片|图像|作品图/, "图片与作品素材"],
  ["testDrives", /试驾/, "试驾数据"],
  ["storeInquiries", /门店咨询|到店咨询|销售顾问记录/, "门店咨询记录"],
  ["charging", /充电条件|固定车位|补能条件|充电便利/, "固定车位与充电条件"],
  ["lossReasons", /流失原因|未下订原因|放弃原因/, "用户流失原因"],
  ["aftersales", /售后反馈|维修记录|服务反馈/, "售后反馈"],
  ["purchaseStage", /首购|增购|换购/, "首购、增购与换购状态"],
  ["transactions", /交易数据|消费记录|收银数据|会员订单/, "交易与会员订单"],
  ["channelOrders", /外卖订单|自提订单|渠道订单/, "到店、外卖与自提渠道订单"],
  ["skuData", /SKU|菜单|品类|口味|甜度|配料/i, "SKU、菜单与产品偏好数据"],
  ["spaceData", /载体|空间|面积|楼宇|厂房|办公空间/, "园区载体与空间资料"],
  ["investmentLeads", /招商线索|企业线索|到访|洽谈记录/, "招商线索与到访洽谈记录"]
];

export const TYPE_DEFINITIONS = [
  { id: "customer_persona", label: "客户画像分析", pattern: /客户画像|用户画像|消费者画像|用户分析|人群分析/, base: ["cover", "dataBasis", "sampleOverview", "segments", "needsJourney", "implications"], extensions: ["demographics", "geography", "preferences", "motivation", "scenarios", "channels", "factors", "archetype", "productAdvice", "marketingAdvice", "channelAdvice"], recipes: personaRecipes },
  { id: "market_analysis", label: "市场分析", pattern: /市场分析|市场研究|行业分析|市场规模|竞争格局|竞品分析|行业趋势/, base: ["cover", "scope", "basis", "trends", "competition", "segments", "risks", "strategy"], extensions: [], recipes: marketRecipes },
  { id: "work_summary", label: "工作总结", pattern: /工作总结|年度总结|季度总结|工作复盘|述职|年终总结/, base: ["cover", "responsibility", "completed", "evidence", "review", "growth", "next", "closing"], extensions: [], recipes: summaryRecipes },
  { id: "history_culture", label: "历史文化", pattern: /历史|文化|审美|遗产|艺术史|人文|古代|传统/, base: ["cover", "origin", "timeline", "imagery", "works", "aesthetics", "change", "contemporary", "closing"], extensions: ["color", "poetry", "space"], recipes: historyRecipes },
  { id: "promotion", label: "宣传推广", pattern: /宣传|推广|开业|传播|品牌营销|活动策划|营销方案/, base: ["cover", "goal", "audience", "message", "content", "channels", "rhythm", "closing"], extensions: [], recipes: promotionRecipes },
  { id: "project_plan", label: "项目方案", pattern: /项目方案|实施方案|建设方案|落地方案|招商|园区|入驻|合作方案/, base: ["cover", "background", "positioning", "resources", "architecture", "value", "model", "plan", "closing"], extensions: ["industry", "service", "process"], recipes: projectRecipes },
  { id: "product_intro", label: "产品介绍", pattern: /产品介绍|产品能力|功能介绍|产品方案|解决方案产品|服务介绍/, base: PRODUCT_INTRO_ROLE_SELECTION_MATRIX[8], extensions: ["product_portfolio", "customization_capability", "service_process", "quality_or_validation", "delivery_and_collaboration", "source_and_material_gap", "assumptions_and_boundaries"], recipes: productRecipes },
  { id: "business_report", label: "商业汇报", pattern: /商业汇报|经营汇报|季度汇报|业务汇报|业绩汇报|经营分析|报告/, base: ["cover", "objective", "progress", "metrics", "diagnosis", "actions", "resources", "closing"], extensions: [], recipes: businessRecipes },
  { id: "generic", label: "通用演示", pattern: /.*/, base: ["cover", "definition", "background", "question", "content", "method", "closing"], extensions: [], recipes: genericRecipes }
];

export const STYLE_THEMES = {
  "科技感": "深灰底配电光蓝与青绿色强调，数据线条清晰",
  "商务正式": "深蓝、灰白和少量金色强调，版式克制稳健",
  "商务风格": "深蓝、灰白和少量金色强调，版式克制稳健",
  "年轻活力": "奶油白底配亮橙、青绿和莓果色，圆角卡片轻快",
  "活泼": "明亮多彩配色，圆角卡片和轻量插画",
  "人文东方": "宣纸白、墨黑、黛青和赭石，留白与长卷节奏",
  "温暖": "米白、暖棕和柔和自然光，质感亲和",
  "高级": "低饱和深色与精致留白，杂志式排版",
  "简洁": "白灰底与单一强调色，网格清晰"
};
