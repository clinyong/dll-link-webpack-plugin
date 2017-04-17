import * as path from "path";
import * as fs from "fs-extra";
import * as _ from "lodash";
import * as md5 from "md5";
import * as chalk from "chalk";
import * as webpack from "webpack";

const cacheDir = path.resolve(".dll.cache");
const cacheOutputDir = `${cacheDir}/output`;
const manifestFile = `${cacheDir}/manifest.json`;
let hasCompile = false;

const status = {
    ERROR: "ERROR"
};

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

    constructor(options: DllLinkWebpackPluginOptions) {
        const { config, manifestNames } = options;
        if (manifestNames && !_.isArray(manifestNames)) {
            throw new Error("manifest names must be an array.");
        }
        this.manifestNames = manifestNames || [];

        const { output, entry, plugins } = config;

        // check cache
        this.configIndex = md5Slice(config.toString());
        const outputDir = `${cacheOutputDir}/${this.configIndex}`;
        this.cacheJSDir = `${outputDir}/js`;
        this.cacheJSONDir = `${outputDir}/json`;

        if (fs.existsSync(manifestFile)) {
            this.manifestCache = JSON.parse(fs.readFileSync(manifestFile));
        } else {
            this.manifestCache = {
                configFiles: {},
                yarnLock: ""
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

        if (!this.updateCache) {
            this.output.jsNames.forEach(name => {
                if (!fs.existsSync(name)) {
                    this.copyJSFile(name);
                }
            });
            this.output.jsonNames.forEach(name => {
                if (!fs.existsSync(name)) {
                    this.copyJSONFile(name);
                }
            });
        }
    }

    filterJSOutput(outputNames) {
        const list = this.manifestNames
            .map(name => outputNames.find(cacheName => cacheName.indexOf(name) !== -1))
            .filter(name => !!name);

        return list.length > 0 ? list : outputNames;
    }

    updateManifestCache() {
        fs.writeFile(manifestFile, JSON.stringify(this.manifestCache));
    }

    copyJSFile(name: string) {
        fs.copySync(`${this.cacheJSDir}/${name}`, `${this.output.jsPath}/${name}`);
    }

    copyJSONFile(name: string) {
        fs.copySync(`${this.cacheJSONDir}/${name}`, `${this.output.jsonPath}/${name}`);
    }

    copyFile() {
        this.output.jsNames.forEach(name => {
            this.copyJSFile(name);
        });
        this.output.jsonNames.forEach(name => {
            this.copyJSONFile(name);
        });
    }

    apply(compiler) {
        compiler.plugin("before-compile", (compilation, cb) => {
            if (!hasCompile) {
                hasCompile = true;

                if (this.updateCache) {
                    webpack(this.config, (err, stats) => {
                        const assets = stats.toJson().assets.map(asset => asset.name);
                        this.manifestCache.configFiles[this.configIndex].outputJSNames = assets;
                        this.output.jsNames = this.filterJSOutput(assets);
                        this.updateManifestCache();
                        this.copyFile();
                        return cb();
                    });
                } else {
                    return cb();
                }
            } else {
                return cb();
            }
        });

        this.referencePlugins.forEach(plugin => {
            plugin.apply.call(plugin, compiler);
        });
    }
}

module.exports = DllLinkWebpackPlugin;