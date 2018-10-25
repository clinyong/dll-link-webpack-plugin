import * as path from "path";
import { getPackageList } from "@fmtk/package-list";

const NODE_MODULES_PATH = path.resolve("./node_modules");

export interface YarnDependency {
    version: string;
    dependencies?: PackageDependency;
}

export interface PackageDependency {
    [index: string]: YarnDependency;
}

function convertEntryToList(entry: any): string[] {
    if (typeof entry === "string") {
        return [entry];
    } else if (Array.isArray(entry)) {
        return entry;
    } else if (typeof entry === "object") {
        let list = [];
        Object.keys(entry).forEach(k => {
            list = list.concat(entry[k]);
        });
        return list;
    } else {
        throw `Incorrect entry type.`;
    }
}

export function getDependencyFromYarn(entry: any): PackageDependency | null {
    let entryList = convertEntryToList(entry);
    const packages = getPackageList();
    if (!packages) {
        return null;
    }

    const root = packages[".@."];
    if (!root || !root.dependencies) {
        return;
    }

    entryList = entryList
        .map(item => {
            const version = root.dependencies[item];
            return version ? `${item}@${version}` : "";
        })
        .filter(item => !!item);

    function findDependency(
        entryList: string[],
        history?: string[]
    ): PackageDependency {
        let m: PackageDependency = {};
        entryList.map(k => {
            if (history && history.indexOf(k) >= 0) {
                // skip circular dependency
                return;
            }
            const info = packages[k];
            let item: YarnDependency = {
                version: info.version
            };
            if (info.dependencies) {
                item.dependencies = findDependency(
                    Object.keys(info.dependencies).map(
                        k => `${k}@${info.dependencies[k]}`
                    ),
                    history ? [...history, k] : [k]
                );
            }

            m[k] = item;
        });
        return m;
    }

    return findDependency(entryList);
}

export function getPKGVersion(yarnEntryName: string) {
    const atIndex = yarnEntryName.lastIndexOf("@");
    if (atIndex > 0) {
        yarnEntryName = yarnEntryName.substring(0, atIndex);
    }
    const pkgPath = path.join(NODE_MODULES_PATH, yarnEntryName, "package.json");
    const pkg = require(pkgPath);

    return pkg.version;
}
