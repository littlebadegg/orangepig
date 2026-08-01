/**
 * Sequelize 实例初始化 + 模型关联定义
 *
 * 使用方式：
 *   const { User, Post, Comment, Like, Follow } = require('../models')
 *   const user = await User.findByPk(1)
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
    pool: config.mysql.pool,
    define: {
      timestamps: true,
      createdAt: 'createTime',
      updatedAt: 'updateTime',
      underscored: true, // 驼峰 → 下划线，如 nickName → nick_name
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
    logging: process.env.NODE_ENV === 'development' ? (msg) => console.log('[SQL]', msg) : false,
  }
)

// ============ 模型定义 ============

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
    defaultValue: '微信用户',
    field: 'nick_name',
  },
  avatarUrl: {
    type: DataTypes.STRING(500),
    defaultValue: '',
    field: 'avatar_url',
  },
  gender: {
    type: DataTypes.TINYINT,
    defaultValue: 0,
  },
  bio: {
    type: DataTypes.STRING(200),
    defaultValue: '',
  },
  followingCount: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0,
    field: 'following_count',
  },
  followersCount: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0,
    field: 'followers_count',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'users',
})

const Post = sequelize.define('Post', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  authorId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'author_id',
  },
  content: {
    type: DataTypes.STRING(500),
    defaultValue: '',
  },
  images: {
    // MySQL 5.7+ 支持 JSON 类型，存储图片 URL 数组
    type: DataTypes.JSON,
    defaultValue: [],
  },
  topicId: {
    type: DataTypes.STRING(50),
    defaultValue: '',
    field: 'topic_id',
  },
  likeCount: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0,
    field: 'like_count',
  },
  commentCount: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0,
    field: 'comment_count',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'posts',
})

const Comment = sequelize.define('Comment', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  postId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'post_id',
  },
  authorId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'author_id',
  },
  content: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  replyToUserId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'reply_to_user_id',
  },
  replyToCommentId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    field: 'reply_to_comment_id',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'comments',
})

const Like = sequelize.define('Like', {
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
  targetId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    field: 'target_id',
  },
  targetType: {
    type: DataTypes.ENUM('post', 'comment'),
    defaultValue: 'post',
    field: 'target_type',
  },
}, {
  tableName: 'likes',
  // 一个用户对同一目标只能点赞一次
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'target_id', 'target_type'],
    },
  ],
})

const Follow = sequelize.define('Follow', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  follower: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  following: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
}, {
  tableName: 'follows',
  // 一个人只能关注另一个人一次
  indexes: [
    {
      unique: true,
      fields: ['follower', 'following'],
    },
  ],
})

const Photo = sequelize.define('Photo', {
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
  imageUrl: {
    type: DataTypes.STRING(500),
    allowNull: false,
    field: 'image_url',
  },
  title: {
    type: DataTypes.STRING(200),
    defaultValue: '',
  },
  // 拍照地点（文字描述）
  location: {
    type: DataTypes.STRING(200),
    defaultValue: '',
  },
  // 纬度
  latitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
  },
  // 经度
  longitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
  },
  // 拍照时间（照片本身的拍摄时间）
  photoTime: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'photo_time',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'photos',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['photo_time'] },
  ],
})

// ============ 模型关联 ============

// 用户 → 帖子（一对多）
User.hasMany(Post, { foreignKey: 'authorId', as: 'posts' })
Post.belongsTo(User, { foreignKey: 'authorId', as: 'author' })

// 用户 → 评论（一对多）
User.hasMany(Comment, { foreignKey: 'authorId', as: 'comments' })
Comment.belongsTo(User, { foreignKey: 'authorId', as: 'author' })

// 帖子 → 评论（一对多）
Post.hasMany(Comment, { foreignKey: 'postId', as: 'comments' })
Comment.belongsTo(Post, { foreignKey: 'postId', as: 'post' })

// 评论回复关联（自关联）
Comment.belongsTo(User, { foreignKey: 'replyToUserId', as: 'replyToUser' })

// 用户 → 点赞（一对多）
User.hasMany(Like, { foreignKey: 'userId', as: 'likes' })
Like.belongsTo(User, { foreignKey: 'userId', as: 'user' })

// 用户 → 关注关系（多对多）
Follow.belongsTo(User, { foreignKey: 'follower', as: 'followerUser' })
Follow.belongsTo(User, { foreignKey: 'following', as: 'followingUser' })

// 用户 → 照片（一对多）
User.hasMany(Photo, { foreignKey: 'userId', as: 'photos' })
Photo.belongsTo(User, { foreignKey: 'userId', as: 'user' })

module.exports = {
  sequelize,
  Sequelize,
  User,
  Post,
  Comment,
  Like,
  Follow,
  Photo,
}
