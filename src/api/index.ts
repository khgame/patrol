import "reflect-metadata";
import * as Koa from "koa";
import { Context } from "koa";
import { createServer, Server } from "http";
import {genLogger, IApi, APIRunningState, CError, Logger} from "@khgame/turtle/lib";
import { Action } from "routing-controllers";
import { Container } from "typedi";
import { forCondition } from "kht/lib";
import { CoreController } from "./core";

if (!require) {
    throw new Error("Cannot load routing-controllers. Try to install all required dependencies.");
}
let routingControllers;
try {
    routingControllers = require("routing-controllers");
} catch (e) {
    throw new Error("routing-controllers package was not found installed. Try to install it: npm install routing-controllers --save");
}

const { useContainer, useKoaServer } = routingControllers;

export class Api implements IApi {

    runningState: APIRunningState;

    private koa: Koa;
    public server: Server;

    public enabled: boolean = true;
    public runningRequest: number = 0;

    public log: Logger = genLogger("api");

    constructor(
        protected controllerClasses: Function[],
        protected slowLogThreshold: number = 1000,
        protected currentUserChecker?: (action: Action) => any,
        protected middlewares?: Koa.Middleware[]
    ) {
        this.koa = new Koa();
        useContainer(Container);
        this.server = createServer(this.koa.callback());
        this.init();
    }

    public async listen(port: number) {
        await new Promise((resolve, reject) => this.server.listen(port, resolve));
        this.log.info(`- Koa server has started ✓ : running with: http://127.0.0.1:${port}.`);
    }

    private init() {
        this.koa.use(async (ctx: Koa.Context, next: Function) => {
            const startTime = Date.now();
            await next();
            const timeCost = Date.now() - startTime;

            if (timeCost > this.slowLogThreshold) {
                this.log.info(`${ctx.request.originalUrl} [${timeCost}ms], ${
                    JSON.stringify(ctx.request.body)} ${JSON.stringify(ctx.response.body)}`);
            } else {
                this.log.debug(`${ctx.request.originalUrl} [${timeCost}ms]`);
            }

        });

        this.koa.use(async (ctx: Context, next: (...args: any[]) => any) => {
            this.runningRequest += 1;
            try {
                if (this.enabled) {
                    await next();
                } else {
                    ctx.status = 403;
                }
            } catch (error) {
                let code : number | string = 500;
                if(error instanceof CError) {
                    code = error.code;
                } else if (error.hasOwnProperty("statusCode")) {
                    code = error.statusCode;
                }

                ctx.status = 200;
                const msgCode = Number(error.message || error);
                ctx.body = {
                    statusCode: code,
                    message: isNaN(msgCode) ? (error.message || error) : msgCode,
                    stack: error.stack
                };
                // console.log(error);
                this.log.error(error.message + " stack:" + error.stack);
            }
            this.runningRequest -= 1;
        });

        if (this.middlewares) {
            this.middlewares.forEach(m => this.koa.use(m));
        }

        this.koa = useKoaServer(this.koa, {
            routePrefix: "/api/v1",
            validation: true,
            cors: true,
            classTransformer: false,
            controllers: [CoreController, ... this.controllerClasses],
            defaultErrorHandler: false,
            currentUserChecker: this.currentUserChecker
        });


        this.runningState = APIRunningState.PREPARED;
    }

    public async start(port: number) {
        this.log.info(`※※ Starting Process ※※`);
        this.runningState = APIRunningState.STARTING;
        try {
            await this.listen(port);
            this.log.info(`※※ All Process Started ※※`);
            this.runningState = APIRunningState.RUNNING;
            return true;
        } catch (e) {
            this.log.error(`※※ Start Process Failed ※※ ${e} `);
            this.runningState = APIRunningState.PREPARED;
            return false;
        }
    }

    public async close() {
        this.log.info("※※ start shutdown application ※※");
        this.runningState = APIRunningState.CLOSING;
        try {
            this.enabled = false;
            this.log.info("- abort all new requests ✓");

            await forCondition(() => this.runningRequest <= 0, 100);
            this.log.info("- check until no api request ✓");

            this.server.close();
            this.log.info("- close server ✓");
            this.log.info("※※ application exited ※※");
            this.log.close();
            this.runningState = APIRunningState.CLOSED;
            return true;
        } catch (e) {
            this.log.error(`※※ shutdown application failed ※※ ${e}`);
            this.runningState = APIRunningState.RUNNING;
            return false;
        }
    }
}
