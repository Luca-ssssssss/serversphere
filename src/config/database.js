const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/serversphere', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 50
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['admin', 'moderator', 'user'],
        default: 'user'
    },
    servers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Server'
    }],
    preferences: {
        language: {
            type: String,
            enum: ['en', 'de'],
            default: 'en'
        },
        theme: {
            type: String,
            enum: ['dark', 'light', 'auto'],
            default: 'dark'
        },
        notifications: {
            email: { type: Boolean, default: true },
            discord: { type: Boolean, default: false },
            push: { type: Boolean, default: true }
        }
    },
    apiKey: String,
    lastLogin: Date,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

userSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const serverSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['vanilla', 'paper', 'purpur', 'fabric', 'forge', 'spigot'],
        default: 'vanilla'
    },
    version: String,
    port: {
        type: Number,
        default: 25565,
        min: 1024,
        max: 65535
    },
    ram: {
        type: Number,
        default: 4096,
        min: 1024,
        max: 32768
    },
    status: {
        type: String,
        enum: ['offline', 'starting', 'online', 'stopping', 'restarting', 'error'],
        default: 'offline'
    },
    players: {
        online: { type: Number, default: 0 },
        max: { type: Number, default: 20 },
        list: [String]
    },
    performance: {
        tps: { type: Number, default: 20 },
        cpu: { type: Number, default: 0 },
        memory: { type: Number, default: 0 }
    },
    properties: mongoose.Schema.Types.Mixed,
    backups: [{
        name: String,
        path: String,
        size: Number,
        createdAt: Date,
        automatic: Boolean
    }],
    plugins: [String],
    mods: [String],
    scheduledTasks: [{
        type: { type: String, enum: ['backup', 'restart', 'command'] },
        schedule: String,
        command: String,
        enabled: Boolean,
        lastRun: Date,
        nextRun: Date
    }],
    settings: {
        autoRestart: { type: Boolean, default: false },
        autoBackup: { type: Boolean, default: true },
        backupFrequency: { type: String, default: 'daily' },
        memoryAlert: { type: Number, default: 90 },
        cpuAlert: { type: Number, default: 90 }
    },
    statistics: {
        uptime: { type: Number, default: 0 },
        playerCount: { type: Number, default: 0 },
        backupCount: { type: Number, default: 0 },
        restartCount: { type: Number, default: 0 }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

serverSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const backupSchema = new mongoose.Schema({
    server: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Server',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    path: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['manual', 'automatic', 'scheduled'],
        default: 'manual'
    },
    compression: {
        type: String,
        enum: ['zip', 'tar', 'gzip'],
        default: 'zip'
    },
    status: {
        type: String,
        enum: ['creating', 'completed', 'failed', 'restoring'],
        default: 'creating'
    },
    includes: [String],
    excludes: [String],
    notes: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    completedAt: Date
});

const logSchema = new mongoose.Schema({
    level: {
        type: String,
        enum: ['info', 'warning', 'error', 'debug'],
        default: 'info'
    },
    source: {
        type: String,
        enum: ['server', 'system', 'user', 'api'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    data: mongoose.Schema.Types.Mixed,
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    server: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Server'
    },
    ip: String,
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
});

const User = mongoose.model('User', userSchema);
const Server = mongoose.model('Server', serverSchema);
const Backup = mongoose.model('Backup', backupSchema);
const Log = mongoose.model('Log', logSchema);

module.exports = {
    connectDB,
    User,
    Server,
    Backup,
    Log
};