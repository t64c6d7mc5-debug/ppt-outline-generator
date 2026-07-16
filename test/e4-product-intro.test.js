import assert from "node:assert/strict";
import { test } from "node:test";
import { enforceFinalOutputContract } from "../lib/final-output-contract.js";
import { generateOutline, OutlineInputError } from "../lib/generate-outline.js";
import { adaptOutlineCandidate } from "../lib/output-adapter.js";
import { PRODUCT_INTRO_ROLE_SELECTION_MATRIX } from "../lib/outline-templates.js";
import { buildNarrativePlan, validateNarrativePlan } from "../lib/narrative-planner.js";
import { scoreOutline } from "../lib/outline-scorer.js";
import { buildRequestAuthority, parseRequestContext, PRODUCT_INTRO_PAGE_LIMIT_MESSAGE } from "../lib/request-context.js";
import { buildProductIntroMaterialAllocation, generateSlide } from "../lib/slide-generator.js";

const PACKAGING_MATERIALS = `普通资料｜企业定位
* 专注外卖保温袋、奶茶袋、咖啡袋和餐饮外带包装定制的供应商。

普通资料｜目标客户
* 目标客户包括连锁茶饮品牌、咖啡店、烘焙门店和外卖运营团队。

普通资料｜产品与工艺
* 产品类别包括铝箔保温袋、无纺布保温袋、牛皮纸奶茶袋、咖啡外带袋。
* 工艺包括覆膜、防油、加固手提、烫金、局部 UV 和四色印刷。

普通资料｜定制能力
* 可定制品牌 logo、活动主题、尺寸结构和节日限定图案。

普通资料｜应用场景
* 应用场景包括外卖配送、门店打包、节日促销、品牌联名和企业团购。

普通资料｜服务流程
* 服务流程包括需求沟通、尺寸材质建议、设计打样、确认报价、批量生产、质检包装和物流交付。`;

const PACKAGING_MATERIALS_WITH_DELIVERY = `${PACKAGING_MATERIALS}

普通资料｜交付能力
* 常规样品 3 到 5 天，批量订单 7 到 15 天，支持分批发货和复购补单。`;

const PACKAGING_MANUFACTURING_REQUIREMENT = "为禾岚包装科技制作一份12页食品外卖与饮品包装产品介绍PPT，用于向连锁茶饮、咖啡、烘焙和餐饮外卖品牌介绍企业定位、核心产品、材料工艺、定制方案、打样流程、质量检查、生产交付和合作路径，整体风格专业、可信、适合包装制造行业。";

const PACKAGING_MANUFACTURING_MATERIALS = `普通资料｜企业定位
* 禾岚包装科技是一家面向食品外卖和饮品品牌提供包装袋设计、打样和批量生产服务的包装制造企业。

普通资料｜核心产品
* 外卖保温袋、奶茶手提袋、咖啡外带袋。
* 铝箔保温袋、无纺布手提袋、礼赠包装袋。
* 食品外卖包装袋、饮品包装袋、品牌活动包装袋。

普通资料｜材料结构
* 无纺布、铝膜、珍珠棉、编织布、牛津布、复合膜。

普通资料｜生产工艺
* 裁切、印刷、复合、缝制、热压、封边、配件安装、成品整理和包装。
* 印刷文件检查、颜色确认、样品确认后进入批量生产。

普通资料｜定制能力
* 尺寸、袋型、颜色、品牌图案、提手、拉链、内衬定制。

普通资料｜打样与确认
* 需求沟通、尺寸确认、材料建议、结构确认、样品制作、样品修改、批量确认。

普通资料｜质量检查
* 外观、尺寸、印刷位置、缝线或封边、配件安装、承重表现检查。

普通资料｜生产与交付
* 批量生产前确认最终样品、印刷文件和包装要求。
* 支持样品制作和批量生产。
* 交付内容可包括成品包装袋、外箱包装、装箱清单、样品确认记录和物流信息。
* 支持分批交付、门店分发、统一仓库交付。`;

const PACKAGING_UNSTRUCTURED_MATERIALS = `禾岚包装科技提供外卖保温袋、奶茶手提袋、咖啡外带袋、铝箔保温袋、无纺布手提袋和礼赠包装袋。
材料包括无纺布、铝膜、珍珠棉、编织布、牛津布、复合膜。
生产工艺包括裁切、印刷、复合、缝制、热压、封边、配件安装、成品整理。
打样确认流程包括需求沟通、尺寸确认、材料建议、结构确认、样品制作、样品修改、批量确认。
质量检查包括外观、尺寸、印刷位置、缝线或封边、配件安装、承重表现检查。
交付方式包括样品制作、批量生产、分批交付、门店分发、统一仓库交付。`;

const SOFTWARE_MATERIALS = `普通资料｜企业定位
* 面向企业知识库和客服团队提供 AI 问答、检索增强和会话质检服务。

普通资料｜产品与工艺
* 产品能力包括文档接入、权限控制、语义检索、对话生成、人工复核和日志审计。

普通资料｜应用场景
* 应用场景包括内部知识查询、客服辅助、售前问答和员工培训。`;

const EQUIPMENT_MATERIALS = `普通资料｜企业定位
* 面向工厂产线提供自动化检测设备和维护服务。

普通资料｜产品与工艺
* 设备能力包括视觉检测、传感器采集、异常报警、工装切换和数据记录。

普通资料｜应用场景
* 应用场景包括来料检测、过程巡检、出厂检验和设备维护。`;

const INDUSTRIAL_AI_REQUIREMENT = "为一家工业 AI 视觉质检设备公司制作一份12页公司与产品介绍PPT，用于向汽车零部件、3C电子和食品包装生产企业的工厂负责人、质量负责人及采购人员介绍企业定位、产品能力、检测场景、定制方案、实施流程和交付服务，整体风格专业、科技、可信，有工业制造质感。";

const INDUSTRIAL_AI_REQUIREMENT_WITH_COOPERATION_PATH = "为澜检智能科技制作一份12页工业AI视觉质检设备公司与产品介绍PPT，用于向汽车零部件、3C电子和食品包装生产企业的工厂负责人、质量负责人、生产负责人、自动化工程师及采购人员，介绍企业定位、核心产品、检测能力、产线集成、定制方案、典型应用场景、项目实施流程、质量验证、交付服务和合作路径，整体风格专业、科技、可信，具有工业制造质感。";

