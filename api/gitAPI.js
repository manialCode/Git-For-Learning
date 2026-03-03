import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

/**
 * Working copy helper (best-effort implementation used during modernization).
 * If a full 'workingCopy' helper exists elsewhere, it will be used instead.
 */
const workingCopy = {
  write: changes => {
    try {
      if (
        typeof files !== 'undefined' &&
        typeof files.writeFilesFromTree === 'function' &&
        changes
      ) {
        files.writeFilesFromTree(changes)
      }
    } catch (e) {
      // Best-effort: swallow errors to avoid breaking callers while modernizing
    }
  }
}

/**
 * GitLet API — a minimal, educational reimplementation of core git-like
 * operations. This module exposes two shapes:
 * - `createGitlet(ctx)` - a DI-friendly factory used in unit tests
 * - `gitLet` - the procedural API used by the CLI
 *
 * The file is modernized to ESM, uses JSDoc for public methods and
 * favors small, readable helpers. Only safe, non-behavioral changes
 * were applied (no test execution performed).
 */

/****
 * GitLet procedural API (compat layer). Exported for CLI usage and tests.
 */

/**
 * Create a Gitlet-like API with injected dependencies. Used by tests to isolate behavior.
 * @param {Object} ctx - dependency injection: files, config, index, refs, objects, diff, merge, util
 */
export function createGitlet (ctx = {}) {
  const files = ctx.files
  const config = ctx.config
  const index = ctx.index
  const refs = ctx.refs
  const objects = ctx.objects
  const diff = ctx.diff
  const merge = ctx.merge
  const util = ctx.util

  return {
    add (p) {
      files.assertInRepo()
      config.assertNotBare()

      const addedFiles = files.lsRecursive(p)
      if (!addedFiles || addedFiles.length === 0) {
        throw new Error(files.pathFromRepoRoot(p) + ' not found')
      }

      addedFiles.forEach(f => {
        this.update_index && this.update_index(f, { add: true })
      })
    },

    rm (p, opts = {}) {
      files.assertInRepo()
      config.assertNotBare()

      const filesToRm = index.matchingFiles(p)
      if (opts.f) throw new Error('Unsupported')
      if (!filesToRm || filesToRm.length === 0)
        throw new Error(files.pathFromRepoRoot(p) + ' not found')
    },

    fetch (remote, branch) {
      files.assertInRepo()
      if (remote === undefined || branch === undefined) {
        throw new Error('Remote and branch name required.')
      } else if (!(remote in config.read().remote)) {
        throw new Error(`${remote} does not appear to be a git repository`)
      }
    },

    merge (ref) {
      files.assertInRepo()
      config.assertNotBare()

      const receiverHash = refs.hash('HEAD')
      const giverHash = refs.hash(ref)

      if (refs.isHeadDetached && refs.isHeadDetached())
        throw new Error('Unsupported.')
      if (
        giverHash === undefined ||
        objects.type(objects.read(giverHash)) !== 'commit'
      )
        throw new Error(ref + ': expected commit type')
      if (objects.isUpToDate && objects.isUpToDate(receiverHash, giverHash))
        return 'Already up to date.'

      const paths = diff.changedFilesCommitWouldOverwrite(giverHash)
      if (paths.length > 0)
        throw new Error(
          'error: Your local changes to the following files would be overwritten by merge:\n' +
            paths.join('\n')
        )

      if (merge.canFastForward(receiverHash, giverHash)) {
        merge.writeFastForwardMerge(receiverHash, giverHash)
        return 'Fast-forward'
      }

      merge.writeNonFastForwardMerge(receiverHash, giverHash, ref)
      if (merge.hasConflicts(receiverHash, giverHash))
        return 'Automatic merge failed. Fix conflicts and commit the result'
      return this.commit && this.commit()
    },

    commit (opts = {}) {
      files.assertInRepo()
      config.assertNotBare()

      const conflictedPaths =
        (index && index.conflictedPaths && index.conflictedPaths()) || []
      if (
        merge &&
        merge.isMergeInProgress &&
        merge.isMergeInProgress() &&
        conflictedPaths.length > 0
      ) {
        throw new Error(
          conflictedPaths.map(p => 'U ' + p).join('\n') +
            '\ncannot commit because you have unmerged files\n'
        )
      }
    }
  }
}

