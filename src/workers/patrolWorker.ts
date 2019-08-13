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
    job: Job;
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

    scheduler: IScheduler[] = [];

    public getScheduler(tag: string): IScheduler | null {
        return this.scheduler.find(s => s.tag === tag) || null;
    }

    public insertScheduler(
        tag: string,
        hash: string,
        rule: string,
        method: (log: Logger) => Promise<void>
    ): boolean {
        const scheduler = this.getScheduler(tag);

        if (scheduler && scheduler.hash === hash) {
            return false;
        }

        const task: any = {
            tag, rule, runningOffset: 0,
        };
        const job: Job = scheduleJob(rule, async () => {
            this.processRunning += 1;
            try {
                this.log.warn(`⊙ schedule ${tag} triggered, rule:"${rule}"`);
                await Promise.resolve(method(genLogger(tag)));
            } catch (e) {
                this.log.error(`⊙ schedule ${tag} exited, rule:"${rule}" error: ${e}, ${e.stack} `);
                throw e;
            } finally {
                this.processRunning -= 1;
            }
        });

        console.log(`created job ${tag} rule:"${rule}" job:${job}`);
        task.job = job;

        this.scheduler.push(task);

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

                // console.log(ds);

                for (const i in ds) {
                    const d = ds[i];

                    const baseName = Path.basename(d);
                    const tagName = baseName.substr(0, baseName.length - 12);

                    try {
                        console.log(`try create scheduler ${tagName}: read file ${d}`);
                        const dataStr = fs.readFileSync(d).toString();
                        const data = JSON.parse(dataStr);

                        console.log(data, Path.dirname(d));

                        const {schedule} = require(Path.isAbsolute(data.script) ? data.script : Path.resolve(Path.dirname(d), data.script));

                        const result = this.insertScheduler(tagName, Crypto.getMd5(dataStr), data.rule, schedule);

                    } catch (e) {
                        console.error(`load data ${d} error: ${e}, ${e.stack}`);
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
