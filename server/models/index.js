/**
 * Sequelize 实例初始化 + 模型关联定义
 *
 * 宝宝喂养记录小程序 — 数据模型
 *
 * 使用方式：
 *   const { User, Baby, FeedingRecord } = require('../models')
 *   const list = await FeedingRecord.findAll({ where: { babyId } })
 *
 * ⚠️ 时区处理：
 *   数据库 DATETIME 存的是东八区本地时间，sequelize 配了 timezone: '+08:00'
 *   读写往返一致，不会出现 8 小时偏移
 */
const { Sequelize, DataTypes } = require('sequelize')
const config = require('../config')

// 创建 Sequelize 实例（连接池模式）
const sequelize = new Sequelize(
  config.mysql.database,
  config.mysql.username,
  config.mysql.password,
  {
    host: config.mysql.host,
    port: config.mysql.port,
    dialect: 'mysql',
    // 关键：按东八区读写 DATETIME，保证存取一致
    timezone: '+08:00',
    pool: config.mysql.pool,
    define: {
      timestamps: true,
      createdAt: 'createTime',
      updatedAt: 'updateTime',
      underscored: true, // 驼峰 → 下划线，如 babyId → baby_id
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
    logging: process.env.NODE_ENV === 'development' ? (msg) => console.log('[SQL]', msg) : false,
  }
)

// ============ 模型定义 ============

/**
 * 用户（微信身份）
 */
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  openid: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
  },
  unionid: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  nickName: {
    type: DataTypes.STRING(50),
    defaultValue: '宝宝家长',
    field: 'nick_name',
  },
  avatarUrl: {
    type: DataTypes.STRING(500),
    defaultValue: '',
    field: 'avatar_url',
  },
  // 当前选中的宝宝（快速切换，避免每次重新选）
  currentBabyId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'current_baby_id',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'users',
})

/**
 * 宝宝
 */
const Baby = sequelize.define('Baby', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'user_id',
  },
  name: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: '宝宝',
  },
  // 性别：0 未知 / 1 男 / 2 女
  gender: {
    type: DataTypes.TINYINT,
    defaultValue: 0,
  },
  // 生日
  birthday: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  avatarUrl: {
    type: DataTypes.STRING(500),
    defaultValue: '',
    field: 'avatar_url',
  },
  // 邀请码：家人凭此码加入，一起记录这个宝宝
  inviteCode: {
    type: DataTypes.STRING(8),
    allowNull: true,
    field: 'invite_code',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'babies',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['invite_code'] },
  ],
})

/**
 * 宝宝家庭成员
 * 创建者是 owner，被邀请进来的是 member，两边都能记录和查看
 */
const BabyMember = sequelize.define('BabyMember', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  babyId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'baby_id',
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'user_id',
  },
  // owner 创建者（可改资料/删宝宝/管成员） | member 被邀请的家人
  role: {
    type: DataTypes.ENUM('owner', 'member'),
    defaultValue: 'member',
  },
  // 和宝宝的关系称呼：妈妈 / 爸爸 / 奶奶 …，时间线里显示「谁记的」
  relation: {
    type: DataTypes.STRING(20),
    defaultValue: '',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'baby_members',
  indexes: [
    { fields: ['baby_id'] },
    { fields: ['user_id'] },
    { fields: ['baby_id', 'user_id'] },
  ],
})

/**
 * 喂养记录
 * type: formula 奶粉（记毫升）/ breast 母乳（记时长）
 */
const FeedingRecord = sequelize.define('FeedingRecord', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  babyId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'baby_id',
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'user_id',
  },
  // 喂养方式
  type: {
    type: DataTypes.ENUM('formula', 'breast'),
    defaultValue: 'formula',
  },
  // 奶量（毫升）— 奶粉必填
  amount: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },
  // 时长（分钟）— 母乳亲喂时长
  duration: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },
  // 喂养时间
  time: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  note: {
    type: DataTypes.STRING(100),
    defaultValue: '',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'feeding_records',
  indexes: [
    { fields: ['baby_id', 'time'] },
  ],
})