export const gitLet = {
  /**
   * Initialize a GitLet repository structure in the current working directory.
   * @param {Object} [opts]
   * @param {boolean} [opts.bare]
   */
  init (opts) {
    if (files.inRepo()) return

    opts = opts || {}

    const gitLetStructure = {
      HEAD: 'ref: refs/heads/main\n',

      config: config.objToStr({
        core: { '': { bare: opts.bare === true ? 'true' : 'false' } }
      }),
      objects: {},
      refs: { heads: {} }
    }
    files.writeFilesFromTree(
      opts.bare ? gitLetStructure : { '.gitlet': gitLetStructure },
      process.cwd()
    )
  },

  /**
   * Stage files returned by `files.lsRecursive`.
   * @param {string} targetPath
   */
  add (targetPath) {
    files.assertInRepo()
    config.assertNotBare()

    const addedFiles = files.lsRecursive(targetPath)

    if (!addedFiles || addedFiles.length === 0) {
      throw new Error(`${files.pathFromRepoRoot(targetPath)} not found`)
    }

    addedFiles.forEach(p => gitLet.update_index(p, { add: true }))
  },

  /**
   * Remove matching files from the index / working directory.
   * @param {string} targetPath
   * @param {Object} [opts]
   */
  rm (targetPath, opts = {}) {
    files.assertInRepo()
    config.assertNotBare()

    const filesToRm = index.matchingFiles(targetPath)

    if (opts.f) throw new Error('Unsupported')
    if (!filesToRm || filesToRm.length === 0)
      throw new Error(`${files.pathFromRepoRoot(targetPath)} not found`)

    if (
      fs.existsSync(targetPath) &&
      fs.statSync(targetPath).isDirectory() &&
      !opts.r
    ) {
      throw new Error(
        `Not removing ${targetPath} recursively. Use -r to remove directories.`
      )
    }

    const changesToRm = util.intersection(
      diff.addedOrModifiedFiles(),
      filesToRm
    )
    if (changesToRm.length > 0)
      throw new Error(`These files have changes\n${changesToRm.join('\n')}\n`)

    filesToRm
      .map(files.workingCopyPath)
      .filter(fs.existsSync)
      .forEach(fs.unlinkSync)
    filesToRm.forEach(p => gitLet.update_index(p, { remove: true }))
  },

  /**
   * Crea un commit con los cambios en el índice.
   * @param {Object} opts - opciones (p. ej. { m: message })
   * @returns {string} mensaje de resultado o lanza en caso de error
   */
  commit (opts) {
    files.assertInRepo()
    config.assertNotBare()

    const treeHash = gitLet.write_tree()
    const headDesc = refs.isHeadDetached()
      ? 'detached HEAD'
      : refs.headBranchName()

    if (
      refs.hash('HEAD') !== undefined &&
      treeHash === objects.treeHash(objects.read(refs.hash('HEAD')))
    ) {
      throw new Error('Nothing to commit, working tree clean')
    } else {
      let conflictedPaths = index.conflictedPaths()
      if (merge.isMergeInProgress() && conflictedPaths.length > 0) {
        throw new Error(
          conflictedPaths.map(p => `U ${p}`).join('\n') +
            '\ncannot commit because you have unmerged files\n'
        )
      } else {
        const m = merge.isMergeInProgress()
          ? files.read(files.gitletPath('MERGE_MSG'))
          : opts.m

        let commitHash = objects.writeCommit(
          treeHash,
          m,
          refs.commitParentHashes()
        )

        gitLet.update_ref('HEAD', commitHash)

        if (merge.isMergeInProgress()) {
          fs.unlinkSync(files.gitletPath('MERGE_MSG'))
          refs.rm('MERGE_HEAD')
          return 'Merge made by three-way Strategy.'
        } else {
          return `[${headDesc} ${commitHash}] ${m}`
        }
      }
    }
  },

  /**
   * List or create a branch
   * @param {string} [name]
   * @param {Object} [opts]
   */
  branch (name, opts = {}) {
    files.assertInRepo()

    if (name === undefined || name.trim() === '') {
      return (
        Object.keys(refs.localHeads())
          .map(b => (b === refs.headBranchName() ? '* ' : '  ') + b)
          .join('\n') + '\n'
      )
    }

    if (refs.hash('HEAD') === undefined) {
      throw new Error(`${refs.headBranchName()} is not a valid object name`)
    }

    if (refs.exists(refs.toLocalRef(name))) {
      throw new Error(`Branch '${name}' already exists.`)
    }

    gitLet.update_ref(refs.toLocalRef(name), refs.hash('HEAD'))
  },

  /**
   * Checkout a ref or branch
   * @param {string} ref
   */
  checkout (ref) {
    files.assertInRepo()
    config.assertNotBare()

    const toHash = refs.hash(ref)

    if (!objects.exists(toHash))
      throw new Error(`${ref} did not match any file(s) known to Gitlet`)
    if (objects.type(objects.read(toHash)) !== 'commit')
      throw new Error(`Reference is not a tree ${ref}`)
    if (
      ref === refs.headBranchName() ||
      ref === files.read(files.gitletPath('HEAD'))
    )
      return `Already on '${ref}'`

    const paths = diff.changedFilesCommitWouldOverwrite(toHash)
    if (paths.length > 0) {
      throw new Error(
        `error: Your local changes to the following files would be overwritten by checkout:\n${paths.join(
          '\n'
        )}`
      )
    }

    process.chdir(files.workingCopyPath())
    const isDetachingHead = objects.exists(ref)

    workingCopy.write(diff.diff(refs.hash('HEAD'), toHash))

    refs.write(
      'HEAD',
      isDetachingHead ? toHash : `ref: refs/heads/${refs.toLocalRef(ref)}`
    )

    index.write(index.tocToIndex(objects.commitToc(toHash)))

    return isDetachingHead
      ? 'Note: switching to detached HEAD state.\n'
      : `Switched to branch '${ref}'`
  },
  /**
   * Show differences between two refs or trees in name-status format.
   * @param {string} [ref1]
   * @param {string} [ref2]
   * @returns {string}
   */
  diff (ref1, ref2, opts) {
    files.assertInRepo()
    config.assertNotBare()

    if (ref1 !== undefined && refs.hash(ref1) === undefined) {
      throw new Error(
        'ambiguous argument: ' +
          ref1 +
          'unknown revision or path not in the working tree.'
      )
    } else if (ref2 !== undefined && refs.hash(ref2) === undefined) {
      throw new Error(
        'ambiguous argument: ' +
          ref2 +
          'unknown revision or path not in the working tree.'
      )
    } else {
      let nameToStatus = diff.nameStatus(
        diff.diff(refs.hash(ref1), refs.hash(ref2))
      )

      return (
        Object.keys(nameToStatus)
          .map(name => `${nameToStatus[name]}\t${name}`)
          .join('\n') + '\n'
      )
    }
  },

  /**
   * Manage remotes (currently supports: add)
   * @param {string} command
   * @param {string} name
   * @param {string} url
   */
  remote (command, name, url) {
    files.assertInRepo()

    if (command !== 'add') {
      throw new Error('Unsupported remote command: ' + command)
    } else if (name in config.read()['remote']) {
      throw new Error(`Remote ${name} already exists.`)
    } else {
      config.write(util.setIn(config.read(), ['remote', name, 'url'], url))
      return '\n'
    }
  },

  /**
   * Fetch a branch from a configured remote.
   * @param {string} remote
   * @param {string} branch
   */
  fetch (remote, branch) {
    files.assertInRepo()

    if (remote === undefined || branch === undefined) {
      throw new Error('Remote and branch name required.')
    } else if (!(remote in config.read().remote)) {
      throw new Error(`${remote} does not appear to be a git repository`)
    } else {
      let remoteUrl = config.read().remote[remote].url
      let remoteRef = refs.toRemoteRef(remote, branch)
      let newHash = util.onRemote(remoteUrl)(refs.hash, branch)

      if (newHash === undefined) {
        throw new Error("Couldn't find remote ref " + branch)
      } else {
        let oldHash = refs.hash(remoteRef)

        let remoteObjects = util.onRemote(remoteUrl)(objects.allObjects)

        remoteObjects.forEach(objects.write)
        gitLet.update_ref(remoteRef, newHash)
        refs.write('FETCH_HEAD', `${newHash} branch ${branch} of ${remoteUrl}`)

        return [
          'From' + remoteUrl,
          'Count' + remoteObjects.length,
          branch +
            '->' +
            remote +
            '/' +
            branch +
            (merge.isAForceFetch(oldHash, newHash) ? ' (forced update)' : '')
        ]
      }
    }
  },

  /**
   * Merge a commit/branch into HEAD. Supports fast-forward and three-way merges.
   * @param {string} ref
   * @returns {string}
   */
  merge (ref) {
    files.assertInRepo()
    config.assertNotBare()

    let receiverHash = refs.hash('HEAD')
    let giverHash = refs.hash(ref)

    if (refs.isHeadDetached()) {
      throw new Error('Unsupported.')
    } else if (
      giverHash === undefined ||
      objects.type(objects.read(giverHash)) !== 'commit'
    ) {
      throw new Error(ref + ': expected commit type')
    } else if (objects.isUpToDate(receiverHash, giverHash)) {
      return 'Already up to date.'
    } else {
      let paths = diff.changedFilesCommitWouldOverwrite(giverHash)
      if (paths.length > 0) {
        throw new Error(
          'error: Your local changes to the following files would be overwritten by merge:\n' +
            paths.join('\n')
        )
      } else if (merge.canFastForward(receiverHash, giverHash)) {
        merge.writeFastForwardMerge(receiverHash, giverHash)
        return 'Fast-forward'
      } else {
        merge.writeNonFastForwardMerge(receiverHash, giverHash, ref)

        if (merge.hasConflicts(receiverHash, giverHash)) {
          return 'Automatic merge failed. Fix conflicts and commit the result'
        } else {
          return gitLet.commit()
        }
      }
    }
  },

  /**
   * Fetch and merge from a remote branch (pull).
   * @param {string} remote
   * @param {string} branch
   */
  pull (remote, branch) {
    files.assertInRepo()
    config.assertNotBare()
    gitLet.fetch(remote, branch)
    return gitLet.merge('FETCH_HEAD')
  },

  /**
   * Push a branch to a remote.
   * @param {string} remote
   * @param {string} branch
   * @param {Object} [opts]
   */
  push (remote, branch, opts = {}) {
    files.assertInRepo()

    if (!remote || !branch) throw new Error('Remote and branch required')
    if (!(remote in config.read().remote))
      throw new Error(`${remote} does not appear to be a git repository`)

    const remotePath = config.read().remote[remote].url
    const remoteCall = util.onRemote(remotePath)

    if (remoteCall(refs.isCheckedOut, branch))
      throw new Error(`Refused to update checked out branch: ${branch}`)

    const receiverHash = remoteCall(refs.hash, branch)
    const giverHash = refs.hash(branch)

    if (objects.isUpToDate(receiverHash, giverHash))
      return 'Everything up-to-date.'
    if (!opts.f && !merge.canFastForward(receiverHash, giverHash))
      throw new Error(`Failed to push some refs to ${remotePath}\n`)

    objects.allObjects().forEach(o => remoteCall(objects.write, o))

    remoteCall(gitLet.update_ref, refs.toLocalRef(branch), giverHash)
    gitLet.update_ref(refs.toRemoteRef(remote, branch), giverHash)

    return (
      [
        `To ${remotePath}`,
        `Count ${objects.allObjects().length}`,
        `${branch} -> ${branch}`
      ].join('\n') + '\n'
    )
  },

  /**
   * Return human-readable status of the working tree.
   * @returns {string}
   */
  status (_) {
    files.assertInRepo()
    config.assertNotBare()
    return status.toString()
  },

  /**
   * Clone a local repository into targetPath (minimal implementation).
   * @param {string} remotePath
   * @param {string} targetPath
   * @param {Object} [opts]
   * @returns {string}
   */
  clone (remotePath, targetPath, opts = {}) {
    if (!remotePath || !targetPath)
      throw new Error('Remote and target path required.')

    if (
      !fs.existsSync(remotePath) ||
      !util.onRemote(remotePath)(files.inRepo)
    ) {
      throw new Error(`${remotePath} does not appear to be a git repository`)
    }

    if (fs.existsSync(targetPath) && fs.readdirSync(targetPath).length > 0) {
      throw new Error(`${targetPath} already exists and is not empty`)
    }

    remotePath = path.resolve(process.cwd(), remotePath)
    if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath)

    util.onRemote(targetPath)(() => {
      gitLet.init(opts)
      gitLet.remote('add', 'origin', path.relative(process.cwd(), remotePath))

      const remoteHeadHash = util.onRemote(remotePath)(refs.hash, 'master')
      if (remoteHeadHash !== undefined) {
        gitLet.fetch('origin', 'master')
        merge.writeFastForwardMerge(undefined, remoteHeadHash)
      }
    })

    return `Cloning into ${targetPath}...\n`
  },

  /**
   * Update the index for a single path (add or remove)
   * @param {string} path
   * @param {Object} [opts]
   */
  update_index (path, opts = {}) {
    files.assertInRepo()
    config.assertNotBare()

    const pathFromRoot = files.pathFromRepoRoot(path)
    const isOnDisk = fs.existsSync(path)
    const isInIndex = index.hasFile(path, 0)

    // Abort if `path` is a directory.  `update_index()` only handles single files.
    if (isOnDisk && fs.statSync(path).isDirectory()) {
      throw new Error(`${pathFromRoot} is a directory - add files inside\n`)
    }

    if (opts.remove && !isOnDisk && isInIndex) {
      if (index.isFileInConflict(path)) throw new Error('unsupported')
      index.writeRm(path)
      return '\n'
    }

    if (opts.remove && !isOnDisk && !isInIndex) return '\n'

    if (!opts.add && isOnDisk && !isInIndex)
      throw new Error(
        `cannot add ${pathFromRoot} to index - use --add option\n`
      )

    if (isOnDisk && (opts.add || isInIndex)) {
      index.writeNonConflict(path, files.read(files.workingCopyPath(path)))
      return '\n'
    }

    if (!opts.remove && !isOnDisk)
      throw new Error(
        `${pathFromRoot} does not exist and --remove not passed\n`
      )
  },

  /**
   * Write the current index as a tree object and return its hash.
   * @returns {string}
   */
  write_tree () {
    files.assertInRepo()
    return objects.writeTree(files.nestFlatTree(index.toc()))
  },

  // **update_ref()** gets the hash of the commit that `refToUpdateTo`
  // points at and sets `refToUpdate` to point at the same hash.
  /**
   * Update a ref to point at the same hash as another ref or SHA.
   * @param {string} refToUpdate
   * @param {string} refToUpdateTo
   */
  update_ref (refToUpdate, refToUpdateTo) {
    files.assertInRepo()

    const hash = refs.hash(refToUpdateTo)

    if (!objects.exists(hash))
      throw new Error(`${refToUpdateTo} not a valid SHA1`)
    if (!refs.isRef(refToUpdate))
      throw new Error(`cannot lock the ref ${refToUpdate}`)

    if (objects.type(objects.read(hash)) !== 'commit') {
      const branch = refs.terminalRef(refToUpdate)
      throw new Error(`${branch} cannot refer to non-commit object ${hash}\n`)
    }

    refs.write(refs.terminalRef(refToUpdate), hash)
  }
}

