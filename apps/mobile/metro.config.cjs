const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// LiveStore's cross-platform dependencies publish browser exports for Web APIs
// such as crypto. Their default exports can import Node built-ins.
config.resolver.unstable_conditionsByPlatform = {
  ...config.resolver.unstable_conditionsByPlatform,
  ios: ["browser"],
  android: ["browser"],
};

module.exports = config;
