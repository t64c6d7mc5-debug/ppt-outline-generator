export function hasConcreteCooperationValue(value = "") {
  const text = normalizedText(value);
  const cooperationContext = /合作|合作方|商业综合体|运营方|品牌方|渠道方/.test(text);
  const concreteOutcome = /客流|获客|用户增长|品牌(?:曝光|展示|影响力|增值)|展示场景|收益|营收|转化|商场活力|运营效率|客户体验/.test(text);
  return cooperationContext && concreteOutcome;
}

export function hasExplicitTargetAudience(value = "") {
  return semanticClauses(value).some(clause => {
    const namedAudience = /赛车爱好者|年轻(?:群体|人群|用户|客群)|青少年|企业(?:客户|用户|客群)|家庭(?:用户|客群)|俱乐部成员|核心用户/.test(clause);
    const domainAudience = /(?:核心|潜在|主要|重点)?(?:购车|消费|参赛|观赛|体验|使用)(?:用户|客户|人群|群体|客群)/.test(clause);
    const demographicFamily = /(?:\d{1,2}(?:至|到|-)\d{1,2}岁)?年轻家庭|\d{1,2}(?:至|到|-)\d{1,2}岁(?:的)?家庭/.test(clause);
    return namedAudience || domainAudience || demographicFamily;
  });
}

export function hasActivityPartnership(value = "") {
  return semanticClauses(value).some(clause => {
    const hasSubject = /合作方|活动运营方|赛事组织方|运营方|项目方|品牌方|商业综合体|机构/.test(clause);
    const hasCooperationAction = /开展(?:深度)?合作|达成合作|进行合作|合作(?:举办|开展|策划|执行)|共同(?:举办|开展|策划|执行)|联合(?:举办|开展|策划|执行)|协同(?:举办|开展|策划|执行)|联办/.test(clause);
    const withoutActivityOperator = clause.replace(/活动运营方/g, "运营方");
    const hasActivityObject = /赛事|营销活动|体验活动|品牌活动|线下活动|推广活动/.test(withoutActivityOperator)
      || /(?:举办|开展|策划|执行|联办)[^。！？；]{0,8}活动/.test(withoutActivityOperator);
    return hasSubject && hasCooperationAction && hasActivityObject;
  });
}

export function hasResponsibleEntity(value = "") {
  return semanticClauses(value).some(clause => {
    const subject = clause.match(/团队|项目方|运营方|合作方|负责人|对接人|品牌方|商业综合体|机构|公司|部门|单位|委员会/);
    if (!subject) return false;
    const subjectEnd = subject.index + subject[0].length;
    const action = clause.slice(subjectEnd).match(/负责|牵头|执行|对接|推进/);
    return Boolean(action && action.index <= 24);
  });
}

export function hasControlledEquipmentRelation(value = "") {
  const text = normalizedText(value);
  const bothObjects = /专业直驱模拟器/.test(text) && /沉浸式显示设备/.test(text);
  const adoptionRelation = /(?:计划|拟|将)(?:使用|采用|配备|搭载)|(?:使用|采用|配备|搭载)/.test(text);
  return bothObjects && adoptionRelation;
}

export function equipmentAdoptionContentContract(value = "") {
  const text = normalizedText(value);
  const requiredObjects = ["专业直驱模拟器", "沉浸式显示设备"].filter(item => text.includes(item));
  if (requiredObjects.length !== 2) return null;
  return Object.freeze({
    required_objects: Object.freeze(requiredObjects),
    required_relations: Object.freeze(["采用或配备", "共同构成体验空间或驾驶体验系统"]),
    aggregation: "all_of"
  });
}

export function hasConcreteNextAction(value = "") {
  const text = normalizedText(value).replace(/(?:待|尚待|尚未|未)(?:进一步)?确认/g, "");
  return /安排|开展|补充|进入|提交|对接|推进|签署|沟通|洽谈|考察|评估|合作确认|方案确认/.test(text);
}

