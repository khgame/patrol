import {
    genLogger,
    genAssert,
    genMemCache,
    IWorker,
    Worker,
    WorkerRunningState,
    Logger,
    IMemCache,
    turtle,
    CAssert,
    mail, Crypto,
} from "@khgame/turtle";
import {Job, scheduleJob} from "node-schedule";
import {forMs} from "kht/lib";
import * as fs from "fs-extra";
import * as Path from "path";
import {IPatrolRule} from "../const";
import {Continuous} from "../core/continuous";
import * as _ from "lodash";

interface ISchedulerResult {
    status: "ok" | "error";
    msg: string;
    data: any;
}

interface ITask {
    rule: string;
    job?: Job | Continuous;
    running: boolean;
}

export interface IScheduler {
    tag: string;
    hash: string;
    tasks: ITask[];
}

export class PatrolWorker extends Worker implements IWorker {

    public log: Logger = genLogger("worker:patrol");
    public assert: CAssert = genAssert("worker:patrol");

    static inst: PatrolWorker;

    public readonly cache: IMemCache = genMemCache();

    constructor() {
        super("patrol");
        PatrolWorker.inst = this;
        this.runningState = WorkerRunningState.PREPARED;
    }

    schedulers: IScheduler[] = [];

    public getScheduler(tag: string): IScheduler | null {
        return this.schedulers.find(s => s.tag === tag) || null;
    }

    public removeScheduler(tag: string) {
        const scheduler = this.getScheduler(tag);

        if (!scheduler) {
            throw new Error(`⊙ remove scheduler failed: the scheduler ${tag} are not exist.`);
        }

        scheduler.tasks.forEach(t => t.job && t.job.cancel());

        this.schedulers.splice(this.schedulers.indexOf(scheduler), 1);
    }

    /**
     * create a task by config
     * @param {string} tag - generally, tag will be the name of config `*.patrol.json`
     * @param {string} ind - index of the task in the config
     * @param {string} rule - rule of the scheduler, continuous or cron
     * @param {Function} method - the patrol method
     * @return {ITask}
     */
    public insertTask(
        tag: string,
        ind: string,
        rule: string,
        method: (log: Logger) => Promise<void>
    ): ITask {
        const task: ITask = {
            rule, running: false
        };

        const procedure = async () => {
            this.processRunning += 1;
            task.running = true;
            try {
                this.log.warn(`⊙ schedule ${tag}:${ind} triggered, rule:"${rule}"`);
                await Promise.resolve(method(genLogger(tag)));
            } catch (e) {
                this.log.error(`⊙ schedule ${tag}:${ind} exited, rule:"${rule}" error: ${e}, ${e.stack} `);
                throw e;
            } finally {
                this.processRunning -= 1;
                task.running = false;
            }
        };

        const job: Job | Continuous = rule.startsWith("continuous:")
            ? Continuous.create(procedure, parseInt(rule.substr(11)))
            : scheduleJob(rule, procedure);

        this.log.info(`⊙ created job ${tag} rule:"${rule}" job:${job}`);

        task.job = job;

        return task;
    }


    public insertScheduler(
        path: string,
        tag: string,
        hash: string,
        taskConfList: Array<{ rule: string, script: string }>
    ) {
        if (taskConfList.length <= 0) {
            throw new Error(`⊙ insert scheduler failed: the input config is empty.`);
        }

        const scheduler = this.getScheduler(tag);

        /** try stop and remove old scheduler */
        if (scheduler) {
            if (scheduler.hash === hash) {
                throw new Error(`⊙ insert scheduler failed: the scheduler ${tag} of hash ${hash} is already exist.`);
            }

            const indRunningTask = scheduler.tasks.findIndex(t => t.running);
            if (indRunningTask >= 0) {
                this.log.info(`⊙ replace scheduler ${tag} of hash ${scheduler.hash} failed: the task ${indRunningTask} of scheduler ${tag}(hash ${hash}) is running.`);
                return;
            }

            this.log.info(`⊙ detect scheduler ${tag} hash changed, ${scheduler.hash} => ${hash}, start update.`);
            this.removeScheduler(tag);
        }

        /** create all task by the dataList, which should be set in the config file */
        const tasks: ITask[] = [];
        for (let ind in taskConfList) {
            const {rule, script} = taskConfList[ind];
            /** get absolute path of the 'path' set in config */
            const requirePath = Path.isAbsolute(script) ? script : Path.resolve(Path.dirname(path), script);
            try {
                /** only support require mode now */
                if (require.cache[requirePath]) {
                    this.log.info(`⊙ clear require cache of ${requirePath}`);
                    delete require.cache[requirePath];
                }
                /** require the method patrol from the given path */
                const {patrol} = require(requirePath);

                const task = this.insertTask(tag, taskConfList.length > 1 ? ind : "-", rule, patrol);
                tasks.push(task);
            } catch (e) {
                // todo
            }
        }

        /** create scheduler */
        const newScheduler: IScheduler = {
            tag, hash, tasks
        };

        /** insert the created scheduler to pool */
        this.schedulers.push(newScheduler);

        return true;
    }

