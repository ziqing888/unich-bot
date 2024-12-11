import axios from 'axios';
import fs from 'fs/promises';
import events from 'events';
import chalk from 'chalk';

/**
 * 📢 电报频道：https://t.me/ksqxszq
 *
 * 免責聲明：
 * 此机器人仅用于教育目的。使用风险自负。
 * 开发人员不对因使用此机器人而导致的任何帐户封禁或处罚负责。
 */

const CONFIG = {
    tokensFile: 'tokens.txt',            
    apiBaseUrl: 'https://api.unich.com',  
    miningInterval: 60 * 60 * 1000,        
    taskDelay: 500,                        
};


const eventEmitter = new events.EventEmitter();

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
        const offset = 8 * 60 * 60 * 1000; 
        const beijingTime = new Date(now.getTime() + offset);
        return beijingTime.toISOString().replace('T', ' ').split('.')[0]; 
    },
};

const logLevels = {
    信息: chalk.blue,
    成功: chalk.green,
    警告: chalk.yellow,
    错误: chalk.red,
};

function logWithTimestamp(level, message) {
    const timestamp = utils.getTimestamp();
    const colorFn = logLevels[level] || chalk.white;
    console.log(`[${timestamp}] [${colorFn(level)}] ${message}`);
}

// 核心逻辑
class MinerBot {
    constructor(config) {
        this.config = config;
        this.tokens = [];
    }

    async init() {
        console.log('📢 电报频道：https://t.me/ksqxszq');
        console.log('=========================================');
        console.log('免責聲明：');
        console.log('此机器人仅用于教育目的。使用风险自负。');
        console.log('开发人员不对因使用此机器人而导致的任何帐户封禁或处罚负责。');
        console.log('=========================================');

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
            const payload = { evidence: taskId }; 

            const response = await axios.post(
                `${this.config.apiBaseUrl}/airdrop/user/v1/social/claim/${taskId}`,
                payload,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            logWithTimestamp('成功', `任务领取成功：任务ID ${taskId}，积分奖励：${response.data.data.pointReward}`);
        } catch (error) {
            const status = error.response?.status || '未知';
            const message = error.response?.data?.message || error.message;
            logWithTimestamp(
                '错误',
                `任务领取失败 - 状态码: ${status} - 错误信息: ${JSON.stringify(error.response?.data || {})}`
            );
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
            for (const task of unclaimedTasks) {
                try {
                    logWithTimestamp('信息', `尝试领取任务：任务ID ${task.id}`);
                    await this.claimReward(token, task.id);
                } catch (error) {
                    logWithTimestamp('错误', `任务领取失败 - 任务ID: ${task.id}`);
                }
                await utils.delay(this.config.taskDelay);
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

(async () => {
    const minerBot = new MinerBot(CONFIG);
    await minerBot.init();
    minerBot.run();
})();