const INDUSTRIAL_AI_MATERIALS = `普通资料｜企业定位
* 澜检智能科技是一家面向制造企业提供工业视觉检测设备与智能质量管理方案的技术服务公司。

普通资料｜目标客户
* 目标客户包括汽车零部件、3C电子和食品包装生产企业的工厂负责人、质量负责人及采购人员。

普通资料｜产品与工艺
* 产品能力包括工业相机、光源、镜头、工控机、PLC、MES、机械手和输送线集成。

普通资料｜定制能力
* 定制方案围绕检测对象、产线节拍、工位空间、光学方案、算法模型和本地部署要求配置。

普通资料｜应用场景
* 汽车零部件：装配完整性、尺寸偏差和表面缺陷检测。
* 3C电子：外壳划痕、零件缺失、标签和字符检测。
* 食品包装：封口完整性、印刷偏移、异物和包装外观检测。

普通资料｜服务流程
* 实施流程包括需求调研、样品测试、方案确认、设备制造、安装调试、试运行和验收交付。

普通资料｜交付能力
* 交付服务包括现场培训、售后支持、备件响应和检测方案持续优化。`;

const SAAS_EQUIPMENT_MAINTENANCE_REQUIREMENT = "为云协智控科技制作一份12页制造业设备运维SaaS产品介绍PPT，用于向制造企业的工厂负责人、设备负责人、生产负责人、信息化负责人和采购人员，介绍企业定位、产品功能、设备接入、数据看板、告警管理、工单协作、权限管理、部署方式、典型应用场景、实施流程、服务支持和合作路径，整体风格专业、科技、清晰、可信。";

const SAAS_EQUIPMENT_MAINTENANCE_MATERIALS = `普通资料｜企业定位
* 云协智控科技是一家面向制造企业提供设备运维数字化管理软件的技术服务公司
* 核心产品为制造业设备运维SaaS平台，覆盖设备接入、状态监控、告警处理、工单协作、点巡检管理和运维数据分析
* 产品以软件平台和实施服务为主，不包含设备制造、视觉检测设备或自动化工位交付

普通资料｜目标客户
* 主要面向离散制造、流程制造、汽车零部件、电子制造和食品加工企业
* 重点沟通对象包括工厂负责人、设备负责人、生产负责人、信息化负责人、维修主管和采购人员
* 不同角色分别关注设备状态透明度、告警响应、维修协作、数据权限、部署条件和使用成本

普通资料｜核心功能
* 设备台账用于统一管理设备名称、编号、位置、型号、责任部门和运行状态
* 数据看板用于展示设备在线状态、告警数量、工单进度、点巡检完成情况和运维任务分布
* 告警管理支持告警接收、分级、确认、派发、处理和关闭
* 工单管理支持报修、派单、接单、处理、验收和归档
* 点巡检管理支持计划制定、任务下发、移动端执行、异常记录和结果追踪
* 权限管理支持按组织、工厂、车间、角色和设备范围配置访问权限

普通资料｜设备接入
* 平台可通过网关、标准工业协议、设备接口或客户现有系统获取设备运行数据
* 具体接入方式需要根据设备型号、控制系统、网络条件和现场数据接口确认
* 对于暂时无法自动接入的设备，可先通过人工录入或移动端巡检方式建立基础设备档案

普通资料｜系统集成
* 支持根据项目条件与MES、ERP、企业微信、钉钉或其他业务系统进行接口适配
* 是否能够直接集成，需要根据客户系统开放能力、接口文档、安全策略和数据范围评估
* 未确认接口条件前，不承诺具体系统一定可以直接对接

普通资料｜部署与安全
* 支持云端部署和本地化部署两种方案
* 部署方式需要结合客户网络环境、数据安全要求、IT运维能力和使用规模确定
* 支持账号权限、角色权限、操作记录和数据范围控制
* 服务器配置、并发用户量、数据保存周期和安全认证需要根据正式技术方案确认

普通资料｜应用场景
* 设备状态监控场景可用于集中查看设备在线、停机、告警和任务状态
* 故障告警场景可用于告警确认、责任人通知、维修派单和处理闭环
* 点巡检场景可用于巡检计划、移动端执行、异常记录和结果追踪
* 维修协作场景可用于报修、派单、处理、验收和维修记录沉淀
* 管理复盘场景可用于分析设备告警、工单、巡检和维修任务的分布情况

普通资料｜实施流程
* 项目流程包括需求调研、设备与系统梳理、接入方案确认、账号与权限配置、数据初始化、功能配置、试运行、用户培训和上线验收
* 客户需要提供设备台账、组织架构、用户角色、网络条件、接口资料和运维流程
* 上线前需要确认设备范围、功能范围、权限规则、数据口径和验收方式

普通资料｜服务支持
* 服务内容可包括项目实施、系统配置、用户培训、使用答疑、问题排查和版本维护
* 问题响应方式、服务时间、升级机制和现场支持范围需要根据服务方案确认
* 未提供正式服务条款时，不承诺固定响应时间、可用性比例或无条件现场服务

普通资料｜交付内容
* 软件项目交付内容可包括平台账号、功能配置、设备台账、权限配置、接口配置、培训材料、操作手册和验收记录
* 项目可根据实际范围分阶段上线，不同工厂、车间或设备范围可分别确认
* 软件上线不涉及批量生产、物流运输、样品交付或设备制造`;

const INDUSTRIAL_AI_FORENSIC_MATERIALS = `普通资料｜企业定位
* 澜检智能科技是一家面向制造企业提供工业视觉检测设备与智能质量管理方案的技术服务公司
* 业务覆盖视觉检测工作站、在线检测设备、算法适配、产线集成和项目交付

普通资料｜目标客户
* 主要面向汽车零部件、3C电子、食品包装及精密制造企业
* 重点沟通对象包括工厂负责人、质量负责人、生产负责人、自动化工程师和采购人员

普通资料｜产品与工艺
* 核心产品包括在线视觉检测工作站、外观缺陷检测设备、尺寸测量设备和装配完整性检测设备
* 系统由工业相机、光源、镜头、工控机、视觉算法、PLC通讯和剔除机构组成
* 可检测划痕、缺料、错装、印刷偏移、色差、尺寸异常及表面污染等问题

普通资料｜定制能力
* 支持根据产品结构、产线速度、检测位置和缺陷类型定制相机、光源、治具及算法方案
* 支持与现有PLC、MES、机械手、输送线和报警系统进行接口适配
* 可根据工厂数据安全要求提供本地部署方案

普通资料｜应用场景
* 汽车零部件场景可用于装配完整性、尺寸偏差和表面缺陷检测
* 3C电子场景可用于外壳划痕、零件缺失、标签和字符检测
* 食品包装场景可用于封口完整性、印刷偏移、异物和包装外观检测

普通资料｜服务流程
* 项目流程包括需求访谈、样品测试、方案设计、现场勘查、设备制造、安装调试、试运行、验收和培训
* 项目实施前需要客户提供样品、缺陷样本、产线节拍、现场空间和接口资料

普通资料｜交付能力
* 支持标准视觉工作站交付，也支持与客户现有自动化产线进行集成
* 交付内容可包含设备、算法、接口配置、操作培训、验收资料和售后支持`;

