/**
 * Status helper: produce a human-readable summary of the working tree.
 * Public API: toString()
 */
const status = {
  toString: () => {
    const untracked = () => {
      const wc = files.workingCopyPath()
      if (!fs.existsSync(wc)) return []
      return fs
        .readdirSync(wc)
        .filter(p => index.toc()[p] === undefined && p !== '.gitlet')
    }

    const toBeCommitted = () => {
      const headHash = refs.hash('HEAD')
      const headToc = headHash === undefined ? {} : objects.commitToc(headHash)
      const ns = diff.nameStatus(diff.tocDiff(headToc, index.toc()))
      return Object.keys(ns).map(p => `${ns[p]} ${p}`)
    }

    const notStagedForCommit = () => {
      const ns = diff.nameStatus(diff.diff())
      return Object.keys(ns).map(p => `${ns[p]} ${p}`)
    }

    const listing = (heading, lines) =>
      lines.length > 0 ? [heading, lines] : []

    return util
      .flatten([
        `On branch ${refs.headBranchName()}`,
        listing('Untracked files:', untracked()),
        listing('Unmerged paths:', index.conflictedPaths()),
        listing('Changes to be committed:', toBeCommitted()),
        listing('Changes not staged for commit:', notStagedForCommit())
      ])
      .join('\n')
  }
}

export default status
