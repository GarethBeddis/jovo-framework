import {Context, HttpRequest} from "@azure/functions";
import {Host, Log, LogLevel} from "jovo-core";

const AZURE_FUNCTION_APPENDER_NAME = 'azureFunction';

export class AzureFunction implements Host {
    headers: {[key: string]: string};
    hasWriteFileAccess = false;
    req: HttpRequest;
    context: Context;
    $request: any; // tslint:disable-line

    /**
     * Constructs an AzureFunction host object to handle an incoming request.
     * 
     * @param context Azure Fuctions context object
     * @param req Azure Functions HTTP request object
     * @param contextLogLevel Minimum log level to send to the context logger
     */
    constructor(context: Context, req: HttpRequest, contextLogLevel: LogLevel = LogLevel.DEBUG) {
        this.req = req;
        this.context = context;
        this.headers = req.headers;
        this.$request = req.body;

        // ensure the context log appender has been added to Log
        AzureFunction.addContextLogger(contextLogLevel);
    }

    getRequestObject() {
        return this.$request;
    }

    setResponse(obj: any) { // tslint:disable-line
        return new Promise<void>((resolve) => {
            this.context.res = {
                headers: {
                    'Content-Type': 'application/json',
                },
                statusCode: 200,
                body: obj,
            };
            this.context.done();
            resolve();
        });
    }

    fail(error: Error) { // tslint:disable-line
        if (!this.context.res.statusCode) {
            const responseObj: any = { // tslint:disable-line
                code: 500,
                msg: error.message,
            };

            if (process.env.NODE_ENV === 'production') {
                responseObj.stack = error.stack;
            }

            this.context.res = {
                headers: {
                    'Content-Type': 'application/json',
                },
                statusCode: 500,
                body: responseObj
            };
            this.context.done();
        }
    }

    /**
     * Add an appender, if not already added, that writes logs to Azure Function's context.log.
     * The benefit of doing so, vs. just using console.log, is that the logs get associated with the request
     * in the Azure Portal. Otherwise the only way to see the logs is as a jumbled mess in Application Insights.
     * 
     * @param contextLogLevel the minimum level of logs that will be logged
     */
    private static addContextLogger(contextLogLevel: LogLevel) {
        // If the appender was already added (which will be the case every time except the first request), don't add it again
        if (Log.config.appenders[AZURE_FUNCTION_APPENDER_NAME]) {
            return;
        }

        // Our context logger requires async hooks enabled, so don't add it if they aren't
        if (Log.config.disableAsyncHooks) {
            return;
        }

        // Add our context.log appender
        Log.addAppender(AZURE_FUNCTION_APPENDER_NAME, {
            write: (logEvent) => {
                if (logEvent.msg) {
                    const host = logEvent.requestContext;
                    if (host && host instanceof AzureFunction) {
                        if (logEvent.logLevel === LogLevel.ERROR) {
                            host.context.log.error(logEvent.msg);
                        } else if (logEvent.logLevel === LogLevel.WARN) {
                            host.context.log.warn(logEvent.msg);
                        } else if (logEvent.logLevel === LogLevel.INFO) {
                            host.context.log.info(logEvent.msg);
                        } else if (logEvent.logLevel === LogLevel.VERBOSE || logEvent.logLevel === LogLevel.DEBUG) {
                            host.context.log.verbose(logEvent.msg);
                        } else {
                            host.context.log(logEvent.msg);
                        }
                    } else {
                        // this should hardly ever happen, but just in case
                        console.log(logEvent.msg);
                    }
                }
            },
            logLevel: contextLogLevel,
            ignoreFormatting: true,
            trackRequest: true,
        });

        // Finally remove the existing console appender, since it would just be duplicating log entries now
        Log.removeAppender('console');
    }
}