function productContext({ requirement = "为一家包装袋生产企业制作一份公司与产品介绍 PPT", pageCount = 12, materials = PACKAGING_MATERIALS } = {}) {
  const input = {
    source_mode: "professional",
    requirement,
    page_count: pageCount,
    client_materials: materials,
    has_materials: Boolean(materials),
    style: "简洁",
    purpose: "产品介绍",
    audience: "潜在客户"
  };
  const authority = buildRequestAuthority(input);
  return parseRequestContext(input, authority);
}

function renderProductSlides(context) {
  const visualBudget = { aiImages: 0 };
  return buildNarrativePlan(context).map((section, index) => generateSlide(section, index + 1, context, visualBudget));
}

function normalizeTitle(value) {
  return String(value || "")
    .replace(/附录\s*\d+/g, "附录")
    .replace(/\d+/g, "")
    .replace(/\s+/g, "")
    .trim();
}

test("E4 product_intro rejects manual pages above 15 without silent clamp", async () => {
  const context16 = productContext({ pageCount: 16 });
  assert.equal(context16.error, PRODUCT_INTRO_PAGE_LIMIT_MESSAGE);

  const context30 = productContext({ pageCount: 30 });
  assert.equal(context30.error, PRODUCT_INTRO_PAGE_LIMIT_MESSAGE);

  await assert.rejects(
    () => generateOutline({
      source_mode: "professional",
      requirement: "为一家包装袋生产企业制作一份产品介绍 PPT",
      page_count: 16,
      client_materials: PACKAGING_MATERIALS
    }),
    error => error instanceof OutlineInputError && error.message === PRODUCT_INTRO_PAGE_LIMIT_MESSAGE
  );
});

test("E4 non-product deck types keep page counts above product_intro limit", () => {
  const input = { source_mode: "professional", requirement: "年度经营汇报", page_count: 16, audience: "管理层" };
  const context = parseRequestContext(input, buildRequestAuthority(input));
  assert.equal(context.type.id, "business_report");
  assert.equal(context.pageCount, 16);
  assert.equal(context.error, undefined);
});

test("E4 product_intro uses deterministic 3-15 role matrix without appendix fallback", () => {
  for (let pageCount = 3; pageCount <= 15; pageCount += 1) {
    const context = productContext({ pageCount });
    assert.equal(context.error, undefined);
    const plan = buildNarrativePlan(context);
    const ids = plan.map(section => section.id);
    assert.deepEqual(ids, PRODUCT_INTRO_ROLE_SELECTION_MATRIX[pageCount], `page ${pageCount}`);
    assert.equal(ids.length, pageCount);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes("cover"));
    assert.ok(ids.some(id => /product|capability/.test(id)));
    assert.ok(ids.some(id => /audience|scenario|value|cooperation/.test(id)));
    assert.ok(ids.includes("cooperation_next_step"));
    assert.ok(!ids.some(id => /^verificationAppendix/.test(id)));

    const slides = renderProductSlides(context);
    const titles = slides.map(slide => normalizeTitle(slide.title));
    assert.equal(new Set(titles).size, titles.length);
    const bodies = slides.map(slide => slide.content.replace(/\s+/g, ""));
    assert.equal(new Set(bodies).size, bodies.length);
  }
});

test("E4 product_intro 15 pages allocates structured material without repeated fragment use", () => {
  const context = productContext({ pageCount: 15, materials: PACKAGING_MATERIALS_WITH_DELIVERY });
  const allocation = buildProductIntroMaterialAllocation(context);
  const fragmentIds = allocation.records.map(record => record.fragment_id);
  assert.equal(new Set(fragmentIds).size, fragmentIds.length);
  assert.ok(allocation.records.some(record => record.assigned_section_id === "delivery_and_collaboration"));
  assert.ok(allocation.records.every(record => PRODUCT_INTRO_ROLE_SELECTION_MATRIX[15].includes(record.assigned_section_id)));
});

test("E4 product_intro 12 page packaging result has distinct late-page responsibilities", () => {
  const context = productContext({ pageCount: 12 });
  const slides = renderProductSlides(context);
  assert.equal(slides.length, 12);
  const lateSlides = slides.slice(8, 12);
  assert.deepEqual(lateSlides.map(slide => slide.slide_type), ["quality_or_validation", "delivery_and_collaboration", "customer_value", "cooperation_next_step"]);
  assert.equal(new Set(lateSlides.map(slide => slide.key_message)).size, lateSlides.length);
  assert.equal(new Set(lateSlides.map(slide => slide.visual_suggestion)).size, lateSlides.length);
  const visible = slides.map(slide => `${slide.title}\n${slide.content}\n${slide.visual_suggestion}`).join("\n");
  assert.match(visible, /保温袋|奶茶袋|咖啡外带袋|覆膜|印刷|定制|打样|质检包装|物流交付/);
  assert.doesNotMatch(visible, /资料验证附录\d+/);
});

test("E4.1.1 product_intro packaging wording avoids software terms and unsupported promotion", () => {
  const context = productContext({ pageCount: 12, materials: PACKAGING_MATERIALS_WITH_DELIVERY });
  context.planningSectionIntents = {
    delivery_and_collaboration: { title: "高效交付体系" },
    customer_value: { title: "品牌增值方案" }
  };
  const slides = renderProductSlides(context);
  const visible = slides.map(slide => `${slide.title}\n${slide.key_message}\n${slide.content}\n${slide.visual_suggestion}`).join("\n");
  const delivery = slides.find(slide => slide.slide_type === "delivery_and_collaboration");
  const value = slides.find(slide => slide.slide_type === "customer_value");

  assert.ok(delivery);
  assert.ok(value);
  assert.equal(delivery.title, "交付协作与周期条件");
  assert.equal(value.title, "客户价值与使用条件");
  assert.doesNotMatch(visible, /上线|截图|界面素材|页面截图|系统界面|自动化环节|自动化、人工确认|制作处理环节|事件或作品|时期节点/);
  assert.doesNotMatch(visible, /高效交付体系|品牌增值方案/);
  assert.match(delivery.content, /样品|批量生产|验收|物流交付|待确认/);
  assert.doesNotMatch(delivery.content, /批量处理/);
  assert.match(delivery.visual_suggestion, /订单阶段|样品确认|生产或处理节点|验收与交付依赖/);
  assert.doesNotMatch(visible, /认证资质：|产能：|价格：|客户案例：|销售额|市场份额/);
});

