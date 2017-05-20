import * as fs from "fs-extra";
import * as path from "path";
import * as md5 from "md5";
import * as webpack from "webpack";
import * as _ from "lodash";


function md5Slice(msg) {
    return md5(msg).slice(0, 10);
}

export type DllEntry = string | string[] | webpack.Entry;

export interface DllConfigFile {
    entry: DllEntry;
    outputJSNames: string[];
}

export interface ManifestCache {
    configFiles: { [index: string]: DllConfigFile; };
    currentConfigIndex: string;
    yarnLock: string;
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
    shouldUpdate: boolean;
    shouldCopy: boolean;
    cacheJSDir: string;
    cacheJSONDir: string;
    manifestFile: string;

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
                yarnLock: "",
                currentConfigIndex: ""
            };
        }

        this.currentConfigContent = this.manifestCache.configFiles[this.configIndex] || { entry: "", outputJSNames: [] };
    }

    private checkCache(entry: DllEntry) {
        let updateEntry = !_.isEqual(this.currentConfigContent.entry, entry);
        if (updateEntry) {
            this.updateEntryCache(entry);
        }

        const yarnContent = fs.readFileSync("yarn.lock");
        const yarnMD5 = md5Slice(yarnContent.toString());
        const updateYarn = !(this.manifestCache.yarnLock === yarnMD5);
        if (updateYarn) {
            this.updateCache("yarnLock", yarnMD5);
        }

        this.shouldUpdate = updateYarn || updateEntry;
        this.shouldCopy = !this.manifestCache.currentConfigIndex || this.manifestCache.currentConfigIndex !== this.configIndex;
        this.updateCache("currentConfigIndex", this.configIndex);
    }

    public writeCache() {
        fs.writeFileSync(this.manifestFile, JSON.stringify(this.manifestCache));
    }

    public updateCache(key: "yarnLock" | "currentConfigIndex", val: string) {
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
}