/**
 * 换尿片记录
 * type: pee 拉尿 / poo 拉屎 / both 都有
 */
const DiaperRecord = sequelize.define('DiaperRecord', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  babyId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'baby_id',
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'user_id',
  },
  type: {
    type: DataTypes.ENUM('pee', 'poo', 'both'),
    defaultValue: 'pee',
  },
  time: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  note: {
    type: DataTypes.STRING(100),
    defaultValue: '',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'diaper_records',
  indexes: [
    { fields: ['baby_id', 'time'] },
  ],
})

/**
 * 睡眠记录
 * endTime / duration 为空表示「正在睡」
 */
const SleepRecord = sequelize.define('SleepRecord', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  babyId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'baby_id',
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'user_id',
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'start_time',
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_time',
  },
  // 睡眠时长（分钟），结束时写入
  duration: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },
  note: {
    type: DataTypes.STRING(100),
    defaultValue: '',
  },
  // 0 进行中 / 1 已完成
  recordStatus: {
    type: DataTypes.TINYINT,
    defaultValue: 0,
    field: 'record_status',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'sleep_records',
  indexes: [
    { fields: ['baby_id', 'start_time'] },
  ],
})

/**
 * 排气操记录
 * 帮助宝宝排气的体操，记一次做了多少分钟
 */
const ExerciseRecord = sequelize.define('ExerciseRecord', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  babyId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'baby_id',
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'user_id',
  },
  // 时长（分钟）
  duration: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },
  // 是否成功排气 / 打嗝（0 未记录 / 1 有 / 2 没有）
  result: {
    type: DataTypes.TINYINT,
    defaultValue: 0,
  },
  time: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  note: {
    type: DataTypes.STRING(100),
    defaultValue: '',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'exercise_records',
  indexes: [
    { fields: ['baby_id', 'time'] },
  ],
})

/**
 * 生长发育记录（身高 / 体重）
 * 两个字段都可空，允许只量身高或只称体重
 */
const GrowthRecord = sequelize.define('GrowthRecord', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  babyId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'baby_id',
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'user_id',
  },
  // 身高（cm），保留 1 位小数
  height: {
    type: DataTypes.DECIMAL(5, 1),
    allowNull: true,
  },
  // 体重（kg），保留 2 位小数
  weight: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  time: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  note: {
    type: DataTypes.STRING(100),
    defaultValue: '',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'growth_records',
  indexes: [
    { fields: ['baby_id', 'time'] },
  ],
})

/**
 * 体温记录
 */
const TemperatureRecord = sequelize.define('TemperatureRecord', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  babyId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'baby_id',
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'user_id',
  },
  // 体温（℃），保留 1 位小数
  temperature: {
    type: DataTypes.DECIMAL(3, 1),
    allowNull: false,
  },
  // 测量方式：ear 耳温 / forehead 额温 / armpit 腋温 / oral 口温
  method: {
    type: DataTypes.ENUM('ear', 'forehead', 'armpit', 'oral'),
    defaultValue: 'ear',
  },
  time: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  note: {
    type: DataTypes.STRING(100),
    defaultValue: '',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'temperature_records',
  indexes: [
    { fields: ['baby_id', 'time'] },
  ],
})

/**
 * 吐奶记录
 * level: 1 少量 / 2 中量 / 3 大量
 */
const SpitUpRecord = sequelize.define('SpitUpRecord', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  babyId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'baby_id',
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'user_id',
  },
  // 吐奶量：1 少量（一口）/ 2 中量 / 3 大量
  level: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
  time: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  note: {
    type: DataTypes.STRING(100),
    defaultValue: '',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'spit_up_records',
  indexes: [
    { fields: ['baby_id', 'time'] },
  ],
})

/**
 * 洗澡记录
 */