test("E4.1.2 product_intro rejects unsupported scope-expanding model titles unless sourced", () => {
  const context = productContext({ pageCount: 12, materials: PACKAGING_MATERIALS_WITH_DELIVERY });
  context.planningSectionIntents = {
    product_portfolio: { title: "全场景包装产品矩阵" },
    delivery_and_collaboration: { title: "一站式交付协作方案" }
  };
  const slides = renderProductSlides(context);
  const portfolio = slides.find(slide => slide.slide_type === "product_portfolio");
  const delivery = slides.find(slide => slide.slide_type === "delivery_and_collaboration");
  const visible = slides.map(slide => `${slide.title}\n${slide.content}`).join("\n");

  if (portfolio) assert.equal(portfolio.title, "产品组合与适用场景");
  assert.equal(delivery.title, "交付协作与周期条件");
  assert.doesNotMatch(visible, /全场景包装产品矩阵|一站式交付协作方案/);

  const sourced = productContext({
    pageCount: 9,
    materials: `${PACKAGING_MATERIALS_WITH_DELIVERY}\n\n普通资料｜产品与工艺\n* 客户资料明确使用“全场景包装产品矩阵”作为内部产品分类表。`
  });
  sourced.planningSectionIntents = {
    product_portfolio: { title: "全场景包装产品矩阵" }
  };
  const sourcedPortfolio = renderProductSlides(sourced).find(slide => slide.slide_type === "product_portfolio");
  assert.equal(sourcedPortfolio.title, "全场景包装产品矩阵");
});

test("E5.4 packaging product intro without materials does not leak industrial or software wording", () => {
  const slides = renderProductSlides(productContext({
    requirement: PACKAGING_MANUFACTURING_REQUIREMENT,
    pageCount: 12,
    materials: ""
  }));
  const visible = slides.map(slide => `${slide.title}\n${slide.content}\n${slide.visual_suggestion}`).join("\n");

  assert.doesNotMatch(visible, /检测对象|工位|接口|算法|系统部署|版本确认|设备结构|安装调试|服务启用/);
  assert.match(visible, /尺寸|袋型|材料|印刷|提手|拉链|内衬|品牌图案|批量生产|物流交付/);
});

test("E5.4 packaging materials are absorbed into product, process, quality and delivery pages with provenance", () => {
  const context = productContext({
    requirement: PACKAGING_MANUFACTURING_REQUIREMENT,
    pageCount: 12,
    materials: PACKAGING_MANUFACTURING_MATERIALS
  });
  const slides = renderProductSlides(context);
  const allocation = buildProductIntroMaterialAllocation(context);
  const page5 = slides.find(slide => slide.slide_type === "product_or_process_capability");
  const page6 = slides.find(slide => slide.slide_type === "customization_capability");
  const page8 = slides.find(slide => slide.slide_type === "service_process");
  const page9 = slides.find(slide => slide.slide_type === "quality_or_validation");
  const page10 = slides.find(slide => slide.slide_type === "delivery_and_collaboration");
  const page12 = slides.find(slide => slide.slide_type === "cooperation_next_step");
  const visible = slides.map(slide => `${slide.title}\n${slide.content}\n${slide.visual_suggestion}`).join("\n");
  const page5Details = allocation.records
    .filter(record => record.assigned_section_id === "product_or_process_capability")
    .map(record => record.category_detail);
  const page10Details = allocation.records
    .filter(record => record.assigned_section_id === "delivery_and_collaboration")
    .map(record => record.category_detail);

  assert.match(page5.content, /外卖保温袋|奶茶手提袋|咖啡外带袋/);
  assert.match(page5.content, /无纺布|铝膜|珍珠棉|复合膜/);
  assert.match(page5.content, /裁切|印刷|复合|缝制|热压/);
  assert.ok(page5Details.includes("core_product"));
  assert.ok(page5Details.includes("material_structure"));
  assert.ok(page5Details.includes("production_process"));
  assert.doesNotMatch(page5.content, /食品外卖包装袋、饮品包装袋、品牌活动包装袋/);
  assert.match(page6.content, /尺寸|袋型|颜色|品牌图案|提手|拉链|内衬/);
  assert.match(page8.content, /需求沟通|尺寸确认|材料建议|结构确认|样品制作|样品修改|批量确认/);
  assert.match(page9.content, /外观|尺寸|印刷位置|缝线|封边|配件安装|承重表现检查/);
  assert.match(page10.content, /最终样品|印刷文件|包装要求/);
  assert.match(page10.content, /样品制作|批量生产/);
  assert.match(page10.content, /成品包装袋|外箱包装|装箱清单|样品确认记录|物流信息/);
  assert.match(page10.content, /分批交付|门店分发|统一仓库交付/);
  assert.ok(page10Details.some(detail => ["delivery_readiness", "production_arrangement"].includes(detail)));
  assert.ok(page10Details.includes("delivery_content"));
  assert.ok(page10Details.includes("delivery_method"));
  assert.doesNotMatch(page12.content, /成品包装袋|外箱包装|装箱清单|样品确认记录|物流信息|分批交付|门店分发|统一仓库交付/);
  assert.doesNotMatch(visible, /检测对象|工位|接口|算法|系统部署|版本确认|设备结构|安装调试|服务启用/);
  assert.doesNotMatch(page9.content, /认证|保温时长|承重上限|ISO/);
  for (const slide of [page5, page6, page8, page9, page10]) {
    assert.ok(slide.evidence_sources?.length, `${slide.slide_type} should keep sources`);
    assert.ok(slide.evidence_sources.every(source => slide.content.includes(source.excerpt)));
  }
});

