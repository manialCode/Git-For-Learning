/**
 * Reference helpers (heads, remote refs, FETCH_HEAD parsing, etc.).
 * Public API: isRef, terminalRef, hash, isHeadDetached, isCheckedOut,
 * toLocalRef, toRemoteRef, write, rm, fetchHeadBranchToMerge, localHeads,
 * exists, headBranchName, commitParentHashes
 */
const refs = {
  // Validate if a string is a recognized ref name
  isRef(ref) {
    if (typeof ref !== "string") return false;
    return (
      /^refs\/heads\/[A-Za-z-]+$/.test(ref) ||
      /^refs\/remotes\/[A-Za-z-]+\/[A-Za-z-]+$/.test(ref) ||
      ["HEAD", "FETCH_HEAD", "MERGE_HEAD"].includes(ref)
    );
  },

  // Convert a user-supplied ref or special name to the terminal ref path
  terminalRef(ref) {
    if (ref === "HEAD" && !refs.isHeadDetached()) {
      const content = files.read(files.gitletPath("HEAD"));
      const m = content && content.match(/ref: (refs\/heads\/.+)/);
      return m ? m[1] : null;
    }

    return refs.isRef(ref) ? ref : refs.toLocalRef(ref);
  },

  // Resolve either a raw hash or a ref name to a hash string
  hash(refOrHash) {
    if (objects.exists(refOrHash)) return refOrHash;

    const terminalRef = refs.terminalRef(refOrHash);
    if (terminalRef === "FETCH_HEAD") {
      return refs.fetchHeadBranchToMerge(refs.headBranchName());
    }

    if (terminalRef && refs.exists(terminalRef)) {
      return files.read(files.gitletPath(terminalRef));
    }

    return undefined;
  },

  // Is HEAD pointing directly at a commit (detached) or at a branch ref?
  isHeadDetached() {
    const head = files.read(files.gitletPath("HEAD")) || "";
    return !head.startsWith("ref: ");
  },

  isCheckedOut(branch) {
    return !config.isBare() && refs.headBranchName() === branch;
  },

  toLocalRef(name) {
    return `refs/heads/${name}`;
  },

  toRemoteRef(remote, name) {
    return `refs/remotes/${remote}/${name}`;
  },

  write(ref, content) {
    if (!refs.isRef(ref)) return;
    files.write(files.gitletPath(path.normalize(ref)), content);
  },

  rm(ref) {
    if (!refs.isRef(ref)) return;
    const p = files.gitletPath(ref);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  },

  // Parse FETCH_HEAD to find the hash for the branch to merge
  fetchHeadBranchToMerge(branchName) {
    const content = files.read(files.gitletPath("FETCH_HEAD")) || "";
    const lines = util.lines(content);
    const regex = new RegExp(`^([^ ]+) .* branch ${branchName} of`);
    const entry = lines.find((line) => regex.test(line));
    return entry ? entry.match(/^([^ ]+)/)[1] : undefined;
  },

  localHeads() {
    const dir = path.join(files.gitletPath(), "refs", "heads");
    if (!fs.existsSync(dir)) return {};
    return fs
      .readdirSync(dir)
      .reduce((acc, name) => util.setIn(acc, [name, refs.hash(name)]), {});
  },

  exists(ref) {
    return refs.isRef(ref) && fs.existsSync(files.gitletPath(ref));
  },

  headBranchName() {
    if (refs.isHeadDetached()) return undefined;
    const content = files.read(files.gitletPath("HEAD")) || "";
    const m = content.match(/refs\/heads\/(.+)/);
    return m ? m[1] : undefined;
  },

  // Return parent hashes used when creating a commit
  commitParentHashes() {
    const headHash = refs.hash("HEAD");

    if (
      merge &&
      typeof merge.isMergeInProgress === "function" &&
      merge.isMergeInProgress()
    ) {
      return [headHash, refs.hash("MERGE_HEAD")];
    }
    if (headHash === undefined) return [];
    return [headHash];
  },
};

// Backwards-compatibility: older code may call commitParents()
refs.commitParents = refs.commitParentHashes;

export default refs;