const BathRecord = sequelize.define('BathRecord', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  babyId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'baby_id',
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'user_id',
  },
  // 洗澡时长（分钟），可以只记「洗了」不记时长
  duration: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },
  // 水温（℃），选填
  waterTemp: {
    type: DataTypes.DECIMAL(3, 1),
    allowNull: true,
    field: 'water_temp',
  },
  time: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  note: {
    type: DataTypes.STRING(100),
    defaultValue: '',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'bath_records',
  indexes: [
    { fields: ['baby_id', 'time'] },
  ],
})

// ============ 模型关联 ============

// 用户 → 宝宝（一对多）
User.hasMany(Baby, { foreignKey: 'userId', as: 'babies' })
Baby.belongsTo(User, { foreignKey: 'userId', as: 'user' })

// 宝宝 → 各类记录（一对多）
Baby.hasMany(FeedingRecord, { foreignKey: 'babyId', as: 'feedings' })
FeedingRecord.belongsTo(Baby, { foreignKey: 'babyId', as: 'baby' })

Baby.hasMany(DiaperRecord, { foreignKey: 'babyId', as: 'diapers' })
DiaperRecord.belongsTo(Baby, { foreignKey: 'babyId', as: 'baby' })

Baby.hasMany(SleepRecord, { foreignKey: 'babyId', as: 'sleeps' })
SleepRecord.belongsTo(Baby, { foreignKey: 'babyId', as: 'baby' })

Baby.hasMany(ExerciseRecord, { foreignKey: 'babyId', as: 'exercises' })
ExerciseRecord.belongsTo(Baby, { foreignKey: 'babyId', as: 'baby' })

Baby.hasMany(GrowthRecord, { foreignKey: 'babyId', as: 'growths' })
GrowthRecord.belongsTo(Baby, { foreignKey: 'babyId', as: 'baby' })

Baby.hasMany(TemperatureRecord, { foreignKey: 'babyId', as: 'temperatures' })
TemperatureRecord.belongsTo(Baby, { foreignKey: 'babyId', as: 'baby' })

Baby.hasMany(SpitUpRecord, { foreignKey: 'babyId', as: 'spitUps' })
SpitUpRecord.belongsTo(Baby, { foreignKey: 'babyId', as: 'baby' })

Baby.hasMany(BathRecord, { foreignKey: 'babyId', as: 'baths' })
BathRecord.belongsTo(Baby, { foreignKey: 'babyId', as: 'baby' })

// 宝宝 ↔ 家庭成员（多对多中间表）
Baby.hasMany(BabyMember, { foreignKey: 'babyId', as: 'members' })
BabyMember.belongsTo(Baby, { foreignKey: 'babyId', as: 'baby' })
User.hasMany(BabyMember, { foreignKey: 'userId', as: 'babyMembers' })
BabyMember.belongsTo(User, { foreignKey: 'userId', as: 'user' })

// 用户 → 各类记录（一对多，便于按用户维度查询/清理）
User.hasMany(FeedingRecord, { foreignKey: 'userId', as: 'feedings' })
User.hasMany(DiaperRecord, { foreignKey: 'userId', as: 'diapers' })
User.hasMany(SleepRecord, { foreignKey: 'userId', as: 'sleeps' })
User.hasMany(ExerciseRecord, { foreignKey: 'userId', as: 'exercises' })
User.hasMany(GrowthRecord, { foreignKey: 'userId', as: 'growths' })
User.hasMany(TemperatureRecord, { foreignKey: 'userId', as: 'temperatures' })
User.hasMany(SpitUpRecord, { foreignKey: 'userId', as: 'spitUps' })
User.hasMany(BathRecord, { foreignKey: 'userId', as: 'baths' })

module.exports = {
  sequelize,
  Sequelize,
  User,
  Baby,
  BabyMember,
  FeedingRecord,
  DiaperRecord,
  SleepRecord,
  ExerciseRecord,
  GrowthRecord,
  TemperatureRecord,
  SpitUpRecord,
  BathRecord,
}