test("E5.4 unclassified packaging facts are conservatively mapped into product intro sections", () => {
  const context = productContext({
    requirement: PACKAGING_MANUFACTURING_REQUIREMENT,
    pageCount: 12,
    materials: PACKAGING_UNSTRUCTURED_MATERIALS
  });
  const allocation = buildProductIntroMaterialAllocation(context);
  const assigned = new Map(allocation.records.map(record => [record.source_id, record.assigned_section_id]));
  const slides = renderProductSlides(context);

  assert.ok([...assigned.values()].includes("product_or_process_capability"));
  assert.ok([...assigned.values()].includes("service_process"));
  assert.ok([...assigned.values()].includes("quality_or_validation"));
  assert.ok([...assigned.values()].includes("delivery_and_collaboration"));
  assert.match(slides.find(slide => slide.slide_type === "product_or_process_capability").content, /外卖保温袋|无纺布|裁切/);
  assert.match(slides.find(slide => slide.slide_type === "service_process").content, /需求沟通|材料建议|批量确认/);
  assert.match(slides.find(slide => slide.slide_type === "quality_or_validation").content, /承重表现检查/);
  assert.match(slides.find(slide => slide.slide_type === "delivery_and_collaboration").content, /门店分发|统一仓库交付/);
});

test("E5.5 SaaS product form outranks manufacturing and equipment access wording", () => {
  const slides = renderProductSlides(productContext({
    requirement: SAAS_EQUIPMENT_MAINTENANCE_REQUIREMENT,
    pageCount: 12,
    materials: ""
  }));
  const visible = slides.map(slide => `${slide.title}\n${slide.content}\n${slide.visual_suggestion}`).join("\n");
  const page6 = slides.find(slide => slide.slide_type === "customization_capability");
  const page10 = slides.find(slide => slide.slide_type === "delivery_and_collaboration");
  const page12 = slides.find(slide => slide.slide_type === "cooperation_next_step");

  assert.doesNotMatch(visible, /起订量|测试样品|样品确认|打样|批量生产|物流运输|设备制造|检测样张|工位照片|外箱包装|门店分发|检测对象|工位条件|设备结构|接口或算法配置/);
  assert.match(page6.content, /功能模块|设备接入|系统集成|权限|服务配置/);
  assert.match(page10.content, /方案确认|分阶段上线|验收交付|服务启用|资源条件/);
  assert.match(page10.visual_suggestion, /部署方式|账号与配置|培训材料|验收记录/);
  assert.match(page12.content, /设备范围|功能范围|接口资料|权限规则/);
});

test("E5.5 SaaS materials are allocated to software capability, access, implementation, validation and delivery pages", () => {
  const context = productContext({
    requirement: SAAS_EQUIPMENT_MAINTENANCE_REQUIREMENT,
    pageCount: 12,
    materials: SAAS_EQUIPMENT_MAINTENANCE_MATERIALS
  });
  const slides = renderProductSlides(context);
  const allocation = buildProductIntroMaterialAllocation(context);
  const page5 = slides.find(slide => slide.slide_type === "product_or_process_capability");
  const page6 = slides.find(slide => slide.slide_type === "customization_capability");
  const page7 = slides.find(slide => slide.slide_type === "application_scenarios");
  const page8 = slides.find(slide => slide.slide_type === "service_process");
  const page9 = slides.find(slide => slide.slide_type === "quality_or_validation");
  const page10 = slides.find(slide => slide.slide_type === "delivery_and_collaboration");
  const page12 = slides.find(slide => slide.slide_type === "cooperation_next_step");
  const visible = slides.map(slide => `${slide.title}\n${slide.content}\n${slide.visual_suggestion}`).join("\n");
  const page5Details = allocation.records
    .filter(record => record.assigned_section_id === "product_or_process_capability")
    .map(record => record.category_detail);
  const page6Details = allocation.records
    .filter(record => record.assigned_section_id === "customization_capability")
    .map(record => record.category_detail);
  const page10Details = allocation.records
    .filter(record => record.assigned_section_id === "delivery_and_collaboration")
    .map(record => record.category_detail);

  assert.match(page5.content, /设备台账|数据看板|告警管理|工单管理|点巡检/);
  assert.ok(page5Details.every(detail => detail === "software_core_function"));
  assert.match(page6.content, /网关|标准工业协议|设备接口|MES|ERP|企业微信|钉钉|接口适配|网络条件|现场数据接口/);
  assert.ok(page6Details.includes("software_access"));
  assert.ok(page6Details.includes("software_integration"));
  assert.match(page7.content, /设备状态监控|故障告警|点巡检/);
  assert.match(page8.content, /需求调研|系统梳理|接入方案确认|数据初始化|功能配置|试运行|用户培训|上线验收/);
  assert.match(page9.content, /账号权限|角色权限|操作记录|数据范围控制|服务器配置|并发用户量|数据保存周期|安全认证/);
  assert.match(page10.content, /云端部署|本地化部署|平台账号|功能配置|接口配置|培训材料|操作手册|验收记录|分阶段上线/);
  assert.ok(page10Details.includes("software_deployment"));
  assert.ok(page10Details.includes("software_delivery_content"));
  assert.ok(page10Details.includes("software_delivery_method"));
  assert.doesNotMatch(page12.content, /测试样品|设备制造|物流运输|批量生产|样品确认|打样|外箱包装|门店分发/);
  assert.doesNotMatch(visible, /起订量|测试样品|样品确认|打样|批量生产|物流运输|检测样张|工位照片|外箱包装|门店分发|检测对象|工位条件|设备结构|接口或算法配置/);
  for (const slide of [page5, page6, page7, page8, page9, page10]) {
    assert.ok(slide.evidence_sources?.length, `${slide.slide_type} should keep sources`);
    assert.ok(slide.evidence_sources.every(source => slide.content.includes(source.excerpt)));
  }
});

test("E5.5 SaaS API adapter keeps slide text and evidence aligned with generated page body", () => {
  const context = productContext({
    requirement: SAAS_EQUIPMENT_MAINTENANCE_REQUIREMENT,
    pageCount: 12,
    materials: SAAS_EQUIPMENT_MAINTENANCE_MATERIALS
  });
  const slides = renderProductSlides(context);
  const candidate = adaptOutlineCandidate({
    title: "云协智控科技：产品能力与合作路径",
    subtitle: "用于产品介绍",
    executive_summary: ["用于产品介绍"],
    content_state_summary: {},
    global_visual_style: {},
    missing_materials: [],
    production_strategy: {},
    slides: slides.map(slide => ({
      ...slide,
      _pageId: slide.slide_type,
      index: slides.indexOf(slide) + 1,
      objective: slide.key_message,
      data_requirements: [],
      speaker_notes: slide.content
    }))
  });

  assert.deepEqual(candidate.slides.map(slide => slide.content), slides.map(slide => slide.content));
  assert.deepEqual(candidate.slides.map(slide => slide.visual_spec), slides.map(slide => slide.visual_spec));
  for (const slide of candidate.slides.filter(item => item.slide_type !== "cover" && item.evidence_sources?.length)) {
    const visible = `${slide.title}\n${slide.key_message}\n${slide.content}`;
    assert.ok(slide.evidence_sources.every(source => visible.includes(source.excerpt)));
  }
});

