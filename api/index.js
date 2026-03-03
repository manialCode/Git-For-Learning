/**
 * Index helper: read/write index, conflicts and TOC manipulation.
 * Public API: hasFile, read, key, keyPieces, toc, isFileInConflict,
 * conflictedPaths, writeNonConflict, writeConflict, writeRm, _writeStageEntry,
 * write, workingCopyToc, tocToIndex, matchingFiles
 */
const index = {
  hasFile: (path, stage) => index.read()[index.key(path, stage)] !== undefined,

  read: () => {
    const indexFilePath = files.gitletPath('index')
    return util
      .lines(fs.existsSync(indexFilePath) ? files.read(indexFilePath) : '\n')
      .reduce((idx, blobStr) => {
        const [p, stage, hash] = blobStr.split(/ /)
        idx[index.key(p, stage)] = hash
        return idx
      }, {})
  },

  key: (path, stage) => `${path},${stage}`,

  keyPieces: key => {
    const [path, stage] = key.split(',')
    return { path, stage: parseInt(stage) }
  },

  toc: () => {
    const idx = index.read()
    return Object.keys(idx).reduce(
      (obj, k) => util.setIn(obj, [k.split(',')[0], idx[k]]),
      {}
    )
  },

  isFileInConflict: path => index.hasFile(path, 2),

  conflictedPaths: () => {
    const idx = index.read()
    return Object.keys(idx)
      .filter(k => index.keyPieces(k).stage === 2)
      .map(k => index.keyPieces(k).path)
  },

  writeNonConflict: (path, content) => {
    index.writeRm(path)
    index._writeStageEntry(path, 0, content)
  },

  writeConflict: (path, receiverContent, giverContent, baseContent) => {
    if (baseContent !== undefined) {
      index._writeStageEntry(path, 2, receiverContent)
      index._writeStageEntry(path, 3, giverContent)
    }
  },

  writeRm: path => {
    const idx = index.read()
    ;[0, 1, 2, 3].forEach(stage => {
      delete idx[index.key(path, stage)]
    })
    index.write(idx)
  },

  _writeStageEntry: (path, stage, content) => {
    const idx = index.read()
    idx[index.key(path, stage)] = objects.write(content)
    index.write(idx)
  },

  write: idx => {
    const indexStr =
      Object.keys(idx)
        .map(k => {
          const [p, stage] = k.split(',')
          return `${p} ${stage} ${idx[k]}`
        })
        .join('\n') + '\n'
    files.write(files.gitletPath('index'), indexStr)
  },

  workingCopyToc: () =>
    Object.keys(index.read())
      .map(k => k.split(',')[0])
      .filter(p => fs.existsSync(files.workingCopyPath(p)))
      .reduce((toc, p) => {
        toc[p] = util.hash(files.read(files.workingCopyPath(p)))
        return toc
      }, {}),

  tocToIndex: toc =>
    Object.keys(toc).reduce(
      (idx, p) => util.setIn(idx, [index.key(p, 0), toc[p]]),
      {}
    ),

  matchingFiles: pathSpec => {
    if (pathSpec == null) return Object.keys(index.toc())
    const searchPath = files.pathFromRepoRoot(pathSpec)
    const regex = new RegExp('^' + searchPath.replace(/\\/g, '\\\\'))
    return Object.keys(index.toc()).filter(p => regex.test(p))
  }
}

export default index
