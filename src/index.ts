import * as path from "path";
import * as fs from "fs-extra";
import * as _ from "lodash";
import * as md5 from "md5";
import * as chalk from "chalk";
import * as webpack from "webpack";
import * as fs2 from "fs";

const cacheDir = path.resolve(".dll.cache");
const cacheOutputDir = `${cacheDir}/output`;
const manifestFile = `${cacheDir}/manifest.json`;
let hasCompile = false;

const status = {
    ERROR: "ERROR"
};

const FS_ACCURACY = 10000;

function print(msg, level) {
    let color = null;
    switch (level) {
        case status.ERROR:
            color = chalk.red;
            break;
        default:
            color = chalk.white;
    }

    console.log(color(`[dll-link-webpack-plugin]: ${msg}`));
}

interface DllConfigFile {
    entry: string | string[] | webpack.Entry;
    outputJSNames: string[];
}

interface ManifestCache {
    configFiles: { [index: string]: DllConfigFile; };
    currentConfig: string;
    yarnLock: string;
}

export interface Output {
    jsNames: string[];
    jsPath: string;
    jsonNames: string[];
    jsonPath: string;
}

export interface DllLinkWebpackPluginOptions {
    config: webpack.Configuration;
    manifestNames?: string[];
}

function md5Slice(msg) {
    return md5(msg).slice(0, 10);
}

class DllLinkWebpackPlugin {
    output: Output;
    config: webpack.Configuration;
    referencePlugins: webpack.DllReferencePlugin[];
    updateCache: boolean;
    manifestCache: ManifestCache;
    configIndex: string;
    cacheJSDir: string;
    cacheJSONDir: string;
    manifestNames: string[];
    shouldCopy: boolean;
    pluginStartTime: number;

    constructor(options: DllLinkWebpackPluginOptions) {
        this.check = this.check.bind(this);

        const { config, manifestNames } = options;
        if (manifestNames && !_.isArray(manifestNames)) {
            throw new Error("manifest names must be an array.");
        }
        this.manifestNames = manifestNames || [];

        const { output, entry, plugins } = config;

        // check cache
        this.configIndex = md5Slice(JSON.stringify(config));
        const outputDir = `${cacheOutputDir}/${this.configIndex}`;
        this.cacheJSDir = `${outputDir}/js`;
        this.cacheJSONDir = `${outputDir}/json`;

        if (fs.existsSync(manifestFile)) {
            this.manifestCache = JSON.parse(fs.readFileSync(manifestFile));
        } else {
            this.manifestCache = {
                configFiles: {},
                yarnLock: "",
                currentConfig: ""
            };
        }

        let configCache = this.manifestCache.configFiles[this.configIndex];
        let updateEntry = !configCache;
        if (configCache) {
            updateEntry = !_.isEqual(configCache.entry, entry);
            if (updateEntry) {
                configCache.entry = entry;
            }
        } else {
            this.manifestCache.configFiles[this.configIndex] = configCache = {
                entry,
                outputJSNames: []
            };
        }

        const yarnMD5 = md5Slice(fs.readFileSync("yarn.lock").toString());
        const updateYarn = !(this.manifestCache.yarnLock === yarnMD5);
        if (updateYarn) {
            this.manifestCache.yarnLock = yarnMD5;
        }

        this.updateCache = updateYarn || updateEntry;
        this.shouldCopy = !this.manifestCache.currentConfig || this.manifestCache.currentConfig !== this.configIndex;
        this.manifestCache.currentConfig = this.configIndex;

        // rewrite config
        let index = -1;
        for (let i = 0; i < plugins.length; i++) {
            if (plugins[i] instanceof webpack.DllPlugin) {
                index = i;
                break;
            }
        }

        if (index === -1) {
            throw new Error("Your webpack dll config miss DllPlugin.");
        }

        const dllPlugin: any = plugins[index];
        const dllOptions: webpack.DllPlugin.Options = dllPlugin.options;
        const dllJsonFullPath = dllOptions.path;
        const i = dllJsonFullPath.lastIndexOf("/");
        const dllJsonPath = dllJsonFullPath.slice(0, i);
        const jsonNameTPL = dllJsonFullPath.slice(i + 1);

        let outputJsonNames = [];
        Object.keys(entry).forEach(entryName => {
            outputJsonNames.push(jsonNameTPL.replace("[name]", entryName));
        });

        this.output = {
            jsNames: this.filterJSOutput(configCache.outputJSNames),
            jsPath: output.path,
            jsonNames: outputJsonNames,
            jsonPath: dllJsonPath
        };

        config.output.path = this.cacheJSDir;
        dllPlugin.options.path = `${this.cacheJSONDir}/${jsonNameTPL}`;
        config.plugins[index] = dllPlugin;

        this.config = config;

        let referenceNames = manifestNames || this.output.jsonNames;
        let referenceConf: webpack.DllReferencePlugin.Options[] = referenceNames.map(name => ({
            manifest: `${this.output.jsonPath}/${name}`
        }) as any);
        if (dllOptions.context) {
            referenceConf = referenceConf.map(conf => ({
                ...conf,
                context: dllOptions.context
            }));
        }
        this.referencePlugins = referenceConf.map(conf => new webpack.DllReferencePlugin(conf));
        this.pluginStartTime = Date.now()
    }

