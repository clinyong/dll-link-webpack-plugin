var webpack = require("webpack");
var path = require("path");

module.exports = {
    entry: {
        vendor: [path.resolve(__dirname, "lib1.js")],
        lib2: [path.resolve(__dirname, "lib2.js")]
    },
    output: {
        filename: "[name].bundle.js",
        path: path.resolve(__dirname, "../build"),
        library: "vendor_lib"
    },
    plugins: [
        new webpack.DllPlugin({
            name: "vendor_lib",
            path: path.resolve(__dirname, "../build/[name]-manifest.json")
        })
    ]
};
