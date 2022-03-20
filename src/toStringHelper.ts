/**
 * Utility function to help converting a value to string
 * util.inspect seems to depend on node.
 * @hidden
 */
export function toStringHelper(
  obj:any | null,
  options:{ quoteStrings:boolean } = { quoteStrings: true }
):string {
  if (Array.isArray(obj)) {
    return "[" + obj.map(o => toStringHelper(o, options)) + "]"
  }
  if (typeof obj === "string") {
    return options.quoteStrings ? `'${obj}'` : obj
  }
  if (obj &&
    (
      obj.toString !== Object.prototype.toString
    )) {
    return obj.toString()
  }
  // We used to use JSON.stringify here, but that will
  // throw an exception if there are cycles, which we
  // absolutely don't want!
  // https://stackoverflow.com/a/48254637/516188
  const customStringify = function(v:any) {
    const cache = new Set()
    return JSON.stringify(v, function(key, value) {
      if (typeof value === "object" && value !== null) {
        if (cache.has(value)) {
          // Circular reference found, discard key
          return
        }
        // Store value in our set
        cache.add(value)
      }
      return value
    })
  }
  return customStringify(obj)
}
