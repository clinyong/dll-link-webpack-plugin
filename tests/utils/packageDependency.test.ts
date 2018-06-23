import {
    getPKGVersion,
    getDependencyFromYarn
} from "../../src/utils/packageDependency";

test("utils - getPKGVersion", () => {
    const v = getPKGVersion("jest");
    expect(v).toBe("22.4.3");
});

test("utils - getPKGVersion for namespaced package", () => {
    const v = getPKGVersion("@sindresorhus/is");
    expect(v).toBe("0.7.0");
});

test("utils - getDependencyFromYarn", () => {
    const dep = getDependencyFromYarn("fs-extra");
    expect(Object.keys(dep).length).toBeGreaterThan(0);
});
