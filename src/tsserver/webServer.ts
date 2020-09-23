/*@internak*/
namespace ts.server {
    declare const addEventListener: any;
    declare const postMessage: any;
    declare const close: any;
    const nullLogger: Logger = {
        close: noop,
        hasLevel: returnFalse,
        loggingEnabled: returnFalse,
        perftrc: noop,
        info: noop,
        msg: noop,
        startGroup: noop,
        endGroup: noop,
        getLogFileName: returnUndefined,
    };

    let unknownServerMode: string | undefined;
    function parseServerMode(): LanguageServiceMode | undefined {
        const mode = findArgument("--serverMode");
        if (mode !== undefined) {
            switch (mode.toLowerCase()) {
                case "partialsemantic":
                    return LanguageServiceMode.PartialSemantic;
                case "syntactic":
                    return LanguageServiceMode.Syntactic;
                default:
                    unknownServerMode = mode;
                    break;
            }
        }
        // Webserver defaults to partial semantic mode
        return hasArgument("--syntaxOnly") ? LanguageServiceMode.Syntactic : LanguageServiceMode.PartialSemantic;
    }

    export function initializeWebSystem(args: string[]): StartInput {
        createWebSystem(args);
        const serverMode = parseServerMode();
        return {
            args,
            logger: nullLogger,
            cancellationToken: nullCancellationToken,
            serverMode,
            unknownServerMode,
            startSession: startWebSession
        };
    }

    function createWebSystem(args: string[]) {
        Debug.assert(ts.sys === undefined);
        const returnEmptyString = () => "";
        const sys: ServerHost = {
            args,
            newLine: "\r\n", // TODO::
            useCaseSensitiveFileNames: false, // TODO::
            readFile: returnUndefined, // TODO:: read lib Files

            write: postMessage,
            watchFile: returnNoopFileWatcher,
            watchDirectory: returnNoopFileWatcher,

            getExecutingFilePath: returnEmptyString, // TODO:: Locale, lib locations, typesmap location, plugins
            getCurrentDirectory: returnEmptyString, // For inferred project root if projectRoot path is not set, normalizing the paths

            /* eslint-disable no-restricted-globals */
            setTimeout,
            clearTimeout,
            setImmediate: x => setTimeout(x, 0),
            clearImmediate: clearTimeout,
            /* eslint-enable no-restricted-globals */

            require: () => ({ module: undefined, error: new Error("Not implemented") }),
            exit: notImplemented,

            // Debugging related
            getEnvironmentVariable: returnEmptyString, // TODO:: Used to enable debugging info
            // tryEnableSourceMapsForHost?(): void;
            // debugMode?: boolean;

            // Future for semantic server mode
            fileExists: returnFalse, // Module Resolution
            directoryExists: returnFalse, // Module resolution
            readDirectory: notImplemented, // Configured project, typing installer
            getDirectories: () => [], // For automatic type reference directives
            createDirectory: notImplemented, // compile On save
            writeFile: notImplemented, // compile on save
            resolvePath: identity, // Plugins
            // realpath? // Module resolution, symlinks
            // getModifiedTime // File watching
            // createSHA256Hash // telemetry of the project

            // Logging related
            // /*@internal*/ bufferFrom?(input: string, encoding?: string): Buffer;
            // gc?(): void;
            // getMemoryUsage?(): number;
        };
        ts.sys = sys;
        // TODO:: Locale setting?
    }

    function startWebSession(options: StartSessionOptions, logger: Logger, cancellationToken: ServerCancellationToken) {
        class WorkerSession extends Session<{}> {
            constructor() {
                const host = sys as ServerHost;

                super({
                    host,
                    cancellationToken,
                    ...options,
                    typingsInstaller: nullTypingsInstaller,
                    byteLength: notImplemented, // Formats the message text in send of Session which is override in this class so not needed
                    hrtime: notImplemented, // Needed for perf logging which is disabled anyway
                    logger,
                    canUseEvents: false,
                });
            }

            public send(msg: protocol.Message) {
                postMessage(msg);
            }

            protected parseMessage(message: {}): protocol.Request {
                return <protocol.Request>message;
            }

            protected toStringMessage(message: {}) {
                return message.toString();
            }

            exit() {
                this.logger.info("Exiting...");
                this.projectService.closeLog();
                close(0);
            }

            listen() {
                addEventListener("message", (message: any) => {
                    this.onMessage(message.data);
                });
            }
        }

        const session = new WorkerSession();

        // Start listening
        session.listen();
    }
}
