import type { Project } from "@pocketpatch/storage";
import { Data } from "effect";

export class ProjectContextNotFoundError extends Data.TaggedError(
  "ProjectContextNotFoundError",
)<{
  readonly cwd: string;
}> {
  override get message(): string {
    return `No registered PocketPatch project contains ${this.cwd}. Run pocketpatch register from the project first, or pass --project.`;
  }
}

const normalizePath = (path: string): string => {
  if (path === "/") {
    return path;
  }

  return path.replace(/\/+$/, "");
};

const containsPath = (parent: string, child: string): boolean => {
  const normalizedParent = normalizePath(parent);
  const normalizedChild = normalizePath(child);

  return (
    normalizedChild === normalizedParent ||
    normalizedChild.startsWith(`${normalizedParent}/`)
  );
};

export const resolveProjectForCwd = (
  projects: ReadonlyArray<Project>,
  cwd: string,
): Project | ProjectContextNotFoundError => {
  const normalizedCwd = normalizePath(cwd);
  const match = projects
    .filter((project) => containsPath(project.path, normalizedCwd))
    .sort((left, right) => right.path.length - left.path.length)[0];

  return match ?? new ProjectContextNotFoundError({ cwd });
};