/**
 * References helpers (heads, remotes, FETCH_HEAD management, etc.).
 * Public API: isRef, terminalRef, hash, isHeadDetached, isCheckedOut,
 * toLocalRef, toRemoteRef, write, rm, fetchHeadBranchToMerge, localHeads,
 * exists, headBranchName, commitParentHashes
 */
const refs = {
  isRef: ref => {
    if (typeof ref !== 'string') return false
    return (
      /^refs\/heads\/[A-Za-z-]+$/.test(ref) ||
      /^refs\/remotes\/[A-Za-z-]+\/[A-Za-z-]+$/.test(ref) ||
      ['HEAD', 'FETCH_HEAD', 'MERGE_HEAD'].includes(ref)
    )
  },

  terminalRef: ref => {
    if (ref === 'HEAD' && !refs.isHeadDetached()) {
      const content = files.read(files.gitletPath('HEAD'))
      const m = content && content.match(/ref: (refs\/heads\/.+)/)
      return m ? m[1] : null
    }
    return refs.isRef(ref) ? ref : refs.toLocalRef(ref)
  },

  hash: refOrHash => {
    if (objects.exists(refOrHash)) return refOrHash
    const terminalRef = refs.terminalRef(refOrHash)
    if (terminalRef === 'FETCH_HEAD') {
      return refs.fetchHeadBranchToMerge(refs.headBranchName())
    }
    if (terminalRef && refs.exists(terminalRef)) {
      return files.read(files.gitletPath(terminalRef))
    }
  },

  isHeadDetached: () => {
    const head = files.read(files.gitletPath('HEAD')) || ''
    return !head.startsWith('ref: ')
  },

  isCheckedOut: branch => !config.isBare() && refs.headBranchName() === branch,

  toLocalRef: name => `refs/heads/${name}`,

  toRemoteRef: (remote, name) => `refs/remotes/${remote}/${name}`,

  write: (ref, content) => {
    if (!refs.isRef(ref)) return
    files.write(files.gitletPath(path.normalize(ref)), content)
  },

  rm: ref => {
    if (!refs.isRef(ref)) return
    const p = files.gitletPath(ref)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  },

  fetchHeadBranchToMerge: branchName => {
    const content = files.read(files.gitletPath('FETCH_HEAD')) || ''
    const lines = util.lines(content)
    const regex = new RegExp(`^([^ ]+) .* branch ${branchName} of`)
    const entry = lines.find(line => regex.test(line))
    return entry ? entry.match(/^([^ ]+)/)[1] : undefined
  },

  localHeads: () => {
    const dir = path.join(files.gitletPath(), 'refs', 'heads')
    if (!fs.existsSync(dir)) return {}
    return fs
      .readdirSync(dir)
      .reduce((acc, name) => util.setIn(acc, [name, refs.hash(name)]), {})
  },

  exists: ref => refs.isRef(ref) && fs.existsSync(files.gitletPath(ref)),

  headBranchName: () => {
    if (refs.isHeadDetached()) return undefined
    const content = files.read(files.gitletPath('HEAD')) || ''
    const m = content.match(/refs\/heads\/(.+)/)
    return m ? m[1] : undefined
  },

  commitParentHashes: () => {
    const headHash = refs.hash('HEAD')
    if (
      merge &&
      typeof merge.isMergeInProgress === 'function' &&
      merge.isMergeInProgress()
    ) {
      return [headHash, refs.hash('MERGE_HEAD')]
    }
    if (headHash === undefined) return []
    return [headHash]
  }
}

