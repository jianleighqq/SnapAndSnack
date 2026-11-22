try {
  const serverOnlyPath = require.resolve("server-only");
  require.cache[serverOnlyPath] = {
    exports: {},
    loaded: true,
    id: serverOnlyPath,
  };
} catch {
  // server-only not found or not required
}
