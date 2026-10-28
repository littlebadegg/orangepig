/**
 * 养育小贴士种子数据
 *
 * 数据来源：
 * - 《中国居民膳食指南(2022)》/ 中国营养学会《7~24月龄婴幼儿喂养指南》
 * - WHO 儿童生长标准（2006，0-5岁）体重/身长中位数（50th 百分位）
 * - 美国睡眠基金会（NSF）婴幼儿睡眠时长推荐
 * - 中华医学会儿科学分会儿童保健学组 婴幼儿喂养建议
 *
 * 按宝宝出生后天数（minDays ~ maxDays 闭区间）匹配展示
 */

const CARE_TIPS = [
  // ================= 新生儿 0~28 天 =================
  {
    category: 'feeding',
    title: '奶量参考',
    content: '按需喂养，每天8~12次。配方奶每次约30~90ml，逐渐加量；母乳宝宝按需亲喂，两侧轮换。',
    minDays: 0, maxDays: 28, sortOrder: 1,
  },
  {
    category: 'supplement',
    title: '维生素AD/D',
    content: '出生后数天开始每天补充维生素D 400IU（AD制剂每天1粒），促进钙吸收，预防佝偻病。',
    minDays: 0, maxDays: 1095, sortOrder: 1,
  },
  {
    category: 'water',
    title: '需要喂水吗',
    content: '6月龄内纯母乳或配方奶喂养一般不需要额外喂水，奶里的水分已足够；天气炎热或医嘱建议时，可在两顿奶之间喂10~20ml。',
    minDays: 0, maxDays: 179, sortOrder: 1,
  },
  {
    category: 'sleep',
    title: '睡眠时长',
    content: '每天约16~20小时，单次睡2~4小时，昼夜不分。宝宝睡着时不必刻意叫醒喂奶（体重增长正常时）。',
    minDays: 0, maxDays: 28, sortOrder: 1,
  },
  {
    category: 'outdoor',
    title: '户外活动',
    content: '满月后可开始短时间户外，从每天10~15分钟开始，选择温暖无风的时段，避免阳光直射眼睛。',
    minDays: 0, maxDays: 28, sortOrder: 1,
  },
  {
    category: 'growth',
    title: '生长参考',
    content: '出生体重约3.2~3.3kg、身长约50cm。出生后生理性体重下降不超过7%，满月增重600g以上为正常。',
    minDays: 0, maxDays: 28, sortOrder: 1,
  },
  {
    category: 'development',
    title: '本月龄能做什么',
    content: '能追视黑白卡、追听声音，俯卧时能抬头片刻。多和宝宝说话、做抚触。',
    minDays: 0, maxDays: 28, sortOrder: 1,
  },
  {
    category: 'health',
    title: '健康观察',
    content: '每天小便6~8次、尿色淡黄说明奶量充足。生理性黄疸2周内消退，肚脐残端1~2周脱落。',
    minDays: 0, maxDays: 28, sortOrder: 1,
  },

  // ================= 1~3 月龄 29~89 天 =================
  {
    category: 'feeding',
    title: '奶量参考',
    content: '每天约6~8次。配方奶每次90~150ml、全天总量600~800ml；母乳宝宝按需亲喂。',
    minDays: 29, maxDays: 89, sortOrder: 2,
  },
  {
    category: 'water',
    title: '需要喂水吗',
    content: '6月龄内一般不需要额外喂水；配方奶宝宝出现便秘时，可在两顿奶之间喂10~20ml温水。',
    minDays: 29, maxDays: 179, sortOrder: 2,
  },
  {
    category: 'sleep',
    title: '睡眠时长',
    content: '每天约14~17小时，白天小睡3~5次。可以开始帮宝宝区分昼夜：晚上光线暗、声音轻。',
    minDays: 29, maxDays: 89, sortOrder: 2,
  },
  {
    category: 'outdoor',
    title: '户外活动',
    content: '每天户外1~2次，共30分钟到1小时，晒晒太阳帮助维生素D合成，注意遮挡强光。',
    minDays: 29, maxDays: 89, sortOrder: 2,
  },
  {
    category: 'growth',
    title: '生长参考',
    content: '每月增重约0.7~1kg。WHO中位数：3月龄男宝6.4kg/61.4cm，女宝5.8kg/59.8cm。',
    minDays: 29, maxDays: 89, sortOrder: 2,
  },
  {
    category: 'development',
    title: '本月龄能做什么',
    content: '2月龄会社交性微笑，3月龄抬头稳、笑出声、伸手抓物。每天练习俯卧（tummy time）。',
    minDays: 29, maxDays: 89, sortOrder: 2,
  },
  {
    category: 'health',
    title: '健康观察',
    content: '3月龄后吐奶会逐渐减少。若连续两天大便异常、精神差、吃奶量骤减，及时就医。',
    minDays: 29, maxDays: 89, sortOrder: 2,
  },

  // ================= 4~6 月龄 90~179 天 =================
  {
    category: 'feeding',
    title: '奶量参考',
    content: '每天5~6次。配方奶每次150~200ml、全天总量800~1000ml；单次奶量一般不超过240ml。',
    minDays: 90, maxDays: 179, sortOrder: 3,
  },
  {
    category: 'supplement',
    title: '辅食信号',
    content: '满6月龄开始添加辅食，第一口辅食推荐富铁米粉；不早于满4月龄。出现挺舌反射消失、对食物感兴趣时可以尝试。',
    minDays: 120, maxDays: 179, sortOrder: 2,
  },
  {
    category: 'sleep',
    title: '睡眠时长',
    content: '每天约13~15小时，白天小睡3~4次。部分宝宝开始能睡整觉，夜醒次数减少。',
    minDays: 90, maxDays: 179, sortOrder: 3,
  },
  {
    category: 'outdoor',
    title: '户外活动',
    content: '每天户外1~2小时，分次进行。多看远处和绿色，促进视觉发育。',
    minDays: 90, maxDays: 179, sortOrder: 3,
  },
  {
    category: 'growth',
    title: '生长参考',
    content: '每月增重约500~600g。WHO中位数：6月龄男宝7.9kg/67.6cm，女宝7.3kg/65.7cm。4~5月龄体重约为出生时2倍。',
    minDays: 90, maxDays: 179, sortOrder: 3,
  },
  {
    category: 'development',
    title: '本月龄能做什么',
    content: '4月龄会翻身，6月龄能独坐片刻、认生。多给宝宝抓握不同材质的安全玩具。',
    minDays: 90, maxDays: 179, sortOrder: 3,
  },

  // ================= 7~9 月龄 180~269 天 =================
  {
    category: 'feeding',
    title: '奶量参考',
    content: '每天奶量600~800ml（不低于600ml），分3~4次；辅食2~3次，从富铁米粉逐步加到肉泥、蛋黄、碎菜。',
    minDays: 180, maxDays: 269, sortOrder: 4,
  },
  {
    category: 'water',
    title: '喂水参考',
    content: '6月龄后开始学用吸管杯/敞口杯，两餐之间或吃完辅食后喂水10~50ml，少量多次。',
    minDays: 180, maxDays: 269, sortOrder: 4,
  },
  {
    category: 'sleep',
    title: '睡眠时长',
    content: '每天约12~15小时，白天小睡2~3次。多数宝宝夜里可连续睡6~8小时，夜奶可以逐渐减少。',
    minDays: 180, maxDays: 269, sortOrder: 4,
  },
  {
    category: 'outdoor',
    title: '户外活动',
    content: '每天户外1~2小时，让宝宝多爬、多探索，锻炼大运动和空间感。',
    minDays: 180, maxDays: 269, sortOrder: 4,
  },
  {
    category: 'growth',
    title: '生长参考',
    content: '每月增重约250~350g。WHO中位数：9月龄男宝8.9kg/72.0cm，女宝8.2kg/70.2cm。',
    minDays: 180, maxDays: 269, sortOrder: 4,
  },
  {
    category: 'development',
    title: '本月龄能做什么',
    content: '会爬行、用拇指捏小物、听懂「不」。辅食从泥状过渡到碎末状，锻炼咀嚼。',
    minDays: 180, maxDays: 269, sortOrder: 4,
  },

  // ================= 10~12 月龄 270~365 天 =================
  {
    category: 'feeding',
    title: '奶量参考',
    content: '每天奶量约600ml，分2~3次；辅食2~3次并逐渐成为「正餐」，可引入手指食物练习自主进食。',
    minDays: 270, maxDays: 365, sortOrder: 5,
  },
  {
    category: 'water',
    title: '喂水参考',
    content: '每天喝水约50~100ml，辅食后、活动后少量多次，鼓励用杯子喝。',
    minDays: 270, maxDays: 365, sortOrder: 5,
  },
  {
    category: 'sleep',
    title: '睡眠时长',
    content: '每天约12~14小时，白天小睡2次。夜奶可以逐渐戒掉，有利牙齿和睡眠质量。',
    minDays: 270, maxDays: 365, sortOrder: 5,
  },
  {
    category: 'outdoor',
    title: '户外活动',
    content: '每天户外1~2小时，扶站、扶走多练习，注意地面安全。',
    minDays: 270, maxDays: 365, sortOrder: 5,
  },
  {
    category: 'growth',
    title: '生长参考',
    content: 'WHO中位数：12月龄男宝9.6kg/75.7cm，女宝8.9kg/74.0cm。1岁时体重约为出生时的3倍。',
    minDays: 270, maxDays: 365, sortOrder: 5,
  },
  {
    category: 'development',
    title: '本月龄能做什么',
    content: '扶站、扶走，会有意识地叫「爸爸」「妈妈」，能用杯子喝水、模仿动作。',
    minDays: 270, maxDays: 365, sortOrder: 5,
  },

  // ================= 1 ~ 1.5 岁 366~547 天 =================
  {
    category: 'feeding',
    title: '奶量参考',
    content: '每天奶量400~600ml，三餐两点。可引入鲜牛奶、酸奶、奶酪等奶制品。',
    minDays: 366, maxDays: 547, sortOrder: 6,
  },
  {
    category: 'water',
    title: '喂水参考',
    content: '每天喝水约100~150ml，多次少量；活动量大、出汗多时适当增加。',
    minDays: 366, maxDays: 547, sortOrder: 6,
  },
  {
    category: 'sleep',
    title: '睡眠时长',
    content: '每天约11~14小时，白天小睡1~2次。固定睡前程序有助于入睡。',
    minDays: 366, maxDays: 547, sortOrder: 6,
  },
  {
    category: 'outdoor',
    title: '户外活动',
    content: '每天户外活动至少1~2小时，跑、爬台阶、扔球都很好。',
    minDays: 366, maxDays: 547, sortOrder: 6,
  },
  {
    category: 'growth',
    title: '生长参考',
    content: '1岁后每月增重约150~250g，每年身高增长约10~12cm。',
    minDays: 366, maxDays: 547, sortOrder: 6,
  },
  {
    category: 'development',
    title: '本月龄能做什么',
    content: '独走、搭2~4块积木、说单词句。鼓励自己用勺吃饭，锻炼精细动作。',
    minDays: 366, maxDays: 547, sortOrder: 6,
  },

  // ================= 1.5 ~ 3 岁 548~1095 天 =================
  {
    category: 'feeding',
    title: '奶量参考',
    content: '每天奶量约500ml，饮食以三餐两点为主，注意食物多样、少糖少盐。',
    minDays: 548, maxDays: 1095, sortOrder: 7,
  },
  {
    category: 'water',
    title: '喂水参考',
    content: '每天喝水约150~200ml，少量多次，天热运动后适当增加。',
    minDays: 548, maxDays: 1095, sortOrder: 7,
  },
  {
    category: 'sleep',
    title: '睡眠时长',
    content: '每天约11~14小时，白天小睡1次。规律作息，避免睡前过度兴奋。',
    minDays: 548, maxDays: 1095, sortOrder: 7,
  },
  {
    category: 'outdoor',
    title: '户外活动',
    content: '每天户外2小时以上，跑跳、骑车、玩沙玩水，促进大运动和视力发育。',
    minDays: 548, maxDays: 1095, sortOrder: 7,
  },
  {
    category: 'growth',
    title: '生长参考',
    content: '每年身高增长约8~10cm、体重增加2~3kg。每年至少体检一次。',
    minDays: 548, maxDays: 1095, sortOrder: 7,
  },
  {
    category: 'development',
    title: '本月龄能做什么',
    content: '会跑会跳、说短句、自己吃饭穿简单衣物。多让宝宝和小朋友玩，学习社交。',
    minDays: 548, maxDays: 1095, sortOrder: 7,
  },
]

module.exports = CARE_TIPS