export function deriveAtomicSemanticContract({
  label = "",
  parentOriginal = "",
  parentAtomicLabels = [],
  fulfillmentPolicy = "safe_rephrase_allowed",
  sourceRefs = []
} = {}) {
  const atomicLabel = String(label || "").normalize("NFKC").trim();
  const parentText = String(parentOriginal || "").normalize("NFKC").trim();
  const combined = `${parentText}\n${atomicLabel}`;
  const base = {
    version: 1,
    aggregation: "all_of",
    same_block: true
  };

  if (fulfillmentPolicy === "exact_source_required") {
    return Object.freeze({
      ...base,
      type: "exact_confirmed_fact",
      required_components: Object.freeze(["source_ids"]),
      component_values: Object.freeze({
        source_ids: Object.freeze(sourceRefs.map(item => String(item?.source_id || "")).filter(Boolean))
      })
    });
  }

  const orderedSteps = parentAtomicLabels.map(item => String(item || "").trim()).filter(Boolean);
  if (orderedSteps.length > 1 && /(?:路径|流程|步骤|从.+到)/.test(parentText)) {
    return Object.freeze({
      ...base,
      type: "ordered_steps",
      required_components: Object.freeze(["ordered_steps"]),
      component_values: Object.freeze({ ordered_steps: Object.freeze(orderedSteps) })
    });
  }

  const sharedResponsibilityContract = isSharedResponsibilityContract(atomicLabel, parentAtomicLabels);
  const completeResponsibilityAtomic = /(?:责任主体|合作对象|负责方|对接方|执行方)/.test(atomicLabel)
    && /(?:明确动作|下一步事项|下一步动作|执行动作)/.test(atomicLabel);
  const singleAtomicResponsibilityContract = parentAtomicLabels.length === 1
    && /(?:责任主体|合作对象|负责方|对接方|执行方)/.test(atomicLabel)
    && /(?:下一步|推进安排|执行动作)/.test(parentText);
  if (completeResponsibilityAtomic || singleAtomicResponsibilityContract || sharedResponsibilityContract) {
    return Object.freeze({
      ...base,
      type: "responsibility_target_next_action",
      required_components: Object.freeze(["responsibilities", "targets", "next_actions"]),
      component_values: Object.freeze({
        responsibilities: Object.freeze(["责任主体"]),
        targets: Object.freeze(["合作对象"]),
        next_actions: Object.freeze([nextActionValue(combined)]),
        identities_confirmed: false
      })
    });
  }

  if (/(?:合作价值|品牌曝光|获客|流量|运营增益|收入|收益|资源互补)/.test(atomicLabel)) {
    return Object.freeze({
      ...base,
      type: "actor_action_value",
      required_components: Object.freeze(["actors", "actions", "measurable_value_categories"]),
      component_values: Object.freeze({
        actors: Object.freeze([cooperationActor(combined)]),
        actions: Object.freeze([valueAction(combined)]),
        measurable_value_categories: Object.freeze(valueCategories(combined))
      })
    });
  }

  if (/(?:活动|赛事|培训)/.test(atomicLabel) && /(?:合作|联合|共同|协同)/.test(atomicLabel)) {
    return Object.freeze({
      ...base,
      type: "actor_action_object",
      required_components: Object.freeze(["actors", "actions", "objects"]),
      component_values: Object.freeze({
        actors: Object.freeze([cooperationActor(combined)]),
        actions: Object.freeze([activityAction(combined)]),
        objects: Object.freeze(activityObjects(combined))
      })
    });
  }

  const relation = relationValue(parentText) || relationValue(atomicLabel);
  const objects = splitObjects(atomicLabel);
  return Object.freeze({
    ...base,
    type: "objects_relation",
    required_components: Object.freeze(["subject", "objects", "relations"]),
    component_values: Object.freeze({
      subject: /项目/.test(parentText) ? "项目" : "方案",
      objects: Object.freeze(objects),
      relations: Object.freeze(relation ? [relation] : []),
      ...(outcomeValue(parentText) ? { outcome: outcomeValue(parentText) } : {})
    })
  });
}

export function semanticContractContentEvidence(contract = {}, section = {}) {
  if (!isCompleteSemanticContract(contract) || contract.type === "exact_confirmed_fact") {
    return Object.freeze({ applicable: false, key_message_match: false, bullets_match: false, combined_match: false });
  }
  const keyMessage = String(section?.key_message || "");
  const bullets = Array.isArray(section?.bullets) ? section.bullets.map(item => String(item || "")) : [];
  const keyMessageMatch = semanticContractBlockMatches(contract, keyMessage);
  const bulletsMatch = bullets.some(block => semanticContractBlockMatches(contract, block));
  return Object.freeze({
    applicable: true,
    key_message_match: keyMessageMatch,
    bullets_match: bulletsMatch,
    combined_match: keyMessageMatch || bulletsMatch
  });
}

function isCompleteSemanticContract(contract) {
  const values = contract?.component_values || {};
  if (contract?.version !== 1 || contract?.aggregation !== "all_of" || contract?.same_block !== true) return false;
  if (contract.type === "objects_relation") return Boolean(values.subject && listValues(values.objects).length && listValues(values.relations).length);
  if (contract.type === "actor_action_object") return Boolean(listValues(values.actors).length && listValues(values.actions).length && listValues(values.objects).length);
  if (contract.type === "actor_action_value") return Boolean(listValues(values.actors).length && listValues(values.actions).length && listValues(values.measurable_value_categories).length);
  if (contract.type === "ordered_steps") return listValues(values.ordered_steps).length > 1;
  if (contract.type === "responsibility_target_next_action") {
    return Boolean(listValues(values.responsibilities).length && listValues(values.targets).length && listValues(values.next_actions).length);
  }
  return false;
}

