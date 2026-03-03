const objects = {
  writeTree: tree => {
    const treeObject =
      Object.keys(tree)
        .map(key =>
          util.isString(tree[key])
            ? `blob ${tree[key]} ${key}`
            : `tree ${objects.writeTree(tree[key])} ${key}`
        )
        .join('\n') + '\n'

    return objects.write(treeObject)
  },

  fileTree: (treeHash, tree = {}) => {
    util.lines(objects.read(treeHash)).forEach(line => {
      const [type, hash, name] = line.split(/ /)
      tree[name] = type === 'tree' ? objects.fileTree(hash, {}) : hash
    })
    return tree
  },

  writeCommit: (treeHash, message, parentHashes) =>
    objects.write(
      `commit${treeHash}\n${parentHashes
        .map(h => `parent ${h}\n`)
        .join('')}Date:  ${new Date().toString()}\n\n    ${message}\n`
    ),

  write: str => {
    files.write(path.join(files.gitletPath(), 'objects', util.hash(str)), str)
    return util.hash(str)
  },

  isUpToDate: (receiverHash, giverHash) =>
    receiverHash !== undefined &&
    (receiverHash === giverHash || objects.isAncestor(receiverHash, giverHash)),

  exists: objectHash =>
    objectHash !== undefined &&
    fs.existsSync(path.join(files.gitletPath(), 'objects', objectHash)),

  read: objectHash => {
    if (objectHash !== undefined) {
      const objectPath = path.join(files.gitletPath(), 'objects', objectHash)
      if (fs.existsSync(objectPath)) {
        return files.read(objectPath)
      }
    }
  },

  allObjects: () =>
    fs.readdirSync(files.gitletPath('objects')).map(objects.read),

  type: str =>
    ({ commit: 'commit', tree: 'tree', blob: 'tree' }[str.split(' ')[0]] ||
    'blob'),

  isAncestor: (descendentHash, ancestorHash) =>
    objects.ancestors(descendentHash).includes(ancestorHash),

  ancestors: commitHash => {
    const parents = objects.parentHashes(objects.read(commitHash))
    return util.flatten(parents.concat(parents.map(objects.ancestors)))
  },

  parentHashes: str => {
    if (objects.type(str) === 'commit') {
      return str
        .split('\n')
        .filter(line => line.startsWith('parent'))
        .map(line => line.split(' ')[1])
    }
  },

  treeHash: str =>
    objects.type(str) === 'commit' ? str.split(/\s/)[1] : undefined,

  commitToc: hash =>
    files.flattenNestedTree(
      objects.fileTree(objects.treeHash(objects.read(hash)))
    )
}

export default objects