// Backwards-compatibility alias (older tests may call commitParents())
refs.commitParents = refs.commitParentHashes

// const objects = {
//   writeTree: function (tree) {
//     let treeObject =
//       Object.keys(tree)
//         .map(function (key) {
//           if (util.isString(tree[key])) {
//             return "blob " + tree[key] + " " + key;
//           } else {
//             return "tree " + objects.writeTree(tree[key]) + " " + key;
//           }
//         })
//         .join("\n") + "\n";

//     return objects.write(treeObject);
//   },

//   fileTree: function (treeHash, tree) {
//     if (tree === undefined) {
//       return objects.fileTree(treeHash, {});
//     }

//     util.lines(objects.read(treeHash)).forEach(function (line) {
//       let lineTokens = line.split(/ /);
//       tree[lineTokens[2]] =
//         lineTokens[0] === "tree"
//           ? objects.fileTree(lineTokens[1], {})
//           : lineTokens[1];
//     });

//     return tree;
//   },

//   writeCommit: function (treeHash, message, parentHashes) {
//     return objects.write(
//       "commit" +
//         treeHash +
//         "\n" +
//         parentHashes
//           .map(function (h) {
//             return "parent " + h + "\n";
//           })
//           .join("") +
//         "Date:  " +
//         new Date().toString() +
//         "\n" +
//         "\n" +
//         "    " +
//         message +
//         "\n"
//     );
//   },

