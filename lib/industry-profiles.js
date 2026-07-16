const v = (kind, description, scene, ai = false) => ({ kind, description, scene, ai });

const INDUSTRY_PROFILES = [
  {
    id: "new_energy_vehicle",
    label: "新能源汽车",
    pattern: /新能源车|新能源汽车|电动汽车|电动车|纯电|插混|增程|智能汽车/,
    titleNoun: "新能源汽车用户洞察",
    forbiddenTerms: [],
    overrides: {
      customer_persona: {
        dataBasis: {
          points: [
            "分析目标：识别核心购车人群、用车任务与影响下订的关键环节",
            "用户维度：城市级别、家庭结构、通勤距离、固定车位与充电条件",
            "产品维度：预算、车型级别、动力形式、续航、空间与智能化偏好",
            "数据口径：统一订单、试驾、门店咨询、用户访谈与流失记录的时间范围"
          ],
          needs: ["orders", "testDrives", "storeInquiries", "interviews", "lossReasons"],
          visual: v("ev-evidence-funnel", "订单、试驾、门店咨询、访谈四层证据漏斗", "新能源汽车用户研究证据漏斗")
        },
        sampleOverview: {
          points: [
            "样本切片：按城市级别、区域和门店来源检查覆盖范围",
            "购车阶段：区分首购、增购与换购，避免混合解释不同需求",
            "条件切片：交叉查看预算区间、车型偏好、固定车位与补能条件",
            "样本校验：检查重复线索、缺失字段、试驾未下订与渠道偏差"
          ],
          needs: ["sampleSize", "region", "budget", "preferences", "charging", "testDrives"],
          visual: v("ev-sample-dashboard", "城市级别分布条形图加预算与车型交叉表", "新能源汽车样本概览仪表板")
        },
        segments: {
          points: [
            "场景分群：通勤代步、家庭出行与长途需求分别建立待验证人群",
            "产品分群：按预算、车型级别、动力形式、空间与续航偏好组合特征",
            "条件分群：纳入固定车位、家庭充电与公共补能便利性",
            "每个分群记录首购/增购/换购、核心任务、主要障碍与决策触点"
          ],
          needs: ["ageIncome", "family", "budget", "preferences", "scenarios", "charging"],
          visual: v("ev-persona-cards", "三张 PPT 原生画像卡片：用车场景、产品偏好、补能条件、决策障碍", "新能源汽车用户画像卡片")
        },
        needsJourney: {
          points: [
            "使用需求：核验通勤距离、家庭出行、长途频次、空间与用车成本关注点",
            "典型痛点：续航焦虑、冬季衰减、充电便利、电池安全、保值率与保险成本",
            "体验风险：核验智能座舱稳定性、辅助驾驶信任、售后服务与交付周期",
            "决策路径：内容认知→车型比较→门店咨询→试驾→金融方案→家庭意见→下订→交付反馈"
          ],
          needs: ["survey", "interviews", "testDrives", "storeInquiries", "conversion", "aftersales"],
          visual: v("ev-decision-journey", "九阶段购车决策旅程图，标出补能、试驾与信任障碍", "新能源汽车购车决策旅程")
        },
        implications: {
          points: [
            "产品建议：把续航、空间、智能座舱与辅助驾驶关注点映射到车型和配置说明",
            "营销建议：围绕通勤成本、家庭出行、科技体验与长期用车成本准备可核验证据",
            "渠道建议：串联内容触达、门店咨询、试驾、金融方案、下订与交付后的反馈字段",
            "验证动作：优先补齐订单、试驾、流失、充电条件和售后反馈后再确定客群优先级"
          ],
          needs: ["orders", "testDrives", "storeInquiries", "lossReasons", "conversion", "aftersales"],
          visual: v("ev-action-roadmap", "产品、营销、门店、售后四泳道验证路线图", "新能源汽车业务验证路线图")
        },
        demographics: {
          points: ["比较年龄与生命周期阶段，不将年龄直接等同购车能力", "区分单身、伴侣、育儿与多代家庭的空间任务", "结合职业、收入区间与通勤距离解释预算边界", "交叉查看家庭结构、城市级别与首购/增购/换购状态"],
          needs: ["ageIncome", "family", "region", "purchaseStage"],
          visual: v("ev-demographic-grid", "家庭结构 × 城市级别 × 购车阶段三维切片表", "新能源汽车人口属性切片")
        },
        preferences: {
          points: ["按预算区间与车型级别建立候选集合", "比较纯电、插混或增程等动力形式偏好", "核验续航、智能座舱、辅助驾驶、空间和品牌关注点", "建立预算 × 车型 × 配置偏好的待验证交叉表"],
          needs: ["budget", "preferences", "survey", "testDrives"],
          visual: v("ev-preference-matrix", "预算区间 × 车型级别 × 产品偏好矩阵", "新能源汽车产品偏好矩阵")
        },
        motivation: {
          points: ["经济动机：核验通勤成本、长期用车成本与金融方案关注", "体验动机：核验智能座舱、辅助驾驶、舒适与空间需求", "情境动机：核验家庭出行、牌照政策与增换购触发", "情感动机：核验品牌、设计与环保认同，不预设排序"],
          needs: ["survey", "interviews", "orders"],
          visual: v("ev-motivation-wheel", "成本、科技、家庭、政策、品牌五维动机轮盘", "新能源汽车购买动机轮盘")
        },
        scenarios: {
          points: ["通勤场景：记录里程、频次、停车与家庭充电条件", "家庭场景：记录成员数量、儿童或老人乘坐与空间任务", "长途场景：记录路线、补能规划与冬季续航顾虑", "将各场景映射到车型、动力形式、空间和服务需求"],
          needs: ["scenarios", "charging", "interviews"],
          visual: v("ev-scenario-board", "通勤、家庭、长途三格用车任务故事板", "新能源汽车用车场景故事板")
        },
        factors: {
          points: ["必要条件：预算、车型级别、续航、空间与补能可行性", "加分条件：智能座舱、辅助驾驶、设计与品牌体验", "否决风险：电池安全、冬季衰减、保值率、保险与售后顾虑", "记录试驾感受、金融方案和家庭成员意见如何影响下订"],
          needs: ["survey", "interviews", "testDrives", "conversion"],
          visual: v("ev-factor-matrix", "用户分群 × 必要条件 × 加分项 × 否决项矩阵", "新能源汽车决策因素矩阵")
        }
      },
      market_analysis: {
        scope: {
          points: ["界定纯电、插混与增程等动力形式的产品范围", "明确目标城市、车型级别、预算区间和购车阶段", "区分总体关注、试驾意向与真实下订等不同市场口径", "列出续航、补能、空间和智能化判断所依赖的数据来源"],
          needs: ["marketData", "region", "budget", "testDrives", "orders"],
          visual: v("ev-market-scope", "动力形式、车型级别、预算与区域四层市场边界图", "新能源汽车市场边界图")
        },
        trends: {
          points: ["需求变化：核验续航、补能便利、空间与长期用车成本关注", "技术变化：跟踪电池、智能座舱和辅助驾驶能力边界", "渠道变化：比较内容触达、门店咨询、试驾与下订路径", "趋势判断必须标注资料时间与适用区域，不把短期波动写成长期结论"],
          needs: ["marketData", "testDrives", "storeInquiries"],
          visual: v("ev-trend-timeline", "需求、技术、渠道三条证据时间轴", "新能源汽车趋势证据时间轴")
        },
        competition: {
          points: ["按动力形式、车型级别、预算、续航和空间建立竞品框架", "比较智能座舱、辅助驾驶、补能服务与售后保障", "区分产品参数、试驾体验与用户反馈等不同证据", "不编造销量、市场份额或品牌排名"],
          needs: ["competitors", "marketData", "testDrives", "aftersales"],
          visual: v("ev-competition-matrix", "车型级别 × 核心能力 × 使用条件竞品矩阵", "新能源汽车竞争矩阵")
        },
        segments: {
          points: ["按城市、家庭任务、通勤距离与补能条件拆分需求场景", "按预算、车型级别、动力形式和空间需求拆分候选市场", "核验续航、智能座舱和辅助驾驶关注是否形成可触达差异", "以订单、试驾和流失原因验证细分机会，不预设市场规模"],
          needs: ["orders", "testDrives", "lossReasons", "charging", "budget"],
          visual: v("ev-opportunity-matrix", "需求吸引力 × 补能可行性 × 能力匹配机会矩阵", "新能源汽车细分机会矩阵")
        }
      }
    }
  },
  {
    id: "food_beverage",
    label: "餐饮/奶茶",
    pattern: /奶茶|茶饮|咖啡|餐饮|饮品|门店|餐厅|甜品|烘焙/,
    titleNoun: "餐饮消费者洞察",
    forbiddenTerms: ["辅助驾驶", "续航焦虑", "充电条件", "车型级别"],
    overrides: {
      customer_persona: {
        dataBasis: {
          points: ["分析目标：识别核心消费人群、到店/外卖场景与复购阻碍", "数据维度：交易订单、会员、门店时段、SKU、渠道与活动触达", "口径要求：区分到店、外卖、自提及活动订单，统一时间范围", "结论边界：先建立分群框架，交易与调研资料到位后再判断人群规模"],
          needs: ["transactions", "survey", "interviews", "channelOrders", "skuData"],
          visual: v("tea-data-stack", "交易、会员、调研、渠道四层数据来源堆叠图", "茶饮消费者研究数据栈")
        },
        sampleOverview: {
          points: ["按门店商圈、城市、时段与渠道检查样本覆盖", "按消费场景区分通勤顺路、午后社交、正餐搭配与夜间外卖", "按价格带、杯型、温度、甜度和品类建立选择框架", "检查促销订单、重复会员与单一门店偏差"],
          needs: ["sampleSize", "region", "transactions", "skuData", "channelOrders"],
          visual: v("tea-daypart-dashboard", "消费时段热力表加渠道与品类分布条形图", "茶饮样本时段仪表板")
        },
        segments: {
          points: ["场景轴：通勤即饮、社交分享、佐餐解腻与外卖便利", "偏好轴：茶底、奶基底、甜度、温度、配料与新品接受度", "价值轴：价格敏感、品质关注、健康关注与品牌社交表达", "画像卡记录触发时段、选择标准、复购障碍和主要触点"],
          needs: ["transactions", "skuData", "survey", "channels"],
          visual: v("tea-persona-cards", "三张 PPT 原生画像卡片：场景、口味、价格、渠道、复购障碍", "茶饮消费者画像卡片")
        },
        needsJourney: {
          points: ["需求：口味稳定、新鲜感、便利性、社交分享与价格接受度", "痛点：等待时间、配送体验、口味不稳定、优惠复杂与健康顾虑", "决策路径：内容种草→菜单比较→优惠判断→下单/到店→饮用反馈→复购分享", "验证每个节点的渠道来源、放弃原因和复购触发，不预设消费者事实"],
          needs: ["survey", "interviews", "channelOrders", "conversion"],
          visual: v("tea-journey", "六阶段消费旅程图，标出菜单、优惠、履约与复购触点", "茶饮消费决策旅程")
        },
        implications: {
          points: ["产品建议：按场景核验核心品类、新品节奏、甜度与配料组合", "营销建议：按通勤、社交、佐餐与外卖场景设置内容主题", "门店建议：围绕高频时段、排队、出杯与取餐体验设计验证", "下一步补齐交易、SKU、会员、渠道订单和访谈资料后再排序机会"],
          needs: ["transactions", "skuData", "channelOrders", "survey", "conversion"],
          visual: v("tea-action-matrix", "产品、内容、门店、渠道四象限行动矩阵", "茶饮业务行动矩阵")
        }
      }
    }
  },
  {
    id: "park_investment",
    label: "园区/招商",
    pattern: /园区|产业园|招商入驻|园区运营|产业载体|入驻企业|企业入驻|入驻流程|开发区|孵化器|企业招引/,
    titleNoun: "园区招商",
    forbiddenTerms: ["续航焦虑", "甜度", "奶茶", "辅助驾驶"],
    overrides: {
      project_plan: {
        background: {
          points: ["明确园区当前招商阶段、目标产业与对外推介任务", "区分品牌曝光、项目线索、到访考察与入驻洽谈目标", "呈现已确认的区位、载体、产业基础与企业服务", "围绕企业理解、到访兴趣和洽谈入口组织推介信息"],
          needs: ["projectFiles", "policyFiles", "spaceData", "investmentLeads"],
          visual: v("park-goal-funnel", "认知、留资、到访、洽谈、入驻五层招商目标漏斗", "园区招商目标漏斗")
        },
        positioning: {
          points: ["产业链方向：围绕已确认主导产业拆解上游、核心环节与配套环节", "空间承接：把研发、生产、展示或办公载体对应到产业链环节", "协同关系：说明产业方向、园区设施与企业服务如何形成组合价值", "表达边界：仅呈现客户已确认产业事实，不补写未提供的政策或企业背书"],
          needs: ["marketData", "spaceData", "projectFiles"],
          visual: v("park-positioning-map", "主导产业、配套环节、载体条件和服务能力四层定位图", "园区产业定位图")
        },
        resources: {
          points: ["区位基础：呈现客户已确认地点及其对招商沟通的作用", "空间载体：按研发、办公、生产或展示场景整理已确认条件", "产业基础：梳理已提供的链条、平台与协同资源，不虚构企业背书", "服务支撑：呈现已确认服务入口和服务能力，政策细则留在资料缺口"],
          needs: ["spaceData", "policyFiles", "projectFiles", "caseFiles"],
          visual: v("park-resource-canvas", "区位、空间、产业、政策、服务五维资源画布", "园区招商资源画布")
        },
        architecture: {
          points: ["招商内容：统一园区定位、产业方向、载体条件与企业服务口径", "目标触达：围绕目标企业类型组织推介会、定向拜访、渠道合作与线上内容", "转化推进：串联资料交换、到访考察、空间匹配、方案沟通与入驻洽谈", "运营协同：明确招商口径更新、线索跟进、接待协同与责任分工"],
          needs: ["investmentLeads", "projectFiles", "policyFiles"],
          visual: v("park-conversion-system", "内容口径、目标触达、转化推进、运营协同四层招商转化体系", "园区招商触达与转化体系")
        },
        service: {
          points: ["服务入口：说明企业从咨询、看址到入驻沟通的服务触点", "服务内容：呈现客户已确认的企业服务、产业协同和运营支持能力", "服务协同：把招商团队、园区运营和外部合作方责任连接起来", "服务表达：用企业可理解的场景说明服务价值和办理入口"],
          needs: ["projectFiles", "policyFiles", "investmentLeads"],
          visual: v("park-service-map", "咨询、看址、入驻、运营四阶段企业服务地图", "园区企业服务地图")
        },
        process: {
          points: ["初步接洽：明确企业需求、空间意向和沟通联系人", "资料交换：提供园区资料包并收集企业基础信息", "到访沟通：组织现场参观、载体介绍和服务能力说明", "合作推进：围绕空间匹配、服务支持和入驻条件形成下一步安排"],
          needs: ["investmentLeads", "projectFiles", "spaceData"],
          visual: v("park-entry-flow", "接洽、资料交换、到访沟通、合作推进四节点流程图", "企业入驻合作流程")
        },
        value: {
          points: ["对企业：说明空间、产业协同、人才与服务如何支持发展任务", "对园区：形成目标企业筛选、线索跟进与到访转化的统一链路", "对合作方：明确招商渠道、信息口径与项目协同边界", "价值表达关联园区资料、企业需求与后续考察，不作收益承诺"],
          needs: ["interviews", "investmentLeads", "caseFiles", "policyFiles"],
          visual: v("park-value-chain", "企业需求—园区资源—服务路径—验证动作价值链", "园区招商价值链")
        },
        plan: {
          points: ["第一阶段：整理已确认产业定位、载体条件与招商资料包", "第二阶段：制作推介材料并开展定向触达、资料交换和到访邀约", "第三阶段：围绕选址、空间、服务与合作条件进入方案沟通和洽谈", "建立线索来源、跟进状态、流失原因和入驻反馈的复盘字段"],
          needs: ["investmentLeads", "spaceData", "policyFiles", "projectFiles"],
          visual: v("park-conversion-roadmap", "资料整理—企业触达—到访考察—方案洽谈四阶段路线图", "园区招商转化路线图")
        },
        model: {
          points: ["合作入口：明确咨询、看址、资料交换和入驻沟通的启动条件", "责任分工：区分企业资料准备、园区接待、服务对接和后续跟进", "交付内容：形成招商资料包、空间匹配建议和合作推进清单", "推进机制：以联系人、时间节点和下一步安排支撑后续洽谈"],
          needs: ["projectFiles", "investmentLeads", "spaceData"],
          visual: v("park-cooperation-model", "企业、园区、服务协同方三方责任泳道", "园区招商合作模式")
        },
        closing: {
          points: ["收束园区定位、目标企业、资源证据与招商转化路径", "明确内容更新、线索跟进、到访接待和洽谈推进的责任人", "以招商资料包、目标企业沟通和考察流程承接下一步行动", "围绕企业理解、现场到访和合作推进形成统一口径"],
          needs: ["investmentLeads", "spaceData", "policyFiles", "projectFiles"],
          visual: v("park-next-roadmap", "资料包、目标企业、到访考察、洽谈推进四阶段行动路线图", "园区招商下一步路线图")
        }
      }
    }
  },
  {
    id: "history_culture",
    label: "历史文化",
    pattern: /历史|文化|审美|遗产|古代|传统|人文|诗词|绘画|建筑|西湖/,
    titleNoun: "历史文化研究",
    forbiddenTerms: ["转化率", "辅助驾驶", "门店咨询", "奶茶"],
    overrides: {
      history_culture: {
        origin: {
          points: ["界定主题涉及的地域、时代范围与核心概念", "说明自然环境、社会生活、制度与审美形成之间的关系", "区分同时代史料、后世阐释、文学想象与当代传播", "建立文献、图像、器物、建筑或景观的证据目录"],
          needs: ["historicalSources", "images"],
          visual: v("culture-source-map", "地域—时代—证据类型三层研究范围图", "历史文化研究范围图")
        },
        timeline: {
          points: ["按形成、转折、成熟、传播与再阐释梳理阶段", "每个时期关联可核验的文本、人物、作品或空间节点", "标记延续传统、制度变化与媒介变化的不同作用", "年代、作者、出处存在争议时并列观点，不强行下结论"],
          needs: ["historicalSources"],
          visual: v("culture-evidence-timeline", "历史阶段时间轴叠加文本、作品与空间证据标签", "历史文化证据时间轴")
        },
        aesthetics: {
          points: ["形式层：从构图、色彩、材质、尺度与节奏提炼可见特征", "观念层：解释自然观、空间观、生活方式与文化语境", "观看层：比较文本阅读、图像观看与现场游观的体验差异", "以作品和空间证据支撑审美判断，避免只堆抽象形容词"],
          needs: ["images", "historicalSources"],
          visual: v("culture-aesthetic-board", "形式、观念、观看方式、证据四区审美分析板", "历史文化审美分析板")
        },
        contemporary: {
          points: ["研究价值：保留史料出处、时间口径与不同解释", "公共传播：把复杂脉络转化为可理解的观看路径", "设计转译：提炼结构原则而非表面复制传统符号", "建立图像版权、文化审核与持续资料校验清单"],
          needs: ["historicalSources", "images"],
          visual: v("culture-translation-matrix", "历史依据 × 当代表达 × 使用边界转译矩阵", "历史文化当代转译矩阵")
        },
        closing: {
          points: ["汇总可由史料、图像与空间证据支持的核心审美线索", "区分历史事实、研究解释与当代转译建议的使用边界", "补齐年代、作者、出处、图片版权与争议观点的核验记录", "下一步形成证据目录、观看路径与公共传播版本"],
          needs: ["historicalSources", "images"],
          visual: v("culture-next-roadmap", "证据整理、脉络校验、观看设计、公共传播四阶段路线图", "历史文化研究下一步路线图")
        }
      }
    }
  },
  {
    id: "generic",
    label: "通用行业",
    pattern: /.*/,
    titleNoun: "主题研究",
    forbiddenTerms: [],
    overrides: {}
  }
];