test("E5.3 product_intro rejects unsupported title claim families from model planning", () => {
  const context = productContext({
    requirement: INDUSTRIAL_AI_REQUIREMENT_WITH_COOPERATION_PATH,
    pageCount: 12,
    materials: INDUSTRIAL_AI_FORENSIC_MATERIALS
  });
  context.planningSectionIntents = {
    company_positioning: { title: "企业定位与技术优势" },
    product_or_process_capability: { title: "视觉检测产品与工艺体系" },
    customer_value: { title: "客户价值与质量提升" },
    cooperation_next_step: { title: "合作实施路径与交付保障" }
  };
  const slides = renderProductSlides(context);
  const visibleTitles = slides.map(slide => slide.title).join("\n");
  const company = slides.find(slide => slide.slide_type === "company_positioning");
  const product = slides.find(slide => slide.slide_type === "product_or_process_capability");
  const value = slides.find(slide => slide.slide_type === "customer_value");
  const nextStep = slides.find(slide => slide.slide_type === "cooperation_next_step");

  assert.equal(company.title, "企业定位与能力边界");
  assert.equal(product.title, "产品与工艺能力");
  assert.equal(value.title, "客户价值与使用条件");
  assert.equal(nextStep.title, "合作入口与下一步");
  assert.doesNotMatch(visibleTitles, /技术优势|工艺体系|质量提升|交付保障/);
});

test("E5.3 product_intro allows title claim families only with traceable customer materials", () => {
  const context = productContext({
    requirement: INDUSTRIAL_AI_REQUIREMENT_WITH_COOPERATION_PATH,
    pageCount: 12,
    materials: `${INDUSTRIAL_AI_FORENSIC_MATERIALS}

普通资料｜产品与工艺
* 客户资料说明算法检测精度相对人工复检更高，属于当前技术优势依据。
* 已形成从样品测试、工装配置、算法验证到验收标准的完整工艺体系。

普通资料｜交付能力
* 测试结果显示缺陷漏检率降低 15%，客户验证记录支持质量提升表述。
* 服务条款包含 24 小时响应承诺、质保周期和售后保障。`
  });
  context.planningSectionIntents = {
    company_positioning: { title: "企业定位与技术优势" },
    product_or_process_capability: { title: "视觉检测产品与工艺体系" },
    customer_value: { title: "客户价值与质量提升" },
    cooperation_next_step: { title: "合作实施路径与交付保障" }
  };
  const slides = renderProductSlides(context);

  assert.equal(slides.find(slide => slide.slide_type === "company_positioning").title, "企业定位与技术优势");
  assert.equal(slides.find(slide => slide.slide_type === "product_or_process_capability").title, "视觉检测产品与工艺体系");
  assert.equal(slides.find(slide => slide.slide_type === "customer_value").title, "客户价值与质量提升");
  assert.equal(slides.find(slide => slide.slide_type === "cooperation_next_step").title, "合作实施路径与交付保障");
});

test("E5.3 generated model content cannot self-certify an unsupported result title", () => {
  const context = productContext({
    requirement: `${INDUSTRIAL_AI_REQUIREMENT_WITH_COOPERATION_PATH}，请介绍质量提升。`,
    pageCount: 12,
    materials: INDUSTRIAL_AI_FORENSIC_MATERIALS
  });
  context.planningSectionIntents = {
    customer_value: {
      title: "客户价值与质量提升",
      key_message: "模型建议正文声称质量提升，但客户材料未提供测试结果或客户验证数据。",
      objective: "围绕质量提升展开"
    }
  };
  const value = renderProductSlides(context).find(slide => slide.slide_type === "customer_value");

  assert.equal(value.title, "客户价值与使用条件");
  assert.doesNotMatch(value.title, /质量提升/);
});

test("E5.3 product_intro 12 page narrative keeps one final action close without dependency regression", () => {
  const context = productContext({ pageCount: 12, materials: INDUSTRIAL_AI_FORENSIC_MATERIALS });
  const plan = buildNarrativePlan(context);
  const late = plan.slice(9, 12);

  assert.deepEqual(late.map(section => section.id), ["delivery_and_collaboration", "customer_value", "cooperation_next_step"]);
  assert.deepEqual(late.map(section => section.role), ["analysis", "insight", "action"]);
  assert.equal(plan.at(-1).id, "cooperation_next_step");
  assert.equal(plan.at(-1).role, "action");
  assert.equal(plan.filter(section => section.role === "action").length, 1);
  assert.deepEqual(validateNarrativePlan(plan, context), []);

  const slides = renderProductSlides(context);
  assert.equal(slides.find(slide => slide.slide_type === "delivery_and_collaboration").role, "analysis");
  assert.match(slides.find(slide => slide.slide_type === "delivery_and_collaboration").key_message, /周期条件|协作输入|依赖项/);
  assert.equal(slides.find(slide => slide.slide_type === "customer_value").role, "insight");
  assert.match(slides.find(slide => slide.slide_type === "customer_value").key_message, /具体能力和使用条件/);
  assert.equal(slides.at(-1).slide_type, "cooperation_next_step");
  assert.equal(slides.at(-1).role, "action");
});

test("E4.1.1 product_intro software keeps software wording without manufacturing replacement", () => {
  const context = productContext({
    requirement: "帮我做一份 AI 客服软件产品介绍 PPT，10页，简洁商务",
    pageCount: 10,
    materials: `${SOFTWARE_MATERIALS}

普通资料｜交付能力
* 交付流程包括环境准备、系统上线、权限配置、人工复核和服务启用。`
  });
  context.planningSectionIntents = {
    delivery_and_collaboration: { title: "软件上线与交付协作路径" }
  };
  const slides = renderProductSlides(context);
  const visible = slides.map(slide => `${slide.title}\n${slide.content}\n${slide.visual_suggestion}`).join("\n");
  const delivery = slides.find(slide => slide.slide_type === "delivery_and_collaboration");

  assert.equal(delivery.title, "软件上线与交付协作路径");
  assert.match(visible, /系统上线|人工复核|服务启用|权限配置|界面素材/);
  assert.doesNotMatch(delivery.visual_suggestion, /样品确认|生产或处理节点|物流交付/);
  assert.doesNotMatch(visible, /样品确认|批量生产|物流交付/);
  assert.doesNotMatch(visible, /保温袋|奶茶袋|咖啡袋|牛皮纸|覆膜|烫金/);
});

