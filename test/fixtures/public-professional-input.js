// Synthetic, customer-free fixture used by the public controlled-runner tests.
export const PUBLIC_PROFESSIONAL_BRIEF = {
  topic: "企业本地知识助手产品介绍：能力、应用场景与实施路径",
  pageCount: 10,
  scenario: "产品介绍与内部决策汇报",
  style: "简洁正式",
  purpose: "产品介绍",
  detailedPurpose: "向业务负责人、信息化团队和实施合作方说明产品定位、核心能力、使用边界、应用场景与后续实施路径，形成可编辑的十页 PPT 脚本。",
  audience: "业务负责人、信息化团队、知识管理负责人和实施合作方",
  materials: ["有文字资料"],
  materialDetails: `已确认事实：
本次介绍对象是部署在用户自有环境中的企业本地知识助手。
用户明确要求介绍文档检索、知识问答、权限边界和实施流程。
待确认内容：
具体模型、硬件规格、性能指标、客户案例、价格、周期和已合作关系均未确认。`,
  mustHave: `必须说明产品定位与适用边界。
必须介绍文档接入、检索、知识问答和权限管理能力。
必须说明典型业务场景与目标用户。
必须保留部署条件、数据治理和安全要求的待确认字段。
必须说明评估、试用、配置、验收和持续优化的实施路径。
最后一页必须包含资料确认、方案评估和下一步沟通行动。`,
  riskPoints: `不得编造模型名称、硬件规格、性能数字、客户名称、价格、周期、收益、认证、市场地位或已合作关系。
未经确认的能力、参数和结果必须标记为待确认，不得写成既成事实。`,
  emphasis: "突出可理解的产品价值、数据边界、应用场景和可执行实施路径",
  needScript: true,
  needImages: true,
  needLayouts: true,
  reference: "克制、清晰的企业产品介绍风格",
  followAnswers: "当前没有可公开的具体模型、参数、客户案例、价格或周期；所有未确认项目均保留待补字段。",
  deadline: "未指定"
};
