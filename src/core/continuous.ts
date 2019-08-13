import {JobCallback} from "node-schedule";
import {forMs} from "eosplayer/build/lib/utils/wait";

export class Continuous {

    enabled = true;

    cancel() {
        this.enabled = false;
    }

    constructor(
        public cb: JobCallback,
        public sleepMS: number
    ) {
        this.exec().then();
    }

    async exec() {
        while (this.enabled) {
            await forMs(100 * Math.random());
            await Promise.resolve(this.cb(new Date()));
            await forMs(this.sleepMS);
        }
    }

    static create(cb: JobCallback, sleepMS: number) {
        return new Continuous(cb, sleepMS);
    }
}
