// Metro yapılandırması — https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite web'de SQLite motorunu wa-sqlite.wasm dosyasından yükler;
// Metro .wasm uzantısını varsayılan olarak tanımadığı için asset listesine
// eklenir (aksi halde "Unable to resolve module ./wa-sqlite/wa-sqlite.wasm").
config.resolver.assetExts.push('wasm');

module.exports = config;
