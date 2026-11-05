export function checkConversionLinker(tags = []) {
  const linker = tags.find((t) =>
    t.type === "cvt_5RM3Q" || t.name?.toLowerCase().includes("conversion linker")
  );
  return {
    present: !!linker,
    enabled: linker?.enabled !== false,
    tag: linker || null,
  };
}