    async onStart(): Promise<boolean> {

        this.loadTasks().then((ret => {
            this.log.warn(`⊙ loadTasks of worker ${this.name} exited !`);
        })).catch(e => {
            this.log.error(`⊙ loadTasks of worker ${this.name} failed ! message:${e.message} stack:${e.stack}`);
        });

        return true;
    }

    getAllConfigFilePaths(): string[] {
        const pthLocal = process.cwd();
        const pthConf = "/etc/patrol/conf.d";
        let configPaths: string[] = [];
        if (fs.existsSync(pthLocal)) {
            configPaths.push(
                ... fs.readdirSync(pthLocal)
                    .filter(
                        str => str.trim().toLowerCase().endsWith(".patrol.json")
                    ).map(n => Path.resolve(pthLocal, n))
            );
        }

        if (fs.existsSync(pthConf)) {
            configPaths.push(
                ... fs.readdirSync(pthConf)
                    .filter(str =>
                        str.trim().toLowerCase().endsWith(".patrol.json")
                    ).map(n => Path.resolve(pthConf, n))
            );
        }
        return configPaths;
    }

    async loadTasks() {
        this.log.info("⊙ loadTasks started");
        let round = 0;
        while (true) {
            await forMs(100);

            if (round % 100 === 0) {
                this.log.info(`⊙ loadTasks ${this.name} round ${round} started `);
            }

            this.processRunning += 1;
            try {
                const configPaths = this.getAllConfigFilePaths();
                for (const i in configPaths) {
                    const confPath = configPaths[i];

                    const baseName = Path.basename(confPath);
                    const tagName = baseName.substr(0, baseName.length - 12);

                    try {
                        const strConfig = fs.readFileSync(confPath).toString();
                        /** find out hash for the config file */
                        const hash = Crypto.getMd5(strConfig);

                        // do nothing when the file are not changed
                        const existedScheduler = this.getScheduler(tagName);
                        if (existedScheduler && existedScheduler.hash === hash) {
                            continue;
                        }
                        this.log.info(`⊙ start load scheduler ${tagName}: read file ${confPath}`);

                        let configs = JSON.parse(strConfig);
                        if (!_.isArray(configs)) {
                            configs = [configs];
                        }

                        this.insertScheduler(confPath, tagName, hash, configs);
                    } catch (e) {
                        console.error(`⊙ load data ${confPath} error: ${e}, ${e.stack}`);
                    }
                }

            }
            catch (e) {
                this.log.error(`⊙ loadTasks ${this.name} error: ${e}, ${e.stack} `);
                throw e;
            } finally {
                this.processRunning -= 1;
            }

            this.log.info(`⊙ loadTasks ${this.name} round ${round++} finished`);
            await forMs(10000);
        }
    }

    async sendMail(toEmail: string, subject: string, content: string) {
        const email = turtle.rules<IPatrolRule>().mail_option.auth.user;
        const indAt = email.indexOf("@") + 1;
        this.assert.ok(indAt >= 0, `send mail failed, email ${email} format error`);
        await mail.sendMail(
            email.substr(indAt),
            email,
            toEmail,
            subject,
            content,
            turtle.rules<IPatrolRule>().mail_option
        );
    }

}