test("E4.1.1 product_intro manufacturing case avoids software and packaging-specific defaults", () => {
  const slides = renderProductSlides(productContext({
    requirement: "生成一份制造设备企业产品介绍 PPT，12页，简洁商务",
    pageCount: 12,
    materials: EQUIPMENT_MATERIALS
  }));
  const visible = slides.map(slide => `${slide.title}\n${slide.content}\n${slide.visual_suggestion}`).join("\n");

  assert.match(visible, /检测设备|视觉检测|传感器|异常报警|工装切换|出厂检验/);
  assert.doesNotMatch(visible, /保温袋|奶茶袋|咖啡袋|牛皮纸|覆膜|烫金/);
  assert.doesNotMatch(visible, /知识库|语义检索|对话生成|会话质检|系统上线|截图/);
});

test("E4 product_intro industry wording does not leak packaging terms into software or equipment cases", () => {
  const software = renderProductSlides(productContext({
    requirement: "帮我做一份 AI 客服软件产品介绍 PPT，10页，简洁商务",
    pageCount: 10,
    materials: SOFTWARE_MATERIALS
  })).map(slide => `${slide.title}\n${slide.content}\n${slide.visual_suggestion}`).join("\n");
  assert.match(software, /AI|知识库|检索|客服|权限|日志审计/);
  assert.doesNotMatch(software, /保温袋|奶茶袋|咖啡袋|牛皮纸|覆膜|烫金|打样/);

  const equipment = renderProductSlides(productContext({
    requirement: "生成一份制造设备企业产品介绍 PPT，10页，简洁商务",
    pageCount: 10,
    materials: EQUIPMENT_MATERIALS
  })).map(slide => `${slide.title}\n${slide.content}\n${slide.visual_suggestion}`).join("\n");
  assert.match(equipment, /检测设备|视觉检测|传感器|异常报警|工装切换|出厂检验/);
  assert.doesNotMatch(equipment, /保温袋|奶茶袋|咖啡袋|牛皮纸|覆膜|烫金|打样/);
  assert.doesNotMatch(equipment, /知识库|语义检索|对话生成|会话质检/);
});

test("E4 product_intro title cleanup removes command phrasing", () => {
  const context = productContext({
    requirement: "帮我做一份为一家包装袋生产企业制作一份公司与产品介绍 PPT，大约 12 页，简洁商务。",
    pageCount: 12
  });
  const cover = renderProductSlides(context)[0];
  assert.doesNotMatch(cover.title, /帮我|制作一份|大约|12 页|简洁商务/);
  assert.match(cover.title, /包装袋生产企业|产品能力与合作路径/);
});

test("E5 simple product_intro context stays stable when model suggests training after materials", () => {
  const input = {
    source_mode: "simple",
    requirement: INDUSTRIAL_AI_REQUIREMENT,
    client_materials: INDUSTRIAL_AI_MATERIALS,
    has_materials: true,
    style: "auto",
    purpose: "auto"
  };
  const model = {
    audience: "内部培训学员",
    purpose: "培训课件",
    recommended_page_count: 8,
    industry: "AI 软件服务",
    business_scenario: "员工培训",
    sections: []
  };
  const context = parseRequestContext(input, buildRequestAuthority(input, model), model);
  assert.equal(context.type.id, "product_intro");
  assert.equal(context.purpose, "产品介绍");
  assert.equal(context.pageCount, 12);
  assert.equal(context.style, "科技感");
  assert.match(context.audience, /汽车零部件|3C电子|食品包装|工厂负责人|质量负责人|采购人员/);
});

test("E5.2 final output contract cleans model title claims and industrial equipment delivery language", () => {
  const context = productContext({
    requirement: INDUSTRIAL_AI_REQUIREMENT,
    pageCount: 12,
    materials: INDUSTRIAL_AI_MATERIALS
  });
  const plan = buildNarrativePlan(context);
  const slides = renderProductSlides(context);
  const internalOutline = {
    title: "澜检智能科技｜澜检智能｜核心价值与应用场景",
    subtitle: "面向汽车零部件、3C电子和食品包装生产企业，用于产品介绍",
    executive_summary: ["客户价值与ROI分析", "质量验证体系"],
    global_visual_style: {},
    missing_materials: [],
    production_strategy: {},
    slides: slides.map(slide => ({
      ...slide,
      title: slide.slide_type === "customer_value" ? "客户价值与ROI分析" : slide.title,
      content: `${slide.content}\n交付路径：批量生产、物流交付、服务启用、版本确认。`,
      visual_suggestion: `${slide.visual_suggestion}，批量生产与物流交付时间轴`
    })),
    pipeline: "server-generate-outline"
  };
  const badCandidate = adaptOutlineCandidate(internalOutline);
  const badReport = scoreOutline(badCandidate, context, plan, { pipeline: "server-generate-outline" });
  assert.ok(badReport.issue_codes.includes("unsupported-contract-claim"));
  assert.ok(badReport.issue_codes.includes("industrial-equipment-delivery-language"));
  assert.ok(badReport.issue_codes.includes("duplicated-brand-title"));

  const contracted = enforceFinalOutputContract(internalOutline, context);
  const visible = [
    contracted.title,
    ...(contracted.executive_summary || []),
    ...contracted.slides.flatMap(slide => [slide.title, slide.content, slide.visual_suggestion])
  ].join("\n");
  assert.doesNotMatch(visible, /澜检智能科技[｜|]澜检智能|ROI分析|质量验证体系|批量生产|物流交付|服务启用|版本确认/);
  assert.match(visible, /设备制造|安装调试|验收交付/);
});

test("E5.2 explicit investment purpose remains investment semantics", () => {
  const input = {
    requirement: "为工业 AI 视觉质检设备公司制作一份招商方案，用于招商推介和合作洽谈。",
    purpose: "招商方案"
  };
  const context = parseRequestContext(input, buildRequestAuthority(input));
  assert.equal(context.purpose, "招商方案");
});

