export function productContextText(context = {}) {
  if (typeof context === "string") return context;
  return [
    context.requirement,
    context.topic,
    context.clientMaterials,
    context.industry?.label,
    ...(context.confirmedFacts || []).map(item => item.excerpt),
    ...(context.materialContext?.fragments || []).map(item => item.excerpt)
  ].filter(Boolean).join("\n");
}

export function hasSoftwareProductSignal(value) {
  const text = String(value || "");
  return /SaaS|软件平台|数字化管理软件|管理软件|软件项目|软件产品|云端部署|本地化部署|软件授权|订阅周期|系统配置|功能配置|账号(?:与|和)?权限|平台账号|权限配置|权限管理|操作手册|数据看板|工单(?:管理|协作)|点巡检|设备台账|系统集成|接口适配|系统上线|上线验收|数据初始化|用户培训|服务启用|云服务|云平台/.test(text);
}

export function hasIndustrialEquipmentSignal(value) {
  const text = String(value || "");
  if (hasSoftwareProductSignal(text)) return false;
  return /工业\s*AI|工业视觉|视觉质检|视觉检测设备|视觉检测工作站|在线检测设备|质检设备|检测设备|自动化检测设备|工业相机|光源|镜头|工控机|PLC|机械手|输送线|剔除机构|产线集成|工位|检测对象|缺陷样本|样品测试|设备制造|安装调试/.test(text)
    && /设备|制造|工厂|产线|工位|检测|相机|光源|镜头|工控机|PLC|安装调试|验收/.test(text);
}

export function isSoftwareProductContext(context = {}) {
  return hasSoftwareProductSignal(productContextText(context));
}

export function isIndustrialEquipmentContext(context = {}) {
  return hasIndustrialEquipmentSignal(productContextText(context));
}

export function isPhysicalProductContext(context = {}) {
  const text = productContextText(context);
  if (hasSoftwareProductSignal(text)) return false;
  if (hasIndustrialEquipmentSignal(text)) return true;
  return /包装|袋|纸袋|保温袋|奶茶袋|咖啡袋|制造|产品实物|生产|工艺|材质|材料|样品|打样|批量|物流|质检|验收|外带|印刷|覆膜|烫金|消费品牌/.test(text);
}
