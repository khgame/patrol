import {genLogger, genMemCache, IWorker, Worker, WorkerRunningState, Logger, IMemCache} from "@khgame/turtle";
import {scheduleJob} from "node-schedule"
import {forMs} from "kht/lib";

export class SampleWorker extends Worker implements IWorker {

    public log : Logger= genLogger("worker:dau");

    static inst: SampleWorker;

    public readonly cache: IMemCache = genMemCache();

    constructor( ) {
        super("sample");
        SampleWorker.inst = this;
        this.runningState = WorkerRunningState.PREPARED;
    }

    async onStart(): Promise<boolean> {

        scheduleJob('0 3 * * * *', async () => { // every hour
            await this.task();
        });

        this.proc().then((ret => {
            this.log.warn(`⊙ proc of worker ${this.name} exited !`);
        })).catch(e => {
            this.log.error(`⊙ proc of worker ${this.name} failed ! message:${e.message} stack:${e.stack}`);
        });

        return true;
    }

    async proc() {
        this.log.info("⊙ auto cache proc started");
        let round = 0;
        while (true) {
            this.log.info(`⊙ worker ${this.name} round ${round} started `);

            this.processRunning += 1;
            try {
                // todo: do something here
            }
            catch (e) {
                this.log.error(`⊙ proc of worker ${this.name} error: ${e}, ${e.stack} `);
                throw e;
            }finally {
                this.processRunning -= 1;
            }

            this.log.info(`⊙ worker ${this.name} round ${round++} finished`);
            await forMs(10000);
        }
    }

    async task() {
        this.processRunning += 1;
        try {
            // todo: do something here
        }
        catch (e) {
            this.log.error(`⊙ task of worker ${this.name} error: ${e}, ${e.stack} `);
            throw e;
        }finally {
            this.processRunning -= 1;
        }
    }

}