export function detectIndustryProfile(source) {
  const text = String(source || "");
  const profile = INDUSTRY_PROFILES.find(profile => profileMatches(profile, text)) || INDUSTRY_PROFILES.at(-1);
  return withProfileDiagnostics(profile, text);
}

export function detectIndustryProfileForType(source, typeId) {
  const text = String(source || "");
  const matches = INDUSTRY_PROFILES.filter(profile => profileMatches(profile, text));
  const profile = matches.find(profile => profile.overrides?.[typeId]) || matches[0] || INDUSTRY_PROFILES.at(-1);
  return withProfileDiagnostics(profile, text);
}

function profileMatches(profile, text) {
  if (!profile.pattern.test(text)) return false;
  if (profile.id !== "history_culture") return true;
  const strongSignals = ["历史", "遗产", "古迹", "博物馆", "文物", "朝代", "文化史", "史料", "古代"];
  const supportingSignals = ["审美", "传统", "人文", "诗词", "绘画", "建筑", "西湖"];
  if (strongSignals.some(term => text.includes(term))) return true;
  return supportingSignals.filter(term => text.includes(term)).length >= 2;
}

export function applyIndustryProfile(recipe, typeId, sectionId, profile) {
  const override = profile?.overrides?.[typeId]?.[sectionId];
  if (!override) return cloneRecipe(recipe);
  return {
    ...cloneRecipe(recipe),
    ...override,
    points: override.points ? [...override.points] : [...(recipe.points || [])],
    needs: override.needs ? [...override.needs] : [...(recipe.needs || [])],
    visual: override.visual ? { ...override.visual } : { ...recipe.visual },
    alternatives: [...(recipe.alternatives || [])]
  };
}

