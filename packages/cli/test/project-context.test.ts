import { describe, expect, test } from "bun:test";
import type { Project } from "@pocketpatch/storage";
import {
  ProjectContextNotFoundError,
  resolveProjectForCwd,
} from "../src/project-context";

const project = (id: number, path: string): Project => ({
  createdAt: "2026-05-31T12:00:00.000Z",
  id,
  lastSeenAt: "2026-05-31T12:00:00.000Z",
  path,
});

describe("project context", () => {
  test("resolves the deepest registered project containing the current directory", () => {
    const result = resolveProjectForCwd(
      [
        project(1, "/home/k/code"),
        project(2, "/home/k/code/pocketpatch"),
        project(3, "/home/k/code/pocketpatch/apps/web"),
      ],
      "/home/k/code/pocketpatch/apps/web/src/routes",
    );

    expect(result).toEqual(project(3, "/home/k/code/pocketpatch/apps/web"));
  });

  test("matches exact project paths and ignores sibling prefixes", () => {
    expect(
      resolveProjectForCwd(
        [project(1, "/home/k/code/pocketpatch")],
        "/home/k/code/pocketpatch",
      ),
    ).toEqual(project(1, "/home/k/code/pocketpatch"));

    expect(
      resolveProjectForCwd(
        [project(1, "/home/k/code/pocketpatch")],
        "/home/k/code/pocketpatch-other",
      ),
    ).toBeInstanceOf(ProjectContextNotFoundError);
  });
});
