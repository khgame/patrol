import {genLogger, genMemCache, IWorker, Worker, WorkerRunningState, Logger, IMemCache} from "@khgame/turtle";
import {Job, scheduleJob} from "node-schedule";
import {forMs} from "kht/lib";
import * as fs from "fs-extra";

interface ISchedulerResult {
    status: "ok" | "error";
    msg: string;
    data: any;
}

export class PatrolWorker extends Worker implements IWorker {

    public log: Logger = genLogger("worker:dau");

    static inst: PatrolWorker;

    public readonly cache: IMemCache = genMemCache();

    constructor() {
        super("sample");
        PatrolWorker.inst = this;
        this.runningState = WorkerRunningState.PREPARED;
    }

    scheduler: Array<{
        tag: string,
        rule: string,
        job: Job
    }>;

    public insertScheduler(
        tag: string,
        rule: string,
        method: () => Promise<void | ISchedulerResult>
    ) {
        const task: any = {
            tag, rule, runningOffset: 0,
        };
        const job: Job = scheduleJob(rule, async () => {
            this.processRunning += 1;
            task.runningOffset += 1;
            try {
                this.log.warn(`⊙ schedule ${tag} triggered, rule:"${rule}"`);
                await method();
            } catch (e) {
                this.log.error(`⊙ schedule ${tag} exited, rule:"${rule}" error: ${e}, ${e.stack} `);
                throw e;
            } finally {
                this.processRunning -= 1;
                task.runningOffset -= 1;
            }
        });

        task.job = job;
        this.scheduler.push(task);
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
                    ds.push(... fs.readdirSync(pthLocal).filter(str => str.trim().toLowerCase().endsWith(".patrol.json")));
                }
                if (fs.existsSync(pthConf)) {
                    ds.push(... fs.readdirSync(pthConf).filter(str => str.trim().toLowerCase().endsWith(".patrol.json")));
                }
                console.log(ds);
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

    //
    // async proc() {
    //     this.log.info("⊙ auto cache proc started");
    //     let round = 0;
    //     while (true) {
    //         this.log.info(`⊙ worker ${this.name} round ${round} started `);
    //
    //         this.processRunning += 1;
    //         try {
    //             // todo: do something here
    //         }
    //         catch (e) {
    //             this.log.error(`⊙ proc of worker ${this.name} error: ${e}, ${e.stack} `);
    //             throw e;
    //         } finally {
    //             this.processRunning -= 1;
    //         }
    //
    //         this.log.info(`⊙ worker ${this.name} round ${round++} finished`);
    //         await forMs(10000);
    //     }
    // }

    // async task() {
    //     this.processRunning += 1;
    //     try {
    //         // todo: do something here
    //     }
    //     catch (e) {
    //         this.log.error(`⊙ task of worker ${this.name} error: ${e}, ${e.stack} `);
    //         throw e;
    //     } finally {
    //         this.processRunning -= 1;
    //     }
    // }

}
