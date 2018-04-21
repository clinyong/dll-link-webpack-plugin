module.exports = {
    moduleFileExtensions: ["ts", "tsx", "js"],
    transform: {
        "^.+\\.(ts|tsx)$": "<rootDir>/scripts/preprocessor.js"
    },
    testMatch: ["<rootDir>/tests/**/*.+(ts)"]
};
