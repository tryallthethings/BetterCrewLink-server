declare module "node-turn" {

    interface TurnCredentials {
        [username: string]: string;
    }

    type DebugLevel = 'OFF' | 'FATAL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE' | 'ALL';

    interface TurnOptions {
        listeningPort?: number;
        listeningIps?: string[];
        relayIps?: string[]
        externalIps?: string[]
        minPort?: number;
        maxPort?: number;
        authMech?: 'short-term' | 'long-term' | 'none';
        credentials?: TurnCredentials
        realm?: string;
        debugLevel?: DebugLevel;
        debug?: (debugLevel: DebugLevel, message: string) => void
    }

    class Turn {
        constructor (options: TurnOptions);

        /**
         * Start the server.
         */
        start (): void;

        /**
         * Stop the server.
         */
        stop (): void;

        /**
         * Add a user to credential mechanism.
         * 
         * @param username
         * @param password
         */
        addUser (username: string, password: string): void;

        /**
         * Remove a user from credential mechanism.
         * 
         * @param username
         */
        removeUser (username: string): void;
    }

    export = Turn;
}