function semanticContractBlockMatches(contract, value) {
  const text = normalizedText(value);
  if (!text) return false;
  const values = contract.component_values || {};
  if (contract.type === "objects_relation") {
    return componentMatches(text, values.subject, "subject")
      && allComponentsMatch(text, values.objects, "object")
      && allComponentsMatch(text, values.relations, "relation");
  }
  if (contract.type === "actor_action_object") {
    return anyComponentMatches(text, values.actors, "actor")
      && anyComponentMatches(text, values.actions, "action")
      && allComponentsMatch(text, values.objects, "object");
  }
  if (contract.type === "actor_action_value") {
    return anyComponentMatches(text, values.actors, "actor")
      && anyComponentMatches(text, values.actions, "action")
      && allComponentsMatch(text, values.measurable_value_categories, "value");
  }
  if (contract.type === "ordered_steps") {
    let cursor = -1;
    for (const step of listValues(values.ordered_steps)) {
      const next = text.indexOf(normalizedText(step), cursor + 1);
      if (next < 0) return false;
      cursor = next;
    }
    return true;
  }
  if (contract.type === "responsibility_target_next_action") {
    return allComponentsMatch(text, values.responsibilities, "responsibility")
      && allComponentsMatch(text, values.targets, "target")
      && anyComponentMatches(text, values.next_actions, "action");
  }
  return false;
}

function listValues(value) {
  return (Array.isArray(value) ? value : []).map(item => String(item || "").trim()).filter(Boolean);
}

function allComponentsMatch(text, values, kind) {
  const items = listValues(values);
  return items.length > 0 && items.every(item => componentMatches(text, item, kind));
}

function anyComponentMatches(text, values, kind) {
  const items = listValues(values);
  return items.length > 0 && items.some(item => componentMatches(text, item, kind));
}

function componentMatches(text, value, kind) {
  const component = normalizedText(value);
  if (!component) return false;
  if (text.includes(component)) return true;
  if (kind === "actor" && ["合作双方", "双方", "合作机构"].includes(component)) {
    return /合作方|合作双方|双方|合作机构|机构/.test(text);
  }
  if (kind === "relation" && /采用|配置|配备|使用|搭载/.test(component)) {
    return /采用|配置|配备|使用|搭载/.test(text);
  }
  return false;
}

function splitObjects(value) {
  return String(value || "")
    .split(/[、和与及]/)
    .map(item => item
      .replace(/^(?:项目|方案)(?:计划)?/, "")
      .replace(/^(?:采用|配置|配备|包含|提供|使用|搭载)/, "")
      .trim())
    .filter(Boolean);
}

function isSharedResponsibilityContract(atomicLabel, parentAtomicLabels) {
  const labels = (Array.isArray(parentAtomicLabels) ? parentAtomicLabels : [])
    .map(item => String(item || "").trim())
    .filter(Boolean);
  if (!labels.includes(atomicLabel)) return false;
  const hasResponsibility = labels.some(item => /(?:责任主体|合作对象|负责方|对接方|执行方)/.test(item));
  const hasNextAction = labels.some(item => /(?:明确动作|下一步事项|下一步动作|执行动作)/.test(item));
  return hasResponsibility && hasNextAction
    && /(?:责任主体|合作对象|负责方|对接方|执行方|明确动作|下一步事项|下一步动作|执行动作)/.test(atomicLabel);
}

function relationValue(value) {
  return String(value || "").match(/(?:采用|配置|配备|包含|提供|使用|搭载)/)?.[0] || "";
}

function outcomeValue(value) {
  return String(value || "").match(/共同构成[^。；;]+/)?.[0] || "";
}

function cooperationActor(value) {
  return String(value || "").match(/合作机构|合作双方|活动运营方|项目方|运营方|品牌方|商业综合体|机构|双方/)?.[0] || "合作双方";
}

function activityAction(value) {
  return String(value || "").match(/共同策划|共同举办|联合举办|协同开展|合作开展|共同开展/)?.[0] || "共同策划";
}

function activityObjects(value) {
  const matches = String(value || "").match(/营销活动|体验活动|培训活动|推广活动|品牌活动|赛事/g) || [];
  return [...new Set(matches.length ? matches : ["活动安排"])];
}

function valueAction(value) {
  return String(value || "").match(/共同评估|联合评估|合作评估|共同创造|合作创造/)?.[0] || "共同评估";
}

function valueCategories(value) {
  const matches = String(value || "").match(/品牌曝光|获客|流量|运营增益|收入|收益|资源互补/g) || [];
  return [...new Set(matches.length ? matches : ["品牌曝光", "运营增益", "资源互补"])];
}

function nextActionValue(value) {
  const explicit = String(value || "").match(/(?:推进|开展|确认|安排)[^。；;]{2,24}/)?.[0];
  return explicit || "推进下一步事项";
}

function normalizedText(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "");
}

function semanticClauses(value) {
  return normalizedText(value).split(/[。！？；;\n]+/).map(item => item.trim()).filter(Boolean);
}