test("E5.1.1 industrial AI public purpose stays consistent across API fields", async () => {
  const first = await generateOutline({
    source_mode: "simple",
    allow_draft: true,
    requirement: INDUSTRIAL_AI_REQUIREMENT,
    has_materials: false,
    style: "auto",
    purpose: "产品介绍"
  });
  const second = await generateOutline({
    source_mode: "simple",
    allow_draft: true,
    requirement: INDUSTRIAL_AI_REQUIREMENT,
    client_materials: INDUSTRIAL_AI_MATERIALS,
    has_materials: true,
    style: "auto",
    purpose: "产品介绍"
  });

  for (const outline of [first, second]) {
    assert.match(outline.subtitle, /用于产品介绍/);
    assert.ok(outline.executive_summary.some(item => /用于产品介绍/.test(item)));
    assert.match(outline.slides[0].content, /汇报用途：产品介绍/);
    assert.doesNotMatch(`${outline.subtitle}\n${outline.executive_summary.join("\n")}\n${outline.slides[0].content}`, /汇报用途：培训课件|用于培训课件/);
  }
  assert.match(second.slides[0].title, /澜检智能科技/);
  const scenarioSlide = second.slides.find(slide => slide.slide_type === "application_scenarios");
  assert.match(scenarioSlide.content, /汽车零部件：装配完整性、尺寸偏差和表面缺陷检测/);
  assert.match(scenarioSlide.content, /3C电子：外壳划痕、零件缺失、标签和字符检测/);
  assert.match(scenarioSlide.content, /食品包装：封口完整性、印刷偏移、异物和包装外观检测/);

  const trainingContext = parseRequestContext({
    source_mode: "simple",
    requirement: "制作一份工业 AI 视觉质检设备员工培训课件，用于培训一线操作人员。",
    purpose: "培训课件"
  }, buildRequestAuthority({
    source_mode: "simple",
    requirement: "制作一份工业 AI 视觉质检设备员工培训课件，用于培训一线操作人员。",
    purpose: "培训课件"
  }));
  assert.equal(trainingContext.purpose, "培训课件");
});

test("E5.2.1 simple auto purpose is inferred by requirement authority, not frontend explicit purpose", async () => {
  const first = await generateOutline({
    source_mode: "simple",
    allow_draft: true,
    requirement: INDUSTRIAL_AI_REQUIREMENT_WITH_COOPERATION_PATH,
    has_materials: false,
    style: "auto"
  });
  const second = await generateOutline({
    source_mode: "simple",
    allow_draft: true,
    requirement: INDUSTRIAL_AI_REQUIREMENT_WITH_COOPERATION_PATH,
    client_materials: INDUSTRIAL_AI_FORENSIC_MATERIALS,
    has_materials: true,
    style: "auto"
  });
  const explicitInvestment = await generateOutline({
    source_mode: "simple",
    allow_draft: true,
    requirement: INDUSTRIAL_AI_REQUIREMENT_WITH_COOPERATION_PATH,
    client_materials: INDUSTRIAL_AI_FORENSIC_MATERIALS,
    has_materials: true,
    style: "auto",
    purpose: "招商方案"
  });

  for (const outline of [first, second]) {
    assert.match(outline.subtitle, /用于产品介绍/);
    assert.ok(outline.executive_summary.some(item => /用于产品介绍/.test(item)));
    assert.match(outline.slides[0].content, /汇报用途：产品介绍/);
    assert.doesNotMatch(`${outline.subtitle}\n${outline.executive_summary.join("\n")}\n${outline.slides[0].content}`, /招商方案/);
  }
  assert.match(second.slides[0].title, /澜检智能科技/);
  const scenarioSlide = second.slides.find(slide => slide.slide_type === "application_scenarios");
  assert.match(scenarioSlide.content, /汽车零部件/);
  assert.match(scenarioSlide.content, /3C电子/);
  assert.match(scenarioSlide.content, /食品包装/);
  assert.match(explicitInvestment.subtitle, /用于招商方案/);
  assert.match(explicitInvestment.slides[0].content, /汇报用途：招商方案/);
});

test("E5 industrial AI equipment routes to equipment delivery language instead of software service", () => {
  const slides = renderProductSlides(productContext({
    requirement: INDUSTRIAL_AI_REQUIREMENT,
    pageCount: 12,
    materials: INDUSTRIAL_AI_MATERIALS
  }));
  const visible = slides.map(slide => `${slide.title}\n${slide.content}\n${slide.visual_suggestion}`).join("\n");
  assert.match(visible, /设备制造|安装调试|试运行|验收交付|售后支持/);
  assert.match(visible, /工业相机|光源|镜头|工控机|PLC|MES|机械手|输送线/);
  assert.doesNotMatch(visible, /品牌或运营决策方|图案、结构、规格|版本确认|批量协作|服务启用|交付或启用依赖|版本、试用范围/);
  assert.doesNotMatch(visible, /保温袋|奶茶袋|咖啡袋|牛皮纸|覆膜|烫金/);
});

test("E5 application scenario page uses multiple distinct same-category fragments within capacity", () => {
  const slides = renderProductSlides(productContext({
    requirement: INDUSTRIAL_AI_REQUIREMENT,
    pageCount: 12,
    materials: INDUSTRIAL_AI_MATERIALS
  }));
  const scenarioSlide = slides.find(slide => slide.slide_type === "application_scenarios");
  assert.ok(scenarioSlide);
  assert.match(scenarioSlide.content, /汽车零部件：装配完整性、尺寸偏差和表面缺陷检测/);
  assert.match(scenarioSlide.content, /3C电子：外壳划痕、零件缺失、标签和字符检测/);
  assert.match(scenarioSlide.content, /食品包装：封口完整性、印刷偏移、异物和包装外观检测/);
  assert.equal(scenarioSlide.content.split("\n").length <= 5, true);
  assert.equal(slides.length, 12);
  assert.equal(new Set(slides.map(slide => slide.slide_type)).size, slides.length);
  assert.doesNotMatch(slides.map(slide => slide.title).join("\n"), /资料验证附录\d+/);
});

test("E5 reliable company name from materials leads product intro cover without hallucinating names", () => {
  const brandedSlides = renderProductSlides(productContext({
    requirement: INDUSTRIAL_AI_REQUIREMENT,
    pageCount: 12,
    materials: INDUSTRIAL_AI_MATERIALS
  }));
  const cover = brandedSlides[0];
  assert.match(cover.title, /澜检智能科技/);
  assert.match(cover.content, /品牌 \/ 项目：澜检智能科技/);
  assert.ok(cover.evidence_sources?.some(source => source.source_id));

  const genericSlides = renderProductSlides(productContext({
    requirement: "为一家工业 AI 视觉质检设备公司制作一份12页公司与产品介绍PPT，用于对外介绍产品能力。",
    pageCount: 12,
    materials: INDUSTRIAL_AI_MATERIALS.replace("澜检智能科技是一家面向制造企业提供工业视觉检测设备与智能质量管理方案的技术服务公司。", "面向制造企业提供工业视觉检测设备与智能质量管理方案。")
  }));
  assert.doesNotMatch(genericSlides[0].title, /澜检智能科技/);
});