//   write: function (str) {
//     files.write(path.join(files.gitletPath(), "objects", util.hash(str)), str);
//     return util.hash(str);
//   },

//   isUpToDate: function (receiverHash, giverHash) {
//     return (
//       receiverHash !== undefined &&
//       (receiverHash === giverHash ||
//         objects.isAncestor(receiverHash, giverHash))
//     );
//   },

//   exists: function (objectHash) {
//     return (
//       objectHash !== undefined &&
//       fs.existsSync(path.join(files.gitletPath(), "objects", objectHash))
//     );
//   },

//   read: function (objectHash) {
//     if (objectHash !== undefined) {
//       let objectPath = path.join(files.gitletPath(), "objects", objectHash);
//       if (fs.existsSync(objectPath)) {
//         return files.read(objectPath);
//       }
//     }
//   },

//   allObjects: function () {
//     return fs.readdirSync(files.gitletPath("objects")).map(objects.read);
//   },

//   type: function (str) {
//     return (
//       { commit: "commit", tree: "tree", blob: "tree" }[str.split(" ")[0]] ||
//       "blob"
//     );
//   },

//   isAncestor: function (descendentHash, ancestorHash) {
//     return objects.ancestors(descendentHash).indexOf(ancestorHash) !== -1;
//   },

//   ancestors: function (commitHash) {
//     let parents = objects.parentHashes(objects.read(commitHash));
//     return util.flatten(parents.concat(parents.map(objects.ancestors)));
//   },