export function industryHasForbiddenTerms(profile, text) {
  return (profile?.forbiddenTerms || []).filter(term => String(text || "").includes(term));
}

function cloneRecipe(recipe) {
  return {
    ...recipe,
    points: [...(recipe.points || [])],
    needs: [...(recipe.needs || [])],
    visual: { ...recipe.visual },
    alternatives: [...(recipe.alternatives || [])].map(item => ({ ...item }))
  };
}

function withProfileDiagnostics(profile, text) {
  const triggerTerms = profileTriggerTerms(profile, text);
  return {
    ...profile,
    profile_trigger_terms: triggerTerms,
    profile_confidence: profile.id === "generic" ? "none" : triggerTerms.length >= 2 ? "high" : "strong_signal"
  };
}

function profileTriggerTerms(profile, text) {
  const source = String(text || "");
  const termsByProfile = {
    park_investment: ["园区", "产业园", "招商入驻", "园区运营", "产业载体", "入驻企业", "企业入驻", "入驻流程", "开发区", "孵化器", "企业招引"],
    new_energy_vehicle: ["新能源车", "新能源汽车", "电动汽车", "电动车", "纯电", "插混", "增程", "智能汽车"],
    food_beverage: ["奶茶", "茶饮", "咖啡", "餐饮", "饮品", "门店", "餐厅", "甜品", "烘焙"],
    history_culture: ["历史", "文化", "审美", "遗产", "古代", "传统", "人文", "诗词", "绘画", "建筑", "西湖"]
  };
  return [...new Set((termsByProfile[profile?.id] || []).filter(term => source.includes(term)))];
}
