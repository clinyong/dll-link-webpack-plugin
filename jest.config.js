module.exports = {
    moduleFileExtensions: ["ts", "tsx", "js"],
    transform: {
        "^.+\\.(ts|tsx)$": "ts-jest"
    },
    testMatch: ["<rootDir>/tests/**/*.test.+(ts)"],
    testEnvironment: "node"
};
