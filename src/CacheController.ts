import * as fs from "fs-extra";
import * as webpack from "webpack";
import * as _ from "lodash";


export type DllEntry = string | string[] | webpack.Entry;

export interface DllConfigFile {
    entry: DllEntry;
    outputJSNames: string[];
}

export interface ManifestCache {
    configFiles: { [index: string]: DllConfigFile; };
    currentConfigIndex: string;
    yarnMTime: number;
    version: string;
}

export interface CacheOptions {
    configIndex: string;
    entry: DllEntry;
    cacheDir: { js: string, json: string };
    manifestFile: string;
}

export class CacheController {
    private manifestCache: ManifestCache;
    private currentConfigContent: DllConfigFile;
    private configIndex: string;
    private shouldUpdate: boolean;
    private cacheJSDir: string;
    private cacheJSONDir: string;
    private manifestFile: string;

    constructor(options: CacheOptions) {
        const { cacheDir, configIndex, manifestFile } = options;

        this.configIndex = configIndex;

        this.manifestFile = manifestFile;
        this.cacheJSDir = cacheDir.js;
        this.cacheJSONDir = cacheDir.json;

        this.readCacheFile();
        this.checkCache(options.entry);
    }

    private readCacheFile() {
        try {
            const content = fs.readFileSync(this.manifestFile);
            this.manifestCache = JSON.parse(content.toString());
        } catch (e) {
            this.manifestCache = {
                configFiles: {},
                currentConfigIndex: "",
                yarnMTime: 0,
                version: "0"
            };
        }

        this.currentConfigContent = this.manifestCache.configFiles[this.configIndex] || { entry: "", outputJSNames: [] };
    }

    private checkCache(entry: DllEntry) {
        let updateEntry = !_.isEqual(this.currentConfigContent.entry, entry);
        if (updateEntry) {
            this.updateEntryCache(entry);
        }

        const yarnStats = fs.statSync("yarn.lock");
        const yarnMTime = yarnStats.mtime.getTime();
        const updateYarn = !(this.manifestCache.yarnMTime === yarnMTime);
        if (updateYarn) {
            this.updateCache("yarnMTime", yarnMTime);
        }

        this.shouldUpdate = updateYarn || updateEntry;

        if (this.shouldUpdate || this.manifestCache.currentConfigIndex !== this.configIndex) {
            this.updateCache("currentConfigIndex", this.configIndex);
            this.updateCacheVersion();
        }
    }

    private updateCacheVersion() {
        const version = parseInt(this.manifestCache.version);
        this.manifestCache.version = version + 1 + "";
    }

    public writeCache() {
        fs.writeFileSync(this.manifestFile, JSON.stringify(this.manifestCache));
    }

    public updateCache(key: "yarnMTime" | "currentConfigIndex", val: string | number) {
        this.manifestCache[key] = val;
    }

    public updateEntryCache(val: DllEntry) {
        this.manifestCache.configFiles[this.configIndex] =
            this.currentConfigContent =
            Object.assign({}, this.currentConfigContent, { entry: val });
    }

    public updateJSNamesCache(val: string[]) {
        this.manifestCache.configFiles[this.configIndex] =
            this.currentConfigContent =
            Object.assign({}, this.currentConfigContent, { outputJSNames: val });
    }

    public getCacheJSNames() {
        return this.currentConfigContent.outputJSNames;
    }

    public shouldUpdateCache() {
        return this.shouldUpdate;
    }

    public getCacheVersion() {
        return this.manifestCache.version;
    }
}