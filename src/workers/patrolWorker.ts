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

interface IScheduler {
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
        datas: Array<{ rule: string, script: string }>
    ) {
        if (datas.length <= 0) {
            throw new Error(`⊙ insert scheduler failed: the input config is empty.`);
        }

        const scheduler = this.getScheduler(tag);

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

        const tasks: ITask[] = [];
        for (let ind in datas) {
            const {rule, script} = datas[ind];
            const requirePath = Path.isAbsolute(script) ? script : Path.resolve(Path.dirname(path), script);
            try {
                if (require.cache[requirePath]) {
                    this.log.info(`⊙ clear require cache of ${requirePath}`);
                    delete require.cache[requirePath];
                }
                const {patrol} = require(requirePath);

                const task = this.insertTask(tag, datas.length > 1 ? ind : "-", rule, patrol);
                tasks.push(task);
            } catch (e) {
                // todo
            }
        }

        const newScheduler: IScheduler = {
            tag, hash, tasks
        };

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

    async loadTasks() {
        this.log.info("⊙ loadTasks started");
        let round = 0;
        while (true) {
            await forMs(100);
            this.log.info(`⊙ loadTasks ${this.name} round ${round} started `);

            this.processRunning += 1;
            try {
                let configPathes = [];
                const pthLocal = process.cwd();
                const pthConf = "/etc/patrol/conf.d";

                if (fs.existsSync(pthLocal)) {
                    configPathes.push(
                        ... fs.readdirSync(pthLocal)
                            .filter(
                                str => str.trim().toLowerCase().endsWith(".patrol.json")
                            ).map(n => Path.resolve(pthLocal, n))
                    );
                }

                if (fs.existsSync(pthConf)) {
                    configPathes.push(
                        ... fs.readdirSync(pthConf)
                            .filter(str =>
                                str.trim().toLowerCase().endsWith(".patrol.json")
                            ).map(n => Path.resolve(pthConf, n))
                    );
                }

                for (const i in configPathes) {
                    const confPath = configPathes[i];

                    const baseName = Path.basename(confPath);
                    const tagName = baseName.substr(0, baseName.length - 12);

                    try {
                        const dataStr = fs.readFileSync(confPath).toString();
                        let data = JSON.parse(dataStr);
                        const hash = Crypto.getMd5(dataStr);

                        const existedScheduler = this.getScheduler(tagName);
                        if (existedScheduler && existedScheduler.hash === hash) {
                            continue;
                        }

                        this.log.info(`⊙ start load scheduler ${tagName}: read file ${confPath}`);

                        if (!_.isArray(data)) {
                            data = [data];
                        }

                        // const requirePath = Path.isAbsolute(data.script) ? data.script : Path.resolve(Path.dirname(d), data.script);
                        // if (require.cache[requirePath]) {
                        //     this.log.info(`⊙ clear require cache of ${requirePath}`);
                        //     delete require.cache[requirePath];
                        // }
                        // const {patrol} = require(requirePath);

                        this.insertScheduler(confPath, tagName, hash, data);

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
