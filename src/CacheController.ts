import * as fs from "fs-extra";
import * as webpack from "webpack";
import * as md5 from "md5";
import * as chalk from "chalk";
import {
    getDependencyFromYarn,
    PackageDependency,
    getPKGVersion
} from "./utils/packageDependency";

function isVersionEqual(
    versionA: PackageDependency,
    versionB: PackageDependency
) {
    if (!versionA && !versionB) {
        return true;
    } else if (versionA && versionB) {
        return Object.keys(versionA).every(
            k =>
                versionB[k] &&
                versionA[k].version === versionB[k].version &&
                isVersionEqual(
                    versionA[k].dependencies,
                    versionB[k].dependencies
                )
        );
    } else {
        return false;
    }
}

// just check entry version, not include entry dependency.
function shadowCheckEntryVersion(entryVersion: PackageDependency) {
    return Object.keys(entryVersion).every(
        k => entryVersion[k].version === getPKGVersion(k)
    );
}

export type DllEntry = string | string[] | webpack.Entry;

export interface DllConfigFile {
    outputJSNames: string[];
    entryVersion: PackageDependency;
}

export interface ManifestCache {
    configFiles: { [index: string]: DllConfigFile };
}

export interface CacheOptions {
    configIndex: string;
    entry: DllEntry;
    cacheDir: { js: string; json: string };
    manifestFile: string;
}

export class CacheController {
    private manifestCache: ManifestCache;
    private currentConfigContent: DllConfigFile;
    private configIndex: string;
    private shouldUpdate: boolean;
    private manifestFile: string;

    constructor(options: CacheOptions) {
        const { configIndex, manifestFile } = options;

        this.configIndex = configIndex;

        this.manifestFile = manifestFile;

        this.readCacheFile();
        this.checkCache(options.entry);
    }

    private readCacheFile() {
        try {
            const content = fs.readFileSync(this.manifestFile);
            this.manifestCache = JSON.parse(content.toString());
        } catch (e) {
            this.manifestCache = {
                configFiles: {}
            };
        }

        this.currentConfigContent = this.manifestCache.configFiles[
            this.configIndex
        ] || { outputJSNames: [], entryVersion: null };
    }

    private checkCache(entry: DllEntry) {
        const entryVersion = getDependencyFromYarn(entry);
        const isYarnVersionRight = shadowCheckEntryVersion(entryVersion);

        if (!isYarnVersionRight) {
            console.log(
                chalk.yellow(
                    "[dll-link-plugin]: Version in yarn is different from node_modules. Please reinstall package."
                )
            );
        }

        if (entryVersion && isYarnVersionRight) {
            this.shouldUpdate =
                this.currentConfigContent.outputJSNames.length === 0 ||
                !isVersionEqual(
                    this.currentConfigContent.entryVersion,
                    entryVersion
                );
            this.currentConfigContent.entryVersion = entryVersion;
        } else {
            this.shouldUpdate = true;
        }
    }

    public writeCache() {
        fs.writeFileSync(this.manifestFile, JSON.stringify(this.manifestCache));
    }

    public updateJSNamesCache(val: string[]) {
        this.manifestCache.configFiles[
            this.configIndex
        ] = this.currentConfigContent = Object.assign(
            {},
            this.currentConfigContent,
            { outputJSNames: val }
        );
    }

    public getCacheJSNames() {
        return this.currentConfigContent.outputJSNames;
    }

    public shouldUpdateCache() {
        return this.shouldUpdate;
    }

    public getCacheVersion() {
        const jsNames = this.currentConfigContent.outputJSNames.join(";");
        return md5(jsNames).slice(0, 6);
    }
}
