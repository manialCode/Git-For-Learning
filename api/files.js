import fs from 'fs'
import path from 'path'
import os from 'os'
import { util } from './gitAPI.js'

/**
 * Files helper: utilities for working copy and .gitlet tree.
 * Public API: inRepo, assertInRepo, pathFromRepoRoot, write, writeFilesFromTree,
 * rmEmptyDirs, read, gitletPath, workingCopyPath, lsRecursive, nestFlatTree,
 * flattenNestedTree
 */
const files = {
  inRepo: () => files.gitletPath() !== undefined,

  assertInRepo: () => {
    if (!files.inRepo()) throw new Error('not a Gitlet repository')
  },

  pathFromRepoRoot: p =>
    path.relative(files.workingCopyPath(), path.join(process.cwd(), p)),

  write: (p, content) => {
    const prefix = os.platform() === 'win32' ? '.' : '/'
    files.writeFilesFromTree(
      util.setIn({}, p.split(path.sep).concat(content)),
      prefix
    )
  },

  writeFilesFromTree: (tree, prefix = '') => {
    Object.entries(tree).forEach(([name, value]) => {
      const filePath = path.join(prefix, name)
      if (util.isString(value)) {
        fs.writeFileSync(filePath, value)
      } else {
        if (!fs.existsSync(filePath)) {
          fs.mkdirSync(filePath, { recursive: true, mode: 0o777 })
        }
        files.writeFilesFromTree(value, filePath)
      }
    })
  },

  rmEmptyDirs: dir => {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return
    fs.readdirSync(dir).forEach(c => files.rmEmptyDirs(path.join(dir, c)))
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
  },

  read: p => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : undefined),

  gitletPath: p => {
    const gitletDir = dir => {
      if (!fs.existsSync(dir)) return
      const potentialConfigFile = path.join(dir, 'config')
      const potentialGitletPath = path.join(dir, '.gitlet')
      if (
        fs.existsSync(potentialConfigFile) &&
        fs.statSync(potentialConfigFile).isFile() &&
        files.read(potentialConfigFile).includes('[core]')
      ) {
        return dir
      }
      if (fs.existsSync(potentialGitletPath)) return potentialGitletPath
      if (dir !== path.parse(dir).root) return gitletDir(path.join(dir, '..'))
    }

    const gDir = gitletDir(process.cwd())
    return gDir ? path.join(gDir, p || '') : undefined
  },

  workingCopyPath: p => path.join(files.gitletPath(), '..', p || ''),

  lsRecursive: p => {
    if (!fs.existsSync(p)) return []
    if (fs.statSync(p).isFile()) return [p]
    if (fs.statSync(p).isDirectory()) {
      return fs
        .readdirSync(p)
        .flatMap(dirChild => files.lsRecursive(path.join(p, dirChild)))
    }
    return []
  },

  nestFlatTree: obj =>
    Object.keys(obj).reduce(
      (tree, wholePath) =>
        util.setIn(tree, wholePath.split(path.sep).concat(obj[wholePath])),
      {}
    ),

  flattenNestedTree: (tree, obj = {}, prefix = '') => {
    Object.entries(tree).forEach(([dir, val]) => {
      const p = path.join(prefix, dir)
      if (util.isString(val)) obj[p] = val
      else files.flattenNestedTree(val, obj, p)
    })
    return obj
  }
}

export default files