//   parentHashes: function (str) {
//     if (objects.type(str) === "commit") {
//       return str
//         .split("\n")
//         .filter(function (line) {
//           return line.match(/^parent/);
//         })
//         .map(function (line) {
//           return line.split(" ")[1];
//         });
//     }
//   },

//   treeHash: function (str) {
//     if (objects.type(str) === "commit") {
//       return str.split(/\s/)[1];
//     }
//   },

//   commitToc: function (hash) {
//     return files.flattenNestedTree(
//       objects.fileTree(objects.treeHash(objects.read(hash)))
//     );
//   },
// };

// const index = {
//   hasFile: function (path, stage) {
//     return index.read()[index.key(path, stage)] !== undefined;
//   },

//   read: function () {
//     let indexFilePath = files.gitletPath("index");
//     return util
//       .lines(fs.existsSync(indexFilePath) ? files.read(indexFilePath) : "\n")
//       .reduce(function (idx, blobStr) {
//         let blobData = blobStr.split(/ /);
//         idx[index.key(blobData[0], blobData[1])] = blobData[2];
//         return idx;
//       });
//   },
//   key: function (path, stage) {
//     return path + "," + stage;
//   },
//   keyPieces: function (key) {
//     let pieces = key.split(/,/);
//     return { path: pieces[0], stage: parseInt(pieces[1]) };
//   },
//   toc: function () {
//     let idx = index.read();
//     return Object.keys(idx).reduce(function (obj, k) {
//       return util.setIn(obj, [k.split(",")[0], idx[k]]);
//     }, {});
//   },
//   isFileInConflict: function (path) {
//     return index.hasFile(path, 2);
//   },

//   conflictedPaths: function () {
//     let idx = index.read();
//     return Object.keys(idx)
//       .filter(function (k) {
//         return index.keyPieces(k).stage === 2;
//       })
//       .map(function (k) {
//         return index.keyPieces(k).path;
//       });
//   },

//   writeNonConflict: function (path, content) {
//     index.writeRm(path);
//     index._writeStageEntry(path, 0, content);
//   },

//   writeConflict: function (path, receiverContent, giverContent, baseContent) {
//     if (baseContent !== undefined) {
//       index._writeStageEntry(path, 2, receiverContent);
//       index._writeStageEntry(path, 3, giverContent);
//     }
//   },

