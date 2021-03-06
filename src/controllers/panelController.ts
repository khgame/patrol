import {Get, JsonController} from "routing-controllers";
import {genLogger, Logger} from "@khgame/turtle/lib";

import {IScheduler, PatrolWorker} from "../workers";

@JsonController("/panel")
export class AccountController {

    public log: Logger = genLogger("api:panel");

    constructor() {
    }

    @Get("/info")
    async info() {
        return Math.floor((new Date()).getTime() / 3600000);
    }

    @Get("/running_process")
    async getProcessRunning() {
        return PatrolWorker.inst.processRunning;
    }

    @Get("/schedulers")
    async getSchedulers(): Promise<IScheduler[]> {
        return PatrolWorker.inst.schedulers;
    }


}
