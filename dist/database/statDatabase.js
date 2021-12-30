"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
/**
 * Palantir/Typo stat db access
 */
class StatDatabase {
    /**
     * Create a new stat db connection
     * @param path Path to the sqlite3 db file
     */
    constructor(path) {
        this.path = path;
        this.db = new better_sqlite3_1.default(this.path);
        this.db.pragma('journal_mode = WAL');
    }
    /**
     * Close the stat db connection
     */
    close() {
        this.db.close();
    }
    /**
     * Update the last connection timestamp of a client via pseudo-ID
     * @param initTimestamp The client's pseudo-ID (extension init timestamp)
     */
    updateClientContact(initTimestamp) {
        try {
            this.db.prepare("REPLACE INTO clientContacts (clientInitTimestamp) VALUES (?)").run(initTimestamp);
        }
        catch (e) {
            console.warn("Error updating client contact: ", e);
        }
        this.close();
    }
}
exports.default = StatDatabase;
//# sourceMappingURL=statDatabase.js.map