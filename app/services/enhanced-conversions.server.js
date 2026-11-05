export function checkEnhancedConversions(config = {}) {
  return {
    enabled: !!config.enabled,
    method: config.method || "unknown", // automatic, manual, or none
    userDataFields: config.fields || [],
    hashing: config.hashing === "sha256",
  };
}