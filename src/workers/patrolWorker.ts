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

interface ISchedulerResult {
    status: "ok" | "error";
    msg: string;
    data: any;
}

interface IScheduler {
    tag: string;
    hash: string;
    rule: string;
    job?: Job;
    running: boolean;
}


export class PatrolWorker extends Worker implements IWorker {

    public log: Logger = genLogger("worker:patrol");
    public assert: CAssert = genAssert("worker:patrol");

    static inst: PatrolWorker;

    public readonly cache: IMemCache = genMemCache();

    constructor() {
        super("sample");
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

        if (scheduler.job) {
            scheduler.job.cancel();
        }

        this.schedulers.splice(this.schedulers.indexOf(scheduler), 1);
    }

    public insertScheduler(
        tag: string,
        hash: string,
        rule: string,
        method: (log: Logger) => Promise<void>
    ) {
        const scheduler = this.getScheduler(tag);

        if (scheduler) {
            if (scheduler.hash === hash) {
                throw new Error(`⊙ insert scheduler failed: the scheduler ${tag} of hash ${hash} is already exist.`);
            }

            if (scheduler.running) {
                this.log.info(`⊙ replace scheduler ${tag} of hash ${scheduler.hash} failed: the scheduler ${tag} of hash ${hash} is running.`);
                return;
            }

            this.log.info(`⊙ detect scheduler ${tag} hash changed, ${scheduler.hash} => ${hash}, start update.`);
            this.removeScheduler(tag);
        }

        const task: IScheduler = {
            tag, rule, hash, running: false
        };
        const job: Job = scheduleJob(rule, async () => {
            this.processRunning += 1;
            task.running = true;
            try {
                this.log.warn(`⊙ schedule ${tag} triggered, rule:"${rule}"`);
                await Promise.resolve(method(genLogger(tag)));
            } catch (e) {
                this.log.error(`⊙ schedule ${tag} exited, rule:"${rule}" error: ${e}, ${e.stack} `);
                throw e;
            } finally {
                this.processRunning -= 1;
                task.running = false;
            }
        });

        this.log.info(`⊙ created job ${tag} rule:"${rule}" job:${job}`);

        task.job = job;
        this.schedulers.push(task);

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
            await forMs(10000);
            this.log.info(`⊙ loadTasks ${this.name} round ${round} started `);

            this.processRunning += 1;
            try {
                let ds = [];
                const pthLocal = process.cwd();
                const pthConf = "/etc/patrol/conf.d";

                if (fs.existsSync(pthLocal)) {
                    ds.push(
                        ... fs.readdirSync(pthLocal)
                            .filter(
                                str => str.trim().toLowerCase().endsWith(".patrol.json")
                            ).map(n => Path.resolve(pthLocal, n))
                    );
                }

                if (fs.existsSync(pthConf)) {
                    ds.push(
                        ... fs.readdirSync(pthConf)
                            .filter(str =>
                                str.trim().toLowerCase().endsWith(".patrol.json")
                            ).map(n => Path.resolve(pthConf, n))
                    );
                }

                for (const i in ds) {
                    const d = ds[i];

                    const baseName = Path.basename(d);
                    const tagName = baseName.substr(0, baseName.length - 12);

                    try {
                        const dataStr = fs.readFileSync(d).toString();
                        const data = JSON.parse(dataStr);
                        const hash = Crypto.getMd5(dataStr);

                        const existedScheduler = this.getScheduler(tagName);
                        if (existedScheduler && existedScheduler.hash === hash) {
                            continue;
                        }

                        this.log.info(`⊙ start load scheduler ${tagName}: read file ${d}`);

                        const {schedule} = require(Path.isAbsolute(data.script) ? data.script : Path.resolve(Path.dirname(d), data.script));

                        this.insertScheduler(tagName, hash, data.rule, schedule);

                    } catch (e) {
                        console.error(`⊙ load data ${d} error: ${e}, ${e.stack}`);
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
