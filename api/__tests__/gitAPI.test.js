import { createGitlet } from "../gitAPI.js";

describe("gitAPI (dependency injection)", () => {
  test("add: stages files returned by files.lsRecursive", () => {
    const mockFiles = {
      assertInRepo: jest.fn(),
      lsRecursive: jest.fn().mockReturnValue(["a.txt"]),
      pathFromRepoRoot: jest.fn().mockReturnValue("a.txt"),
    };

    const mockConfig = { assertNotBare: jest.fn() };

    const ctx = { files: mockFiles, config: mockConfig };
    const api = createGitlet(ctx);

    api.update_index = jest.fn();

    api.add("somepath");

    expect(api.update_index).toHaveBeenCalledWith("a.txt", { add: true });
    expect(mockFiles.assertInRepo).toHaveBeenCalled();
    expect(mockConfig.assertNotBare).toHaveBeenCalled();
  });

  test("rm: throws when no matching files", () => {
    const mockFiles = {
      assertInRepo: jest.fn(),
      pathFromRepoRoot: jest.fn().mockReturnValue("x"),
    };
    const mockConfig = { assertNotBare: jest.fn() };
    const mockIndex = { matchingFiles: jest.fn().mockReturnValue([]) };

    const api = createGitlet({
      files: mockFiles,
      config: mockConfig,
      index: mockIndex,
    });

    expect(() => api.rm("missing")).toThrow(/not found/);
  });

  test("fetch: throws when remote not configured", () => {
    const mockFiles = { assertInRepo: jest.fn() };
    const mockConfig = { read: jest.fn().mockReturnValue({ remote: {} }) };

    const api = createGitlet({ files: mockFiles, config: mockConfig });

    expect(() => api.fetch("origin", "master")).toThrow(
      /does not appear to be a git repository/
    );
  });

  test("merge: fast-forward path calls writeFastForwardMerge", () => {
    const mockFiles = { assertInRepo: jest.fn() };
    const mockConfig = {
      assertNotBare: jest.fn(),
      read: jest.fn().mockReturnValue({ remote: {} }),
    };

    const mockRefs = {
      hash: jest.fn().mockImplementation((n) => (n === "HEAD" ? "r1" : "r2")),
      isHeadDetached: jest.fn().mockReturnValue(false),
    };
    const mockObjects = {
      type: jest.fn().mockReturnValue("commit"),
      read: jest.fn(),
      isUpToDate: jest.fn().mockReturnValue(false),
    };
    const mockDiff = {
      changedFilesCommitWouldOverwrite: jest.fn().mockReturnValue([]),
    };
    const mockMerge = {
      canFastForward: jest.fn().mockReturnValue(true),
      writeFastForwardMerge: jest.fn(),
    };

    const api = createGitlet({
      files: mockFiles,
      config: mockConfig,
      refs: mockRefs,
      objects: mockObjects,
      diff: mockDiff,
      merge: mockMerge,
    });

    const res = api.merge("other");

    expect(mockMerge.writeFastForwardMerge).toHaveBeenCalled();
    expect(res).toBe("Fast-forward");
  });

  test("commit: throws when merge in progress with unmerged files", () => {
    const mockFiles = {
      assertInRepo: jest.fn(),
      read: jest.fn(),
      gitletPath: jest.fn(),
    };
    const mockConfig = { assertNotBare: jest.fn() };
    const mockRefs = { hash: jest.fn().mockReturnValue(undefined) };
    const mockIndex = { conflictedPaths: jest.fn().mockReturnValue(["a"]) };
    const mockMerge = { isMergeInProgress: jest.fn().mockReturnValue(true) };

    const api = createGitlet({
      files: mockFiles,
      config: mockConfig,
      refs: mockRefs,
      index: mockIndex,
      merge: mockMerge,
    });

    expect(() => api.commit({ m: "msg" })).toThrow(/cannot commit/);
  });
});