    filterJSOutput(outputNames) {
        const list = this.manifestNames
            .map(name => outputNames.find(cacheName => cacheName.indexOf(name) !== -1))
            .filter(name => !!name);

        return list.length > 0 ? list : outputNames;
    }

    updateManifestCache() {
        fs.writeFileSync(manifestFile, JSON.stringify(this.manifestCache));
    }

    copyJSFile(name: string) {
        fs.copySync(this.getCacheJSPath(name), `${this.output.jsPath}/${name}`,{preserveTimestamps: true});
    }

    copyJSONFile(name: string) {
        fs.copySync(this.getCacheJSONPath(name), `${this.output.jsonPath}/${name}`,{preserveTimestamps: true});
    }

    getCacheJSPath(name: string){
        return `${this.cacheJSDir}/${name}`
    }

    getCacheJSONPath(name: string){
        return `${this.cacheJSONDir}/${name}`
    }

    copyFile() {
        this.output.jsNames.forEach(name => {
            this.copyJSFile(name);
        });
        this.output.jsonNames.forEach(name => {
            this.copyJSONFile(name);
        });
    }

    modifyGenerateFileModifyTime() {
        const time = parseInt((Math.floor((this.pluginStartTime - FS_ACCURACY) /1000)).toFixed())
        this.output.jsNames.forEach(name => {
            fs.utimesSync(this.getCacheJSPath(name), time, time)
        });
        this.output.jsonNames.forEach(name => {
            fs.utimesSync(this.getCacheJSONPath(name), time, time)
        });
    }

    check(compilation, cb) {
        if (!hasCompile) {
            hasCompile = true;
            if (this.updateCache) {
                webpack(this.config, (err, stats) => {
                    const assets = stats.toJson().assets.map(asset => asset.name);
                    this.manifestCache.configFiles[this.configIndex].outputJSNames = assets;
                    this.output.jsNames = this.filterJSOutput(assets);
                    this.modifyGenerateFileModifyTime();
                    this.updateManifestCache();
                    this.copyFile();
                    return cb();
                });
            } else {
                if (this.shouldCopy) {
                    this.updateManifestCache();
                    this.copyFile();
                } else {
                    this.output.jsNames.forEach(name => {
                        const namePath = `${this.output.jsPath}/${name}`;
                        if (!fs.existsSync(namePath)) {
                            this.copyJSFile(name);
                        }
                    });
                    this.output.jsonNames.forEach(name => {
                        const namePath = `${this.output.jsonPath}/${name}`;
                        if (!fs.existsSync(namePath)) {
                            this.copyJSONFile(name);
                        }
                    });
                }
                return cb();
            }
        } else {
            return cb();
        }
    }

    apply(compiler) {
        compiler.plugin("before-compile", this.check);

        this.referencePlugins.forEach(plugin => {
            plugin.apply.call(plugin, compiler);
        });
    }
}

module.exports = DllLinkWebpackPlugin;