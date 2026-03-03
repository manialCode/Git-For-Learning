export const util = {
  isString: thing => typeof thing === 'string',

  /**
   * Simple deterministic hash used for object names (returns unsigned hex).
   * @param {string} string
   * @returns {string}
   */
  hash: string => {
    let hashInt = 0
    for (let i = 0; i < string.length; i++) {
      hashInt = (hashInt * 31 + string.charCodeAt(i)) | 0
    }
    // Return as unsigned hex string so it's suitable for filenames
    return (hashInt >>> 0).toString(16)
  },

  setIn: (obj, arr) => {
    if (arr.length === 2) {
      obj[arr[0]] = arr[1]
    } else if (arr.length > 2) {
      obj[arr[0]] = obj[arr[0]] || {}
      util.setIn(obj[arr[0]], arr.slice(1))
    }
    return obj
  },

  lines: str => str.split('\n').filter(l => l !== ''),

  flatten: arr =>
    arr.reduce((a, e) => a.concat(Array.isArray(e) ? util.flatten(e) : e), []),

  unique: arr => arr.reduce((a, p) => (a.includes(p) ? a : [...a, p]), []),

  intersection: (a, b) => a.filter(e => b.includes(e)),

  onRemote:
    remotePath =>
    (fn, ...args) => {
      const originalDir = process.cwd()
      process.chdir(remotePath)
      try {
        return fn(...args)
      } finally {
        process.chdir(originalDir)
      }
    }
}
