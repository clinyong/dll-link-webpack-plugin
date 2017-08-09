import * as fs from "fs-extra";
import * as webpack from "webpack";
import * as _ from "lodash";
import * as md5 from "md5";
import { getDependency, PackageDependency } from "./utils/packageDependency";

export type DllEntry = string | string[] | webpack.Entry;

export interface DllConfigFile {
	outputJSNames: string[];
}

export interface ManifestCache {
	configFiles: { [index: string]: DllConfigFile };
	entryVersion: PackageDependency;
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
				entryVersion: {}
			};
		}

		this.currentConfigContent = this.manifestCache.configFiles[
			this.configIndex
		] || { outputJSNames: [] };
	}

	private checkCache(entry: DllEntry) {
		const entryVersion = getDependency(entry);
		if (entryVersion) {
			this.shouldUpdate =
				this.currentConfigContent.outputJSNames.length === 0 ||
				!_.isEqual(this.manifestCache.entryVersion, entryVersion);
			this.manifestCache.entryVersion = entryVersion;
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
