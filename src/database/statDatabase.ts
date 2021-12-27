import sqlite3 from "better-sqlite3";

/**
 * Palantir/Typo stat db access
 */
class StatDatabase {
    db: sqlite3.Database;
    path: string;

    /**
     * Create a new stat db connection
     * @param path Path to the sqlite3 db file
     */
    constructor(path: string){
        this.path = path;
        this.db = new sqlite3(this.path);
        this.db.pragma('journal_mode = WAL');
    }

    /**
     * Close the stat db connection
     */
    close(){
        this.db.close();
    }

    /**
     * Update the last connection timestamp of a client via pseudo-ID
     * @param initTimestamp The client's pseudo-ID (extension init timestamp)
     */
    updateClientContact(initTimestamp: string){
        try {
            this.db.prepare("REPLACE INTO clientContacts (clientInitTimestamp) VALUES (?)").run(initTimestamp);
        }
        catch(e) {
            console.warn("Error updating client contact: ", e);
        }
        this.close()
    }
}

export default StatDatabase;