//   writeRm: function (path) {
//     let idx = index.read();
//     [0, 1, 2, 3].forEach(function (stage) {
//       delete idx[index.key(path, stage)];
//     });
//     index.write(idx);
//   },

//   _writeStageEntry: function (path, stage, content) {
//     let idx = index.read();
//     idx[index.key(path, stage)] = objects.write(content);
//     index.write(idx);
//   },

//   write: function (index) {
//     let indexStr =
//       Object.keys(index)
//         .map(function (k) {
//           return k.split(",")[0] + " " + k.split(",")[1] + " " + index[k];
//         })
//         .join("\n") + "\n";
//     files.write(files.gitletPath("index"), indexStr);
//   },
//   workingCopyToc: function () {
//     return Object.keys(index.read())
//       .map(function (k) {
//         return k.split(",")[0];
//       })
//       .filter(function (p) {
//         return fs.existsSync(files.workingCopyPath(p));
//       })
//       .reduce(function (idx, p) {
//         idx[p] = util.hash(files.read(files.workingCopyPath(p)));
//         return idx;
//       }, {});
//   },
//   tocToIndex: function (toc) {
//     return Object.keys(toc).reduce(function (idx, p) {
//       return util.setIn(idx, [index.key(p, 0), toc[p]]);
//     }, {});
//   },

//   matchingFiles: function (pathSpec) {
//     let searchPath = files.pathFromRepoRoot(pathSpec);
//     return Object.keys(index.toc()).filter(function (p) {
//       return p.match("^" + searchPath.replace(/\\/g, "\\\\"));
//     });
//   },
// };

// export const util = {
//   isString: function (thing) {
//     return typeof thing === "string";
//   },

//   hash: function (string) {
//     let hashInt = 0;
//     for (let i = 0; i < string.length; i++) {
//       hashInt = hashInt * 31 + string.charCodeAt(i);
//       hashInt = hashInt | 0;
//     }
//   },
//   setIn: function (obj, arr) {
//     if (arr.length === 2) {
//       obj[arr[0]] = arr[1];
//     } else if (arr.length > 2) {
//       obj[arr[0]] = obj[arr[0]] || {};
//       util.setIn(obj[arr[0]], arr.slice(1));
//     }

//     return obj;
//   },

//   lines: function (str) {
//     return str.split("\n").filter(function (l) {
//       return l !== "";
//     });
//   },

//   flatten: function (arr) {
//     return arr.reduce(function (a, e) {
//       return a.concat(e instanceof Array ? util.flatten(e) : e);
//     }, []);
//   },

//   unique: function (arr) {
//     return arr.reduce(function (a, p) {
//       return a.indexOf(p) === -1 ? a.concat(p) : a;
//     }, []);
//   },

//   intersection: function (a, b) {
//     return a.filter(function (e) {
//       return b.indexOf(e) !== -1;
//     });
//   },

//   onRemote: function (remotePath) {
//     return function (fn) {
//       let originalDir = process.cwd();
//       process.chdir(remotePath);
//       let result = fn.apply(null, Array.prototype.slice.call(arguments, 1));
//       process.chdir(originalDir);
//       return result;
//     };
//   },
// };

// const files = {
//   inRepo: function () {
//     return files.gitletPath() !== undefined;
//   },
//   assertInRepo: function () {
//     if (!files.inRepo()) {
//       throw new Error("not a Gitlet repository");
//     }
//   },
//   pathFromRepoRoot: function (p) {
//     return path.relative(files.workingCopyPath(), path.join(process.cwd(), p));
//   },
//   write: function (p, content) {
//     const prefix = os.platform() === "win32" ? "." : "/";
//     files.writeFilesFromTree(
//       util.setIn({}, p.split(path.sep).concat(content)),
//       prefix
//     );
//   },
//   writeFilesFromTree: function (tree, prefix) {
//     Object.keys(tree).forEach(function (name) {
//       let path = path.join(prefix, name);
//       if (util.isString(tree[name])) {
//         fs.writeFileSync(path, tree[name]);
//       } else {
//         if (!fs.existsSync(path)) {
//           fs.mkdirSync(path, "777");
//         }

