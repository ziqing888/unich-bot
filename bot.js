
import axios from 'axios';
import fs from 'fs/promises';
import events from 'events';

// 配置对象
const CONFIG = {
    tokensFile: 'tokens.txt',             
    apiBaseUrl: 'https://api.unich.com',   
    miningInterval: 60 * 60 * 1000,       
    taskDelay: 500,                      
};

// 创建事件驱动
const eventEmitter = new events.EventEmitter();

// 工具函数
const utils = {
    async readTokens(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return data.split('\n').map(line => line.trim()).filter(Boolean);
        } catch (error) {
            console.error(`[错误] 无法读取令牌文件：${error.message}`);
            return [];
        }
    },
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    getTimestamp() {
        const now = new Date();
        const offset = 8 * 60 * 60 * 1000; // UTC+8 时区偏移
        const beijingTime = new Date(now.getTime() + offset);
        return beijingTime.toISOString().replace('T', ' ').split('.')[0]; // 输出格式：YYYY-MM-DD HH:mm:ss
    },
};

function logWithTimestamp(level, message) {
    const timestamp = utils.getTimestamp();
    console.log(`[${timestamp}] [${level}] ${message}`);
}

// 核心逻辑
class MinerBot {
    constructor(config) {
        this.config = config;
        this.tokens = [];
    }

    async init() {
        logWithTimestamp('信息', '初始化 MinerBot...');
        this.tokens = await utils.readTokens(this.config.tokensFile);
        if (this.tokens.length === 0) {
            logWithTimestamp('错误', '未找到任何令牌，程序退出！');
            process.exit(1);
        }
        logWithTimestamp('信息', `加载 ${this.tokens.length} 个令牌。`);
    }

    async startMining(token) {
        try {
            const response = await axios.post(
                `${this.config.apiBaseUrl}/airdrop/user/v1/mining/start`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            logWithTimestamp('信息', `挖矿已成功启动 - Token: ${token}`);
            return response.data;
        } catch (error) {
            logWithTimestamp('错误', `启动挖矿失败 - Token: ${token} - ${error.message}`);
        }
    }

    async getRecentMining(token) {
        try {
            const response = await axios.get(
                `${this.config.apiBaseUrl}/airdrop/user/v1/mining/recent`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const miningData = response.data.data;
            logWithTimestamp('信息', `挖矿状态：${miningData.isMining ? '已开启' : '未开启'} | 当前总积分：${miningData.mUn}`);
            return miningData;
        } catch (error) {
            logWithTimestamp('错误', `获取挖矿状态失败 - Token: ${token} - ${error.message}`);
        }
    }

    async getTasks(token) {
        try {
            const response = await axios.get(
                `${this.config.apiBaseUrl}/airdrop/user/v1/social/list-by-user`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const tasks = response.data.data.items || [];
            const unclaimedTasks = tasks.filter(task => !task.claimed);
            logWithTimestamp('信息', `发现 ${unclaimedTasks.length} 个未领取的任务。`);
            return unclaimedTasks;
        } catch (error) {
            logWithTimestamp('错误', `获取任务失败 - Token: ${token} - ${error.message}`);
            return [];
        }
    }

    async claimReward(token, taskId) {
        try {
            const response = await axios.post(
                `${this.config.apiBaseUrl}/airdrop/user/v1/social/claim/${taskId}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            logWithTimestamp('成功', `奖励领取成功：获得 ${response.data.data.pointReward} 积分`);
            return response.data;
        } catch (error) {
            logWithTimestamp('错误', `奖励领取失败 - 任务ID: ${taskId} - ${error.message}`);
        }
    }

    async processToken(token) {
        const miningData = await this.getRecentMining(token);
        if (!miningData?.isMining) {
            await this.startMining(token);
            logWithTimestamp('信息', `挖矿已启动 - 当前总积分：${miningData.mUn}`);
        } else {
            logWithTimestamp('信息', `挖矿状态：已开启 | 当前总积分：${miningData.mUn}`);
        }

        const unclaimedTasks = await this.getTasks(token);

        if (unclaimedTasks.length > 0) {
            logWithTimestamp('信息', `发现 ${unclaimedTasks.length} 个未领取的任务。`);
            for (const task of unclaimedTasks) {
                logWithTimestamp('信息', `正在尝试领取任务：任务ID ${task.id}`);
                await this.claimReward(token, task.id);
                await utils.delay(this.config.taskDelay); // 防止请求过于频繁
            }
        } else {
            logWithTimestamp('信息', '当前没有未领取的任务。');
        }
    }

    async run() {
        logWithTimestamp('信息', '========================== 挖矿和任务处理开始 ==========================');
        while (true) {
            let hasUnclaimedTasks = false;

            for (const token of this.tokens) {
                const unclaimedTasks = await this.getTasks(token);
                if (unclaimedTasks.length > 0) {
                    hasUnclaimedTasks = true;
                }
                await this.processToken(token);
            }

            if (!hasUnclaimedTasks) {
                logWithTimestamp('警告', '当前无新任务或挖矿已完成，等待 60 分钟后重新检查...');
            }
            logWithTimestamp('信息', '========================== 挖矿和任务处理结束 ==========================');
            await utils.delay(this.config.miningInterval);
        }
    }
}

// 主函数
(async () => {
    const minerBot = new MinerBot(CONFIG);
    await minerBot.init();
    minerBot.run();
})();