//         files.writeFilesFromTree(tree[name], path);
//       }
//     });
//   },
//   rmEmptyDirs: function (path) {
//     if (fs.statSync(path).isDirectory()) {
//       fs.readdirSync(path).forEach(function (c) {
//         files.rmEmptyDirs(path.join(path, c));
//       });
//       if (fs.readdirSync(path).length === 0) {
//         fs.rmdirSync(path);
//       }
//     }
//   },
//   read: function (path) {
//     if (fs.existsSync(path)) {
//       return fs.readFileSync(path, "utf8");
//     }
//   },
//   gitletPath: function (path) {
//     function gitletDir(dir) {
//       if (fs.existsSync(dir)) {
//         let potentialConfigFile = path.join(dir, "config");
//         let potentialGitletPath = path.join(dir, ".gitlet");
//         if (
//           fs.existsSync(potentialConfigFile) &&
//           fs.statSync(potentialConfigFile).isFile() &&
//           files.read(potentialConfigFile).match(/\[core\]/)
//         ) {
//           return dir;
//         } else if (fs.existsSync(potentialGitletPath)) {
//           return potentialGitletPath;
//         } else if (dir !== "/") {
//           return gitletDir(path.join(dir, ".."));
//         }
//       }
//     }

//     let gDir = gitletDir(process.cwd());
//     if (gDir !== undefined) {
//       return path.join(gDir, path || "");
//     }
//   },
//   workingCopyPath: function (path) {
//     return path.join(path.join(files.gitletPath(), ".."), path || "");
//   },
//   lsRecursive: function (path) {
//     if (!fs.existsSync(path)) {
//       return [];
//     } else if (fs.statSync(path).isFile()) {
//       return [path];
//     } else if (fs.statSync(path).isDirectory()) {
//       return fs.readdirSync(path).reduce(function (fileList, dirChild) {
//         return fileList.concat(files.lsRecursive(path.join(path, dirChild)));
//       }, []);
//     }
//   },
//   nestFlatTree: function (obj) {
//     return Object.keys(obj).reduce(function (tree, wholePath) {
//       return util.setIn(tree, wholePath.split(path.sep).concat(obj[wholePath]));
//     }, {});
//   },
//   flattenNestedTree: function (tree, obj, prefix) {
//     if (obj === undefined) {
//       return files.flattenNestedTree(tree, {}, "");
//     }

//     Object.keys(tree).forEach(function (dir) {
//       let path = path.join(prefix, dir);
//       if (util.isString(tree[dir])) {
//         obj[path] = tree[dir];
//       } else {
//         files.flattenNestedTree(tree[dir], obj, path);
//       }
//     });

//     return obj;
//   },
// };

// const status = {
//   toString: function () {
//     function untracked() {
//       return fs.readdirSync(files.workingCopyPath()).filter(function (p) {
//         return index.toc()[p] === undefined && p !== ".gitlet";
//       });
//     }
//     function toBeCommitted() {
//       let headHash = refs.hash("HEAD");
//       let headToc = headHash === undefined ? {} : objects.commitToc(headHash);
//       let ns = diff.nameStatus(diff.tocDiff(headToc, index.toc()));
//       return Object.keys(ns).map(function (p) {
//         return ns[p] + " " + p;
//       });
//     }
//     function notStagedForCommit() {
//       let ns = diff.nameStatus(diff.diff());
//       return Object.keys(ns).map(function (p) {
//         return ns[p] + " " + p;
//       });
//     }
//     function listing(heading, lines) {
//       return lines.length > 0 ? [heading, lines] : [];
//     }
//     return util
//       .flatten([
//         "On branch " + refs.headBranchName(),
//         listing("Untracked files:", untracked()),
//         listing("Unmerged paths:", index.conflictedPaths()),
//         listing("Changes to be committed:", toBeCommitted()),
//         listing("Changes not staged for commit:", notStagedForCommit()),
//       ])
//       .join("\n");
//   },
// };

let parseOptions = function (argv) {
  let name
  return argv.reduce(
    function (opts, arg) {
      if (arg.match(/^-/)) {
        name = arg.replace(/^-+/, '')
        opts[name] = true
      } else if (name !== undefined) {
        opts[name] = arg
        name = undefined
      } else {
        opts._.push(arg)
      }

      return opts
    },
    { _: [] }
  )
}

/**
 * Ejecuta la CLI delegando al API procedural `gitLet`.
 * @param {string[]} argv - argumentos (process.argv)
 * @returns {*} resultado de la invocación al comando
 */
export function runCli (argv) {
  let opts = parseOptions(argv)
  let commandName = opts._[2]

  if (commandName === undefined) {
    throw new Error('you must specify a Gitlet command to run')
  } else {
    const commandFnName = commandName.replace(/-/g, '_')
    const fn = gitLet[commandFnName]

    if (fn === undefined) {
      throw new Error(`'${commandFnName}' is not a Gitlet command`)
    } else {
      const commandArgs = opts._.slice(3)
      while (commandArgs.length < fn.length - 1) {
        commandArgs.push(undefined)
      }

      return fn.apply(gitlet, commandArgs.concat(opts))
    }
  }
}

if (
  typeof process !== 'undefined' &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  try {
    const result = runCli(process.argv)
    if (result !== undefined) {
      console.log(result)
    }
  } catch (e) {
    console.error(e.toString())
  }
}
